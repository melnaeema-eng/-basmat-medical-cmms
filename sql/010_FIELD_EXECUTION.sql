-- Sprint 9: Field execution and evidence foundation.
-- Additive migration; no changes to existing work-order status functions.
begin;
do $$
begin
 if not exists(select 1 from public.bf_migrations where version=8)
 or to_regclass('public.bf_work_order_assignments') is null
 or to_regclass('public.bf8_material_requests') is null
 or to_regclass('public.bf8_material_lines') is null
 or to_regclass('public.bf_inv_requests') is null
 then raise exception 'Install and verify Sprint 8 first'; end if;
 if exists(select 1 from public.bf_migrations where version=9)
 then raise exception 'Sprint 9 already installed'; end if;
end $$;

create table public.bf9_visits(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 work_order_id uuid not null,
 technician_id uuid not null references auth.users(id),
 visit_number text not null,
 status text not null default 'open' check(status in('open','finished','cancelled')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 diagnosis text,work_performed text,tests_performed text,notes text,
 cancellation_reason text,
 created_at timestamptz not null default now(),
 unique(organization_id,visit_number),unique(id,organization_id),
 foreign key(work_order_id) references public.bf_work_orders(id),
 check(finished_at is null or finished_at>=started_at)
);
create unique index bf9_one_open_visit on public.bf9_visits(technician_id)
where status='open';
create index bf9_visits_wo on public.bf9_visits(work_order_id,started_at desc);
create table public.bf9_labor(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 visit_id uuid not null,
 technician_id uuid not null references auth.users(id),
 started_at timestamptz not null,
 ended_at timestamptz not null,
 minutes integer generated always as
  ((extract(epoch from (ended_at-started_at))/60)::integer) stored,
 activity text not null check(length(btrim(activity))>=5),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(id,organization_id),
 foreign key(visit_id,organization_id) references public.bf9_visits(id,organization_id),
 check(ended_at>started_at),
 check(ended_at-started_at<=interval '24 hours')
);
create index bf9_labor_visit on public.bf9_labor(visit_id,started_at);
create table public.bf9_evidence(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 work_order_id uuid not null,
 visit_id uuid,
 uploaded_by uuid not null references auth.users(id),
 file_name text not null,
 object_path text not null unique,
 mime_type text not null,
 file_size bigint not null check(file_size>0 and file_size<=10485760),
 caption text not null default '',
 status text not null default 'pending' check(status in('pending','ready','failed')),
 created_at timestamptz not null default now(),verified_at timestamptz,
 unique(id,organization_id),
 foreign key(work_order_id) references public.bf_work_orders(id),
 foreign key(visit_id,organization_id) references public.bf9_visits(id,organization_id)
);
create table public.bf9_events(
 id bigint generated always as identity primary key,
 organization_id uuid not null,
 work_order_id uuid not null,
 visit_id uuid,
 actor_id uuid not null references auth.users(id),
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create sequence public.bf9_visit_seq;
revoke all on sequence public.bf9_visit_seq from public,anon,authenticated;

create or replace function public.bf9_can(p_wo uuid,p_execute boolean default false)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.bf_work_orders w
  where w.id=p_wo and
  (public.bf4_staff(w.organization_id,'corrective.manage')
   or (public.bf4_staff(w.organization_id,'corrective.execute')
    and public.bf4_assigned(w.id)))
  and (not p_execute or
    (public.bf4_staff(w.organization_id,'corrective.execute')
     and public.bf4_assigned(w.id)))
 );
$$;
create or replace function public.bf9_view(p_wo uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.bf_work_orders w where w.id=p_wo
  and (public.bf4_staff(w.organization_id,'corrective.view')
   or public.bf4_client(w.organization_id,w.client_id)));
$$;
revoke all on function public.bf9_can(uuid,boolean),public.bf9_view(uuid) from public,anon;
grant execute on function public.bf9_can(uuid,boolean),public.bf9_view(uuid) to authenticated;

do $$ declare t text;
begin
 foreach t in array array['bf9_visits','bf9_labor','bf9_evidence','bf9_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy bf9_visits_read on public.bf9_visits for select to authenticated
using(public.bf9_can(work_order_id));
create policy bf9_labor_read on public.bf9_labor for select to authenticated
using(exists(select 1 from public.bf9_visits v where v.id=visit_id and public.bf9_can(v.work_order_id)));
create policy bf9_evidence_read on public.bf9_evidence for select to authenticated
using(public.bf9_can(work_order_id));
create policy bf9_events_read on public.bf9_events for select to authenticated
using(public.bf9_can(work_order_id));

-- Separate private bucket; files cannot be uploaded directly by the browser.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bf9-evidence','bf9-evidence',false,10485760,
 array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;
do $$
begin
 if not exists(select 1 from storage.buckets where id='bf9-evidence'
  and public=false and file_size_limit<=10485760)
 then raise exception 'Evidence bucket must be private with a 10 MB limit';end if;
end $$;

create or replace function public.bf9_action(
 p_action text,p_wo uuid,p_id uuid default null,p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare w public.bf_work_orders;v public.bf9_visits;e public.bf9_evidence;
 result_id uuid;start_time timestamptz;end_time timestamptz;actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.bf_profiles where id=actor and status='active')
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>32768
 then raise exception 'Invalid payload';end if;
 select * into w from public.bf_work_orders where id=p_wo;
 if not found then raise exception 'Work order not found';end if;
 if not public.bf9_can(p_wo) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_action='start_visit' then
  if not public.bf9_can(p_wo,true) or w.status not in('accepted','in_progress')
  then raise exception 'Assigned technician and active work order required';end if;
  insert into public.bf9_visits(organization_id,work_order_id,technician_id,visit_number)
  values(w.organization_id,w.id,actor,'VIS-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf9_visit_seq')::text,6,'0'))
  returning * into v;
  result_id:=v.id;
 elsif p_action in('finish_visit','cancel_visit','labor') then
  select * into v from public.bf9_visits where id=p_id and work_order_id=p_wo for update;
  if not found then raise exception 'Visit not found';end if;
  if v.technician_id<>actor and not public.bf4_staff(w.organization_id,'corrective.manage')
  then raise exception 'Permission denied' using errcode='42501';end if;
  if p_action='labor' then
   if v.status<>'open' then raise exception 'Visit is not open';end if;
   start_time:=(p_data->>'started_at')::timestamptz;
   end_time:=(p_data->>'ended_at')::timestamptz;
   if start_time is null or end_time is null or start_time<v.started_at
    or end_time<=start_time or end_time>clock_timestamp()+interval '1 minute'
    or end_time-start_time>interval '24 hours'
   then raise exception 'Invalid labor interval';end if;
   perform pg_advisory_xact_lock(hashtextextended(v.technician_id::text,9));
   if end_time>coalesce(v.finished_at,now()+interval '5 minutes') then raise exception 'Labor exceeds visit end';end if;
   if exists(select 1 from public.bf9_labor l where l.technician_id=v.technician_id
    and l.started_at<end_time and l.ended_at>start_time)
   then raise exception 'Overlapping labor interval';end if;
   insert into public.bf9_labor(organization_id,visit_id,technician_id,started_at,ended_at,activity,created_by)
   values(w.organization_id,v.id,v.technician_id,start_time,end_time,p_data->>'activity',actor)
   returning id into result_id;
  elsif p_action='finish_visit' then
   if v.status<>'open' then raise exception 'Visit is not open';end if;
   if length(btrim(coalesce(p_data->>'work_performed','')))<5
   then raise exception 'Work performed is required';end if;
   update public.bf9_visits set status='finished',finished_at=now(),
    diagnosis=p_data->>'diagnosis',work_performed=p_data->>'work_performed',
    tests_performed=p_data->>'tests_performed',notes=p_data->>'notes'
   where id=v.id;
   result_id:=v.id;
  else
   if v.status<>'open' or length(btrim(coalesce(p_data->>'reason','')))<5
   then raise exception 'Cancellation reason required for an open visit';end if;
   update public.bf9_visits set status='cancelled',finished_at=now(),cancellation_reason=p_data->>'reason' where id=v.id;
   result_id:=v.id;
  end if;
 elsif p_action='register_evidence' then
  if not public.bf9_can(p_wo,true) or w.status not in('accepted','in_progress','on_hold')
  then raise exception 'Assigned technician required';end if;
  select * into v from public.bf9_visits where id=(p_data->>'visit_id')::uuid and work_order_id=p_wo;
  if not found or v.status<>'open' or v.technician_id<>actor
  then raise exception 'Your open visit is required';end if;
  if p_data->>'mime_type' not in('image/jpeg','image/png','image/webp','application/pdf')
   or coalesce((p_data->>'file_size')::bigint,0) not between 1 and 10485760
  then raise exception 'Unsupported evidence file';end if;
  if length(btrim(coalesce(p_data->>'file_name',''))) not between 1 and 255 then raise exception 'File name required';end if;
  result_id:=gen_random_uuid();
  insert into public.bf9_evidence(id,organization_id,work_order_id,visit_id,uploaded_by,file_name,object_path,mime_type,file_size,caption)
  values(result_id,w.organization_id,w.id,v.id,actor,p_data->>'file_name',
   w.organization_id::text||'/'||w.id::text||'/'||result_id::text,
   p_data->>'mime_type',(p_data->>'file_size')::bigint,coalesce(p_data->>'caption',''));
 elsif p_action='confirm_evidence' then
  select * into e from public.bf9_evidence where id=p_id and work_order_id=p_wo for update;
  if not found or e.uploaded_by<>actor or e.status<>'pending'
  then raise exception 'Pending evidence not found';end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='bf9-evidence'
   and o.name=e.object_path and o.owner_id=actor::text
   and (o.metadata->>'size')::bigint=e.file_size
   and o.metadata->>'mimetype'=e.mime_type)
  then raise exception 'Uploaded object not found';end if;
  update public.bf9_evidence set status='ready',verified_at=now() where id=e.id;
  result_id:=e.id;
 else raise exception 'Invalid field action';end if;
 insert into public.bf9_events(organization_id,work_order_id,visit_id,actor_id,action,details)
 values(w.organization_id,w.id,case when p_action in('register_evidence','confirm_evidence') then
  case when p_action='register_evidence' then v.id else e.visit_id end else v.id end,
  actor,p_action,jsonb_build_object('record_id',result_id));
 return result_id;
