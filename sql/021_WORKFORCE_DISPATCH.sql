-- Basmat Facilities CMMS — Sprint 20
-- Workforce Scheduling & Dispatch Board
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=19)
 then raise exception 'Install and verify Sprint 19 first'; end if;
 if exists(select 1 from public.bf_migrations where version=20)
 then raise exception 'Sprint 20 already installed'; end if;
 if to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_ppm_jobs') is null
 or to_regclass('public.bf_profiles') is null
 then raise exception 'Required workforce sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description) values
 ('workforce.view','View workforce scheduling and dispatch board'),
 ('workforce.manage','Create, reschedule and cancel workforce bookings')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code like 'workforce.%')
 or (r.code='supervisor' and p.code like 'workforce.%')
 or (r.code='technician' and p.code='workforce.view')
on conflict do nothing;

create table public.bf20_dispatch_slots(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 task_type text not null check(task_type in('work_order','ppm_job')),
 task_id uuid not null,
 technician_id uuid not null references public.bf_profiles(id),
 scheduled_start timestamptz not null,
 scheduled_end timestamptz not null,
 status text not null default 'scheduled' check(status in('scheduled','cancelled','completed')),
 notes text not null default '',
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 cancelled_by uuid references auth.users(id),
 cancelled_at timestamptz,
 cancel_reason text,
 check(scheduled_end>scheduled_start),
 check(scheduled_end-scheduled_start<=interval '24 hours'),
 check((status='cancelled')=(cancelled_at is not null))
);

create index bf20_slot_technician_time
on public.bf20_dispatch_slots(organization_id,technician_id,scheduled_start,scheduled_end)
where status='scheduled';

create index bf20_slot_task
on public.bf20_dispatch_slots(task_type,task_id,status);

alter table public.bf20_dispatch_slots enable row level security;
revoke all on public.bf20_dispatch_slots from public,anon,authenticated;
grant select on public.bf20_dispatch_slots to authenticated;

create or replace function public.bf20_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select public.bf4_staff(p_org,p_permission); $$;

create policy bf20_slot_read on public.bf20_dispatch_slots
for select to authenticated
using(public.bf20_can(organization_id,'workforce.view'));

create or replace function public.bf20_schedule(
 p_task_type text,
 p_task_id uuid,
 p_technician uuid,
 p_start timestamptz,
 p_end timestamptz,
 p_notes text default '',
 p_sync_assignment boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 org uuid;
 sid uuid;
 task_status text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_task_type not in('work_order','ppm_job') then raise exception 'Invalid task type'; end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '24 hours'
 then raise exception 'Invalid schedule window'; end if;
 if p_start<now()-interval '1 day' then raise exception 'Schedule cannot start in the distant past'; end if;

 if p_task_type='work_order' then
   select organization_id,status into org,task_status
   from public.bf_work_orders where id=p_task_id;
   if not found then raise exception 'Work order not found'; end if;
   if task_status in('completed','approved','closed','cancelled')
   then raise exception 'Work order is not schedulable'; end if;
 else
   select organization_id,status into org,task_status
   from public.bf_ppm_jobs where id=p_task_id;
   if not found then raise exception 'PPM job not found'; end if;
   if task_status in('completed','approved','closed','cancelled')
   then raise exception 'PPM job is not schedulable'; end if;
 end if;

 if not public.bf20_can(org,'workforce.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 if p_task_type='work_order' and not public.bf4_user_can(p_technician,org,'corrective.execute')
 then raise exception 'Technician lacks corrective execution permission'; end if;
 if p_task_type='ppm_job' and not public.bf4_user_can(p_technician,org,'ppm.execute')
 then raise exception 'Technician lacks PPM execution permission'; end if;

 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||p_technician::text,0));

 if exists(
   select 1 from public.bf20_dispatch_slots s
   where s.organization_id=org
     and s.technician_id=p_technician
     and s.status='scheduled'
     and tstzrange(s.scheduled_start,s.scheduled_end,'[)')
         && tstzrange(p_start,p_end,'[)')
 )
 then raise exception 'Technician has a scheduling conflict'; end if;

 if exists(
   select 1 from public.bf20_dispatch_slots s
   where s.task_type=p_task_type and s.task_id=p_task_id and s.status='scheduled'
 )
 then raise exception 'Task already has an active schedule'; end if;

 insert into public.bf20_dispatch_slots(
  organization_id,task_type,task_id,technician_id,scheduled_start,scheduled_end,
  notes,created_by
 )
 values(
  org,p_task_type,p_task_id,p_technician,p_start,p_end,left(coalesce(p_notes,''),2000),auth.uid()
 )
 returning id into sid;

 if p_sync_assignment then
   if p_task_type='work_order' then
     perform public.bf4_action(
       'work_order',p_task_id,'assign',
       jsonb_build_object('user_id',p_technician,'replace',false)
     );
   else
     perform public.bf5_action(
       'job',p_task_id,'assign',
       jsonb_build_object('user_id',p_technician)
     );
   end if;
 end if;

 return sid;
