-- Basmat Facilities CMMS — Sprint 37
-- Enterprise Workforce & Soft FM Operations
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=36)
 then raise exception 'Install and verify Sprint 36 first'; end if;
 if exists(select 1 from public.bf_migrations where version=37)
 then raise exception 'Sprint 37 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
('soft-fm.view','View Soft FM operational tasks'),
('soft-fm.manage','Create, assign and manage Soft FM tasks'),
('soft-fm.execute','Execute assigned Soft FM tasks')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','owner_director','owner_maintenance_manager','contractor_director',
            'operations_manager','project_manager','facility_manager','maintenance_manager')
  and p.code in('soft-fm.view','soft-fm.manage'))
 or
 (r.code in('cleaning_supervisor','security_supervisor','landscape_supervisor')
  and p.code in('soft-fm.view','soft-fm.manage','soft-fm.execute'))
 or
 (r.code in('cleaner','security_guard','gardener','pest_control_worker','waste_worker')
  and p.code in('soft-fm.view','soft-fm.execute'))
 or
 (r.code='auditor_readonly' and p.code='soft-fm.view')
on conflict do nothing;

create table public.bf37_task_templates(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 service_type text not null check(service_type in('cleaning','security','landscape','pest_control','waste')),
 name_ar text not null,
 name_en text not null,
 default_priority text not null default 'normal' check(default_priority in('low','normal','high','critical')),
 frequency text not null default 'daily' check(frequency in('once','daily','weekly','monthly','shift')),
 estimated_minutes integer check(estimated_minutes is null or estimated_minutes>0),
 instructions text,
 is_active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);

create table public.bf37_tasks(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 project_id uuid references public.bf35_projects(id),
 site_id uuid,
 team_id uuid references public.bf35_teams(id),
 template_id uuid references public.bf37_task_templates(id),
 service_type text not null check(service_type in('cleaning','security','landscape','pest_control','waste')),
 task_no text not null,
 title text not null,
 description text,
 priority text not null default 'normal' check(priority in('low','normal','high','critical')),
 status text not null default 'open' check(status in('open','assigned','in_progress','completed','cancelled')),
 scheduled_date date not null default current_date,
 due_at timestamptz,
 assigned_user_id uuid references public.bf_profiles(id),
 started_at timestamptz,
 completed_at timestamptz,
 completion_note text,
 qr_token uuid not null default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id)
);

