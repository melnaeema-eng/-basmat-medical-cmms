-- Sprint 12: Notification Center & Action Inbox.
-- Notifications are derived from current authoritative records.
-- Only read/unread state is persisted.
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=11)
 or to_regclass('public.bf11_approvals') is null
 or to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 then raise exception 'Install and verify Sprint 11 first';end if;
 if exists(select 1 from public.bf_migrations where version=12)
 then raise exception 'Sprint 12 already installed';end if;
end $$;

insert into public.bf_permissions(code,description)
values ('notifications.view','View operational notifications')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where r.code in('company_admin','facility_manager','maintenance_manager','supervisor','technician','help_desk','store_keeper')
 and p.code='notifications.view'
on conflict do nothing;

create table public.bf12_notification_reads(
 user_id uuid not null references public.bf_profiles(id),
 notification_key text not null check(length(notification_key) between 3 and 180),
 read_at timestamptz not null default now(),
 primary key(user_id,notification_key)
);

alter table public.bf12_notification_reads enable row level security;
revoke all on public.bf12_notification_reads from public,anon,authenticated;
grant select on public.bf12_notification_reads to authenticated;
create policy bf12_reads_self on public.bf12_notification_reads
for select to authenticated using(user_id=auth.uid());

create or replace function public.bf12_feed(
 p_unread_only boolean default false,
 p_limit integer default 100,
 p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC'
as $$
declare
 payload jsonb;
begin
 if auth.uid() is null or not exists(
  select 1 from public.bf_profiles where id=auth.uid() and status='active')
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 200
 or p_offset is null or p_offset not between 0 and 10000
 then raise exception 'Invalid pagination';end if;

 with raw as (
  select
   'approval:'||a.id::text notification_key,
   a.organization_id,a.client_id,
   case when a.status='pending' then 'approval_pending'
        when a.status='rejected' then 'approval_rejected'
        else 'approval_decided' end kind,
   case when a.status='pending' then 'high' else 'normal' end severity,
   a.subject title,
   coalesce(a.decision_comment,a.request_comment,'') body,
   a.requested_at occurred_at,
   '/approvals'::text action_url
  from public.bf11_approvals a
  where public.bf11_can_view(a.organization_id,a.client_id)
    and (
      (a.status='pending' and (
        (a.reviewer_type='owner' and public.bf11_owner(a.organization_id,a.client_id))
        or (a.reviewer_type='consultant' and public.bf11_consultant(a.organization_id,a.client_id))
        or public.bf4_staff(a.organization_id,'approvals.manage')
      ))
      or (a.status='rejected' and public.bf4_staff(a.organization_id,'approvals.manage'))
      or (a.status='approved' and a.requested_by=auth.uid())
    )

  union all

  select
   'wo:'||w.id::text||':'||coalesce(w.sla_status,'')||':'||w.status,
   w.organization_id,w.client_id,
   case when w.sla_status='breached' then 'sla_breached'
        when w.status='assigned' and public.bf4_assigned(w.id) then 'work_order_assigned'
        when w.status='on_hold' then 'work_order_on_hold'
        else 'work_order_due' end,
   case when w.sla_status='breached' then 'critical'
        when w.priority in('P1','P2') then 'high' else 'normal' end,
   w.work_order_number||' - '||w.title,
   coalesce(w.hold_reason,w.description,''),
   coalesce(w.updated_at,w.created_at),
   '/corrective/work_order/'||w.id::text
  from public.bf_work_orders w
  where w.status not in('closed','cancelled')
   and (public.bf4_staff(w.organization_id,'corrective.manage') or public.bf4_assigned(w.id))
   and (
    w.sla_status='breached'
    or (w.status='assigned' and public.bf4_assigned(w.id))
    or w.status='on_hold'
    or (w.completion_due_at is not null and w.completion_due_at<=now()+interval '24 hours')
   )

  union all

  select
   'ppm:'||j.id::text||':'||j.status,
   j.organization_id,j.client_id,
   case when j.due_date<current_date then 'ppm_overdue' else 'ppm_due' end,
   case when j.due_date<current_date then 'high' else 'normal' end,
   j.job_number,
   'PPM due '||j.due_date::text,
   j.created_at,
   '/ppm/job/'||j.id::text
  from public.bf_ppm_jobs j
  where j.status not in('closed','cancelled','approved')
    and j.due_date<=current_date+1
    and (
      public.bf4_staff(j.organization_id,'ppm.manage')
      or (j.assigned_to=auth.uid() and public.bf4_staff(j.organization_id,'ppm.execute'))
    )
 ),
 dedup as (
  select distinct on(notification_key) *
  from raw order by notification_key,occurred_at desc
 ),
 marked as (
  select d.*,(rr.notification_key is not null) is_read,rr.read_at
  from dedup d
  left join public.bf12_notification_reads rr
    on rr.user_id=auth.uid() and rr.notification_key=d.notification_key
 ),
 filtered as (
  select * from marked where not p_unread_only or not is_read
 )
 select jsonb_build_object(
   'total',(select count(*) from marked),
   'unread',(select count(*) from marked where not is_read),
   'items',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from filtered order by
       case severity when 'critical' then 1 when 'high' then 2 else 3 end,
       occurred_at desc,notification_key
       limit p_limit offset p_offset
   ) x),'[]'::jsonb),
   'limit',p_limit,'offset',p_offset,
   'has_more',(select count(*) from filtered)>p_offset+p_limit
 ) into payload;
 return payload;
end $$;

revoke all on function public.bf12_feed(boolean,integer,integer) from public,anon;
grant execute on function public.bf12_feed(boolean,integer,integer) to authenticated;

create or replace function public.bf12_read(
 p_key text,p_read boolean default true)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not exists(
  select 1 from public.bf_profiles where id=auth.uid() and status='active')
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 3 and 180
 then raise exception 'Invalid notification key';end if;

 if p_read then
  insert into public.bf12_notification_reads(user_id,notification_key,read_at)
  values(auth.uid(),p_key,now())
  on conflict(user_id,notification_key) do update set read_at=excluded.read_at;
 else
  delete from public.bf12_notification_reads
  where user_id=auth.uid() and notification_key=p_key;
 end if;
end $$;
revoke all on function public.bf12_read(text,boolean) from public,anon;
grant execute on function public.bf12_read(text,boolean) to authenticated;

create or replace function public.bf12_mark_all_read()
returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb;feed jsonb;n integer:=0;
begin
 feed:=public.bf12_feed(false,200,0);
 for item in select * from jsonb_array_elements(feed->'items') loop
  insert into public.bf12_notification_reads(user_id,notification_key,read_at)
  values(auth.uid(),item->>'notification_key',now())
  on conflict(user_id,notification_key) do update set read_at=excluded.read_at;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.bf12_mark_all_read() from public,anon;
grant execute on function public.bf12_mark_all_read() to authenticated;

insert into public.bf_migrations(version) values(12);
commit;