end $$;

create or replace function public.bf20_reschedule(
 p_slot uuid,
 p_start timestamptz,
 p_end timestamptz,
 p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare s public.bf20_dispatch_slots;
begin
 select * into s from public.bf20_dispatch_slots where id=p_slot for update;
 if not found then raise exception 'Schedule not found'; end if;
 if s.status<>'scheduled' then raise exception 'Only active schedules can be changed'; end if;
 if not public.bf20_can(s.organization_id,'workforce.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '24 hours'
 then raise exception 'Invalid schedule window'; end if;

 perform pg_advisory_xact_lock(hashtextextended(s.organization_id::text||':'||s.technician_id::text,0));

 if exists(
  select 1 from public.bf20_dispatch_slots x
  where x.organization_id=s.organization_id
    and x.technician_id=s.technician_id
    and x.status='scheduled' and x.id<>s.id
    and tstzrange(x.scheduled_start,x.scheduled_end,'[)')
        && tstzrange(p_start,p_end,'[)')
 )
 then raise exception 'Technician has a scheduling conflict'; end if;

 update public.bf20_dispatch_slots
 set scheduled_start=p_start,scheduled_end=p_end,
     notes=case when p_notes is null then notes else left(p_notes,2000) end,
     updated_by=auth.uid(),updated_at=now()
 where id=s.id;
end $$;

create or replace function public.bf20_cancel(p_slot uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare s public.bf20_dispatch_slots;
begin
 select * into s from public.bf20_dispatch_slots where id=p_slot for update;
 if not found then raise exception 'Schedule not found'; end if;
 if s.status<>'scheduled' then raise exception 'Schedule is not active'; end if;
 if not public.bf20_can(s.organization_id,'workforce.manage')
 then raise exception 'Permission denied' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Cancellation reason is required'; end if;

 update public.bf20_dispatch_slots
 set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),
     cancel_reason=left(btrim(p_reason),1000),updated_by=auth.uid(),updated_at=now()
 where id=s.id;
end $$;

create or replace function public.bf20_complete(p_slot uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare s public.bf20_dispatch_slots;
begin
 select * into s from public.bf20_dispatch_slots where id=p_slot for update;
 if not found then raise exception 'Schedule not found'; end if;
 if s.status<>'scheduled' then raise exception 'Schedule is not active'; end if;
 if not(
   public.bf20_can(s.organization_id,'workforce.manage')
   or s.technician_id=auth.uid()
 ) then raise exception 'Permission denied' using errcode='42501'; end if;

 update public.bf20_dispatch_slots
 set status='completed',updated_by=auth.uid(),updated_at=now()
 where id=s.id;
end $$;

create or replace function public.bf20_board(
 p_org uuid default null,
 p_from timestamptz default date_trunc('day',now()),
 p_to timestamptz default (date_trunc('day',now())+interval '7 days'),
 p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>=p_to
 then raise exception 'Invalid date range'; end if;
 if p_to-p_from>interval '31 days'
 then raise exception 'Board range cannot exceed 31 days'; end if;
 if p_limit is null or p_limit not between 1 and 1000
 then raise exception 'Invalid limit'; end if;
 if p_org is not null and not public.bf20_can(p_org,'workforce.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with visible_orgs as (
  select distinct ur.organization_id
  from public.bf_user_roles ur
  where (p_org is null or ur.organization_id=p_org)
    and public.bf20_can(ur.organization_id,'workforce.view')
 ),
 technicians as (
  select distinct p.id,p.full_name,p.email,ur.organization_id,
   public.bf4_user_can(p.id,ur.organization_id,'corrective.execute') corrective_execute,
   public.bf4_user_can(p.id,ur.organization_id,'ppm.execute') ppm_execute
  from public.bf_profiles p
  join public.bf_user_roles ur on ur.user_id=p.id
  where p.status='active'
    and exists(select 1 from visible_orgs o where o.organization_id=ur.organization_id)
    and (
      public.bf4_user_can(p.id,ur.organization_id,'corrective.execute')
      or public.bf4_user_can(p.id,ur.organization_id,'ppm.execute')
    )
 ),
 slots as (
  select s.id,s.organization_id,s.task_type,s.task_id,s.technician_id,
    p.full_name,p.email,s.scheduled_start,s.scheduled_end,s.status,s.notes,
    case when s.task_type='work_order' then w.work_order_number else j.job_number end reference,
    case when s.task_type='work_order' then w.title else coalesce(a.name_en,a.name_ar,a.asset_tag) end title,
    case when s.task_type='work_order' then w.priority else 'PPM' end priority
  from public.bf20_dispatch_slots s
  join public.bf_profiles p on p.id=s.technician_id
  left join public.bf_work_orders w on s.task_type='work_order' and w.id=s.task_id
  left join public.bf_ppm_jobs j on s.task_type='ppm_job' and j.id=s.task_id
  left join public.bf_assets a on j.asset_id=a.id
  where s.status='scheduled'
    and s.scheduled_start<p_to and s.scheduled_end>p_from
    and exists(select 1 from visible_orgs o where o.organization_id=s.organization_id)
  order by s.scheduled_start
  limit p_limit
 ),
 unscheduled_wo as (
  select w.id,w.organization_id,'work_order'::text task_type,w.work_order_number reference,
    w.title,w.priority,w.status,w.completion_due_at due_at
  from public.bf_work_orders w
  where w.status in('draft','assigned','accepted','in_progress','on_hold')
    and exists(select 1 from visible_orgs o where o.organization_id=w.organization_id)
    and not exists(select 1 from public.bf20_dispatch_slots s
      where s.task_type='work_order' and s.task_id=w.id and s.status='scheduled')
  order by w.completion_due_at nulls last,w.created_at
  limit 200
 ),
 unscheduled_ppm as (
  select j.id,j.organization_id,'ppm_job'::text task_type,j.job_number reference,
    coalesce(a.name_en,a.name_ar,a.asset_tag) title,'PPM'::text priority,j.status,
    j.due_date::timestamptz due_at
  from public.bf_ppm_jobs j
  join public.bf_assets a on a.id=j.asset_id
  where j.status in('scheduled','assigned','in_progress')
    and exists(select 1 from visible_orgs o where o.organization_id=j.organization_id)
    and not exists(select 1 from public.bf20_dispatch_slots s
      where s.task_type='ppm_job' and s.task_id=j.id and s.status='scheduled')
  order by j.due_date,j.created_at
  limit 200
 ),
 workload as (
  select t.id technician_id,t.organization_id,t.full_name,t.email,
    count(s.id)::int bookings,
    round(coalesce(sum(extract(epoch from (s.scheduled_end-s.scheduled_start))/3600),0)::numeric,2) booked_hours
  from technicians t
  left join slots s on s.technician_id=t.id and s.organization_id=t.organization_id
  group by t.id,t.organization_id,t.full_name,t.email
 )
 select jsonb_build_object(
   'technicians',coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name) from technicians x),'[]'::jsonb),
   'slots',coalesce((select jsonb_agg(to_jsonb(x) order by x.scheduled_start) from slots x),'[]'::jsonb),
   'unscheduled',(
      coalesce((select jsonb_agg(to_jsonb(x)) from unscheduled_wo x),'[]'::jsonb)
      || coalesce((select jsonb_agg(to_jsonb(x)) from unscheduled_ppm x),'[]'::jsonb)
   ),
   'workload',coalesce((select jsonb_agg(to_jsonb(x) order by x.booked_hours desc,x.full_name) from workload x),'[]'::jsonb),
   'summary',jsonb_build_object(
      'technicians',(select count(*) from technicians),
      'bookings',(select count(*) from slots),
      'unscheduled_work_orders',(select count(*) from unscheduled_wo),
      'unscheduled_ppm',(select count(*) from unscheduled_ppm)
   )
 ) into result;

 return result;
end $$;

revoke all on function public.bf20_can(uuid,text),
 public.bf20_schedule(text,uuid,uuid,timestamptz,timestamptz,text,boolean),
 public.bf20_reschedule(uuid,timestamptz,timestamptz,text),
 public.bf20_cancel(uuid,text),
 public.bf20_complete(uuid),
 public.bf20_board(uuid,timestamptz,timestamptz,integer)
from public,anon;

grant execute on function public.bf20_can(uuid,text),
 public.bf20_schedule(text,uuid,uuid,timestamptz,timestamptz,text,boolean),
 public.bf20_reschedule(uuid,timestamptz,timestamptz,text),
 public.bf20_cancel(uuid,text),
 public.bf20_complete(uuid),
 public.bf20_board(uuid,timestamptz,timestamptz,integer)
to authenticated;

insert into public.bf_migrations(version) values(20);
commit;