end $$;
revoke all on function public.bf9_action(text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.bf9_action(text,uuid,uuid,jsonb) to authenticated;

-- Server-controlled short-lived signed upload/download URLs.
create or replace function public.bf9_evidence_ticket(p_id uuid,p_upload boolean default false)
returns text language plpgsql security definer set search_path=''
as $$
declare e public.bf9_evidence;
begin
 select * into e from public.bf9_evidence where id=p_id;
 if not found or not public.bf9_can(e.work_order_id) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_upload and (e.uploaded_by<>auth.uid() or e.status<>'pending')
 then raise exception 'Upload not permitted';end if;
 if not p_upload and e.status<>'ready' then raise exception 'Evidence is not ready';end if;
 return e.object_path;
end $$;
revoke all on function public.bf9_evidence_ticket(uuid,boolean) from public,anon;
grant execute on function public.bf9_evidence_ticket(uuid,boolean) to authenticated;

-- Storage access is restricted to the exact registered object.
create policy bf9_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='bf9-evidence' and exists(
 select 1 from public.bf9_evidence e where e.object_path=name
 and e.uploaded_by=auth.uid() and e.status='pending'
 and public.bf9_can(e.work_order_id,true)
 and name=e.organization_id::text||'/'||e.work_order_id::text||'/'||e.id::text));