create table public.bf37_task_events(
 id bigint generated always as identity primary key,
 task_id uuid not null references public.bf37_tasks(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 action text not null,
 from_status text,
 to_status text,
 note text,
 created_at timestamptz not null default now()
);

create index bf37_tasks_scope on public.bf37_tasks(organization_id,client_id,site_id,service_type,status,scheduled_date);
create index bf37_tasks_assigned on public.bf37_tasks(assigned_user_id,status,scheduled_date);
create index bf37_events_task on public.bf37_task_events(task_id,id);
create unique index bf37_task_no_uq on public.bf37_tasks(task_no);
create unique index bf37_task_qr_uq on public.bf37_tasks(qr_token);

alter table public.bf37_task_templates enable row level security;
alter table public.bf37_tasks enable row level security;
alter table public.bf37_task_events enable row level security;

revoke all on public.bf37_task_templates,public.bf37_tasks,public.bf37_task_events from public,anon,authenticated;
grant select on public.bf37_task_templates,public.bf37_tasks,public.bf37_task_events to authenticated;

insert into public.bf36_reference_counters(entity,last_value)
values('soft_fm_tasks',0)
on conflict(entity) do nothing;

create or replace function public.bf37_next_task_no()
returns text
language plpgsql
security definer
set search_path=''
as $$
declare n bigint;
begin
 update public.bf36_reference_counters
 set last_value=last_value+1,updated_at=now()
 where entity='soft_fm_tasks'
 returning last_value into n;
 return 'SFM-'||lpad(n::text,7,'0');
end $$;

revoke all on function public.bf37_next_task_no() from public,anon,authenticated;

create or replace function public.bf37_task_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
 if tg_op='INSERT' then
  new.task_no:=public.bf37_next_task_no();
  new.qr_token:=coalesce(new.qr_token,gen_random_uuid());
 else
  if new.task_no is distinct from old.task_no then raise exception 'Task reference is immutable'; end if;
  if new.qr_token is distinct from old.qr_token then raise exception 'Task QR identity is immutable'; end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;

drop trigger if exists bf37_task_identity on public.bf37_tasks;
create trigger bf37_task_identity
before insert or update on public.bf37_tasks
for each row execute function public.bf37_task_identity();

create or replace function public.bf37_can_view(p_org uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or public.bf4_staff(p_org,'soft-fm.view')
 or public.bf4_staff(p_org,'soft-fm.manage')
 or public.bf4_staff(p_org,'soft-fm.execute');
$$;

create or replace function public.bf37_can_manage(p_org uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or public.bf4_staff(p_org,'soft-fm.manage');
$$;

create policy bf37_templates_read on public.bf37_task_templates
for select to authenticated using(public.bf37_can_view(organization_id));

create policy bf37_tasks_read on public.bf37_tasks
for select to authenticated using(
 public.bf37_can_view(organization_id)
 or assigned_user_id=auth.uid()
);

create policy bf37_events_read on public.bf37_task_events
for select to authenticated using(
 exists(select 1 from public.bf37_tasks t where t.id=task_id and
  (public.bf37_can_view(t.organization_id) or t.assigned_user_id=auth.uid()))
);

create or replace function public.bf37_seed_templates(p_org uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
 if not public.bf37_can_manage(p_org)
 then raise exception 'Soft FM management permission required' using errcode='42501'; end if;

 insert into public.bf37_task_templates(
  organization_id,service_type,name_ar,name_en,default_priority,frequency,estimated_minutes,instructions,created_by
 ) values
 (p_org,'cleaning','تنظيف منطقة','Area Cleaning','normal','daily',30,'Complete cleaning checklist and report exceptions.',auth.uid()),
 (p_org,'cleaning','تنظيف دورة مياه','Washroom Cleaning','high','shift',20,'Clean, sanitize and replenish consumables.',auth.uid()),
 (p_org,'security','جولة أمنية','Security Patrol','high','shift',30,'Complete patrol route and report observations.',auth.uid()),
 (p_org,'security','فحص نقطة دخول','Access Point Check','high','daily',15,'Verify access-control point and record issues.',auth.uid()),
 (p_org,'landscape','فحص الري','Irrigation Check','normal','daily',30,'Inspect irrigation and report leaks or failures.',auth.uid()),
 (p_org,'landscape','صيانة المسطحات','Landscape Maintenance','normal','weekly',90,'Maintain planted areas and remove defects.',auth.uid()),
 (p_org,'pest_control','فحص مكافحة الآفات','Pest Control Inspection','high','weekly',45,'Inspect defined points and record findings.',auth.uid()),
 (p_org,'waste','جمع النفايات','Waste Collection','normal','shift',30,'Collect waste and confirm disposal point.',auth.uid())
 on conflict do nothing;
end $$;

create or replace function public.bf37_create_task(
 p_org uuid,p_client uuid,p_project uuid,p_site uuid,p_team uuid,p_template uuid,
 p_service_type text,p_title text,p_description text default null,p_priority text default 'normal',
 p_scheduled date default current_date,p_due timestamptz default null,p_assigned_user uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare rid uuid;
begin
 if not public.bf37_can_manage(p_org)
 then raise exception 'Soft FM management permission required' using errcode='42501'; end if;

 if p_service_type not in('cleaning','security','landscape','pest_control','waste')
 then raise exception 'Invalid Soft FM service type'; end if;

 if not exists(select 1 from public.bf_clients c where c.id=p_client and c.organization_id=p_org)
 then raise exception 'Invalid client'; end if;

 if p_project is not null and not exists(
  select 1 from public.bf35_projects p where p.id=p_project and p.organization_id=p_org and p.client_id=p_client
 ) then raise exception 'Invalid project'; end if;

 if p_site is not null and not exists(
  select 1 from public.bf_sites s where s.id=p_site and s.organization_id=p_org and s.client_id=p_client
 ) then raise exception 'Invalid site'; end if;

 if p_team is not null and not exists(
  select 1 from public.bf35_teams t where t.id=p_team and t.organization_id=p_org
 ) then raise exception 'Invalid team'; end if;

 if p_assigned_user is not null and not exists(
  select 1 from public.bf_profiles p where p.id=p_assigned_user and p.status='active'
 ) then raise exception 'Assigned user must be active'; end if;

 insert into public.bf37_tasks(
  organization_id,client_id,project_id,site_id,team_id,template_id,service_type,
  task_no,title,description,priority,status,scheduled_date,due_at,assigned_user_id,created_by
 ) values(
  p_org,p_client,p_project,p_site,p_team,p_template,p_service_type,
  'AUTO',btrim(p_title),nullif(btrim(p_description),''),p_priority,
  case when p_assigned_user is null then 'open' else 'assigned' end,
  coalesce(p_scheduled,current_date),p_due,p_assigned_user,auth.uid()
 ) returning id into rid;

 insert into public.bf37_task_events(task_id,actor_id,action,to_status,note)
 values(rid,auth.uid(),'created',case when p_assigned_user is null then 'open' else 'assigned' end,'Task created');

 return rid;
end $$;

create or replace function public.bf37_action(p_task uuid,p_action text,p_note text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare t public.bf37_tasks; target text;
begin
 select * into t from public.bf37_tasks where id=p_task for update;
 if not found then raise exception 'Task not found'; end if;

 if not public.bf37_can_manage(t.organization_id)
    and not (t.assigned_user_id=auth.uid() and public.bf4_staff(t.organization_id,'soft-fm.execute'))
 then raise exception 'Soft FM execution permission required' using errcode='42501'; end if;

 target:=case
  when p_action='start' and t.status in('open','assigned') then 'in_progress'
  when p_action='complete' and t.status='in_progress' then 'completed'
  when p_action='cancel' and public.bf37_can_manage(t.organization_id) and t.status<>'completed' then 'cancelled'
  else null
 end;

 if target is null then raise exception 'Invalid task transition'; end if;

 update public.bf37_tasks
 set status=target,
     started_at=case when target='in_progress' then coalesce(started_at,now()) else started_at end,
     completed_at=case when target='completed' then now() else completed_at end,
     completion_note=case when target='completed' then nullif(btrim(p_note),'') else completion_note end
 where id=t.id;

 insert into public.bf37_task_events(task_id,actor_id,action,from_status,to_status,note)
 values(t.id,auth.uid(),p_action,t.status,target,nullif(btrim(p_note),''));
end $$;

create or replace function public.bf37_dashboard(p_org uuid,p_date date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
 if not public.bf37_can_view(p_org)
 then raise exception 'Soft FM view permission required' using errcode='42501'; end if;

 select jsonb_build_object(
  'summary',jsonb_build_object(
    'total',count(*),
    'open',count(*) filter(where status='open'),
    'assigned',count(*) filter(where status='assigned'),
    'in_progress',count(*) filter(where status='in_progress'),
    'completed',count(*) filter(where status='completed'),
    'overdue',count(*) filter(where due_at is not null and due_at<now() and status not in('completed','cancelled'))
  ),
  'tasks',coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'task_no',t.task_no,'service_type',t.service_type,'title',t.title,
    'priority',t.priority,'status',t.status,'scheduled_date',t.scheduled_date,'due_at',t.due_at,
    'site_id',t.site_id,'team_id',t.team_id,'assigned_user_id',t.assigned_user_id,
    'assigned_user',p.full_name,'qr_token',t.qr_token,
    'qr_payload','bfcmms://soft-fm-task/'||t.id::text||'?token='||t.qr_token::text
  ) order by t.priority desc,t.task_no),'[]'::jsonb)
 ) into result
 from public.bf37_tasks t
 left join public.bf_profiles p on p.id=t.assigned_user_id
 where t.organization_id=p_org
   and t.scheduled_date=p_date;

 return result;
end $$;

revoke all on function
 public.bf37_task_identity(),
 public.bf37_can_view(uuid),
 public.bf37_can_manage(uuid)
from public,anon,authenticated;

revoke all on function
 public.bf37_seed_templates(uuid),
 public.bf37_create_task(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,date,timestamptz,uuid),
 public.bf37_action(uuid,text,text),
 public.bf37_dashboard(uuid,date)
from public,anon;

grant execute on function
 public.bf37_seed_templates(uuid),
 public.bf37_create_task(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,date,timestamptz,uuid),
 public.bf37_action(uuid,text,text),
 public.bf37_dashboard(uuid,date)
to authenticated;

insert into public.bf_migrations(version) values(37);
commit;