create policy bf9_storage_read on storage.objects for select to authenticated
using(bucket_id='bf9-evidence' and exists(
 select 1 from public.bf9_evidence e where e.object_path=name
 and e.status='ready' and public.bf9_can(e.work_order_id)));
-- No update/delete policy: evidence objects are immutable through the client.


-- Managers explicitly enable field-quality gates on each work order.
-- Existing work orders remain unchanged until enabled.
create table public.bf9_requirements(
 work_order_id uuid primary key references public.bf_work_orders(id),
 organization_id uuid not null references public.bf_organizations(id),
 enabled_at timestamptz not null default now(),
 enabled_by uuid not null references auth.users(id),
 require_evidence boolean not null default true
);
alter table public.bf9_requirements enable row level security;
revoke all on public.bf9_requirements from public,anon,authenticated;
grant select on public.bf9_requirements to authenticated;
create policy bf9_requirements_read on public.bf9_requirements for select to authenticated
using(public.bf9_can(work_order_id));

create or replace function public.bf9_enable_field(p_wo uuid,p_require_evidence boolean default true)
returns void language plpgsql security definer set search_path=''
as $$
declare w public.bf_work_orders;
begin
 select * into w from public.bf_work_orders where id=p_wo for update;
 if not found or not public.bf4_staff(w.organization_id,'corrective.manage')
 then raise exception 'Manager permission required' using errcode='42501';end if;
 if w.status in('completed','approved','closed','cancelled')
 then raise exception 'Enable field controls before completion';end if;
 insert into public.bf9_requirements(work_order_id,organization_id,enabled_by,require_evidence)
 values(w.id,w.organization_id,auth.uid(),p_require_evidence)
 on conflict(work_order_id) do nothing;
 insert into public.bf9_events(organization_id,work_order_id,actor_id,action,details)
 values(w.organization_id,w.id,auth.uid(),'field_controls_enabled',
 jsonb_build_object('require_evidence',p_require_evidence));
end $$;
revoke all on function public.bf9_enable_field(uuid,boolean) from public,anon;
grant execute on function public.bf9_enable_field(uuid,boolean) to authenticated;

create or replace function public.bf9_completion_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
declare cfg public.bf9_requirements;
begin
 if new.status=old.status or new.status not in('completed','approved','closed')
 then return new;end if;
 select * into cfg from public.bf9_requirements where work_order_id=new.id;
 if not found then return new;end if;
 if exists(select 1 from public.bf9_visits where work_order_id=new.id and status='open')
 then raise exception 'Finish all field visits before completion';end if;
 if not exists(select 1 from public.bf9_visits v where v.work_order_id=new.id
  and v.status='finished' and exists(select 1 from public.bf9_labor l where l.visit_id=v.id))
 then raise exception 'A finished visit with recorded labor is required';end if;
 if cfg.require_evidence and not exists(select 1 from public.bf9_evidence
  where work_order_id=new.id and status='ready')
 then raise exception 'Verified field evidence is required';end if;
 if exists(select 1 from public.bf8_material_requests r
  where r.work_order_id=new.id and r.status not in('closed','cancelled','rejected')
  and exists(select 1 from public.bf8_material_lines l where l.request_id=r.id
   and (l.reserved_qty>0 or
    l.issued_qty<>l.consumed_qty+l.returned_received_qty+l.returned_unreceived_qty)))
 then raise exception 'Reconcile advanced material custody before completion';end if;
 if exists(select 1 from public.bf_inv_requests r where r.work_order_id=new.id
  and r.status in('reserved','issued','received'))
 then raise exception 'Reconcile legacy material custody before completion';end if;
 return new;
end $$;
create trigger bf9_completion_guard before update of status on public.bf_work_orders
for each row execute function public.bf9_completion_guard();


-- Read-only material consumption summary. No unit costs or selling prices.
create or replace function public.bf9_material_summary(p_wo uuid)
returns table(part_id uuid,sku text,unit text,owner_client_id uuid,consumed_quantity numeric)
language sql stable security definer set search_path=''
as $$
 select l.part_id,p.sku,p.unit,l.owner_client_id,sum(l.consumed_qty)
 from public.bf8_material_requests r
 join public.bf8_material_lines l on l.request_id=r.id
 join public.bf_inv_parts p on p.id=l.part_id and p.organization_id=r.organization_id
 where r.work_order_id=p_wo and public.bf9_can(p_wo)
 group by l.part_id,p.sku,p.unit,l.owner_client_id
 having sum(l.consumed_qty)>0;
$$;
revoke all on function public.bf9_material_summary(uuid) from public,anon;
grant execute on function public.bf9_material_summary(uuid) to authenticated;

insert into public.bf_migrations(version) values(9);
commit;
