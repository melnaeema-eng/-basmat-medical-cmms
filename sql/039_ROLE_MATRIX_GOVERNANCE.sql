-- Basmat Facilities CMMS — Sprint 38
-- Role Matrix, Permission Audit & Workforce Governance
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=37)
 then raise exception 'Install and verify Sprint 37 first'; end if;
 if exists(select 1 from public.bf_migrations where version=38)
 then raise exception 'Sprint 38 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
('governance.view','View role matrix, permission audit and workforce governance'),
('governance.manage','Manage governance exceptions and access review')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','owner_director','contractor_director','operations_manager')
  and p.code in('governance.view','governance.manage'))
 or
 (r.code in('owner_maintenance_manager','project_manager','facility_manager','maintenance_manager',
            'contract_manager','consultant_manager','auditor_readonly')
  and p.code='governance.view')
on conflict do nothing;

-- Explicit enterprise role levels used for governance reporting.
create table public.bf38_role_levels(
 role_code text primary key,
 level_no integer not null check(level_no between 1 and 100),
 domain text not null,
 recommended_scope text not null check(recommended_scope in('platform','organization','client','contract','site','discipline','team','self')),
 notes text
);

insert into public.bf38_role_levels(role_code,level_no,domain,recommended_scope,notes) values
('company_admin',1,'platform','organization','Tenant administrator'),
('owner_director',2,'owner','organization','Owner executive'),
('owner_maintenance_manager',3,'owner','organization','Owner maintenance leadership'),
('contract_manager',4,'owner','contract','Contract governance'),
('site_manager',5,'owner','site','Facility/site management'),
('consultant_manager',6,'consultant','contract','Consultant management'),
('consultant_engineer',7,'consultant','site','Consultant technical review'),
('contractor_director',2,'contractor','organization','Contractor executive'),
('operations_manager',3,'contractor','organization','Operations leadership'),
('project_manager',4,'contractor','contract','Project manager'),
('facility_manager',5,'contractor','site','Facility management'),
('maintenance_manager',5,'contractor','site','Maintenance management'),
('supervisor',6,'hard_fm','discipline','General supervisor'),
('electrical_supervisor',6,'hard_fm','discipline','Electrical supervisor'),
('mechanical_supervisor',6,'hard_fm','discipline','Mechanical supervisor'),
('hvac_supervisor',6,'hard_fm','discipline','HVAC supervisor'),
('plumbing_supervisor',6,'hard_fm','discipline','Plumbing supervisor'),
('elv_supervisor',6,'hard_fm','discipline','ELV supervisor'),
('senior_technician',7,'hard_fm','team','Senior technician'),
('technician',8,'hard_fm','self','Technician'),
('cleaning_supervisor',6,'soft_fm','team','Cleaning supervisor'),
('cleaner',9,'soft_fm','self','Cleaning operative'),
('security_supervisor',6,'soft_fm','team','Security supervisor'),
('security_guard',9,'soft_fm','self','Security guard'),
('landscape_supervisor',6,'soft_fm','team','Landscape supervisor'),
('gardener',9,'soft_fm','self','Gardener'),
('pest_control_worker',9,'soft_fm','self','Pest control worker'),
('waste_worker',9,'soft_fm','self','Waste worker'),
('store_manager',6,'support','site','Store manager'),
('store_keeper',8,'support','site','Store keeper'),
('procurement_manager',5,'support','organization','Procurement manager'),
('buyer',7,'support','organization','Buyer'),
('finance_manager',5,'support','organization','Finance manager'),
('accountant',7,'support','organization','Accountant'),
('hse_manager',5,'support','organization','HSE manager'),
('safety_officer',7,'support','site','Safety officer'),
('help_desk',7,'support','organization','Help desk'),
('dispatcher',7,'support','organization','Dispatcher'),
('auditor_readonly',7,'audit','organization','Read-only auditor')
on conflict(role_code) do update set
 level_no=excluded.level_no,domain=excluded.domain,recommended_scope=excluded.recommended_scope,notes=excluded.notes;

alter table public.bf38_role_levels enable row level security;
revoke all on public.bf38_role_levels from public,anon,authenticated;
grant select on public.bf38_role_levels to authenticated;

create or replace function public.bf38_can_view()
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or exists(
  select 1
  from public.bf_user_roles ur
  join public.bf_roles r on r.id=ur.role_id
  join public.bf_role_permissions rp on rp.role_id=r.id
  join public.bf_permissions p on p.id=rp.permission_id
  where ur.user_id=auth.uid()
    and p.code in('governance.view','governance.manage')
 );
$$;

create or replace function public.bf38_can_manage()
returns boolean
language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or exists(
  select 1
  from public.bf_user_roles ur
  join public.bf_roles r on r.id=ur.role_id
  join public.bf_role_permissions rp on rp.role_id=r.id
  join public.bf_permissions p on p.id=rp.permission_id
  where ur.user_id=auth.uid()
    and p.code='governance.manage'
 );
$$;

create policy bf38_role_levels_read on public.bf38_role_levels
for select to authenticated using(public.bf38_can_view());

-- Flags roles that have manage/execute access without their corresponding view permission.
create or replace function public.bf38_permission_anomalies()
returns jsonb
language sql stable security definer set search_path=''
as $$
 with rp as (
  select r.code role_code,p.code permission_code
  from public.bf_roles r
  join public.bf_role_permissions x on x.role_id=r.id
  join public.bf_permissions p on p.id=x.permission_id
 ),
 anomalies as (
  select a.role_code,a.permission_code,
         case
          when a.permission_code like '%.manage' then replace(a.permission_code,'.manage','.view')
          when a.permission_code like '%.execute' then replace(a.permission_code,'.execute','.view')
          else null
         end expected_view
  from rp a
  where (a.permission_code like '%.manage' or a.permission_code like '%.execute')
    and not exists(
      select 1 from rp b
      where b.role_code=a.role_code
        and b.permission_code=
          case
           when a.permission_code like '%.manage' then replace(a.permission_code,'.manage','.view')
           when a.permission_code like '%.execute' then replace(a.permission_code,'.execute','.view')
          end
    )
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'role_code',role_code,
   'permission_code',permission_code,
   'missing_view_permission',expected_view
 ) order by role_code,permission_code),'[]'::jsonb)
 from anomalies;
$$;

create or replace function public.bf38_scope_anomalies()
returns jsonb
language sql stable security definer set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'scope_id',s.id,
   'user_id',s.user_id,
   'role_code',r.code,
   'scope_level',s.scope_level,
   'recommended_scope',l.recommended_scope,
   'organization_id',s.organization_id
 ) order by r.code,s.user_id),'[]'::jsonb)
 from public.bf34_access_scopes s
 join public.bf_roles r on r.id=s.role_id
 left join public.bf38_role_levels l on l.role_code=r.code
 where s.is_active
   and l.role_code is not null
   and (
    (l.recommended_scope='self' and s.scope_level not in('team','discipline','site'))
    or (l.recommended_scope='team' and s.scope_level='organization')
    or (l.recommended_scope='discipline' and s.scope_level='organization')
    or (l.recommended_scope='site' and s.scope_level in('organization','client'))
    or (l.recommended_scope='contract' and s.scope_level='organization')
   );
$$;

create or replace function public.bf38_role_matrix()
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if not public.bf38_can_view()
 then raise exception 'Governance view permission required' using errcode='42501'; end if;

 select jsonb_build_object(
  'roles',coalesce((
    select jsonb_agg(jsonb_build_object(
      'role_id',r.id,
      'role_code',r.code,
      'role_name',r.name,
      'level_no',l.level_no,
      'domain',l.domain,
      'recommended_scope',l.recommended_scope,
      'permissions',coalesce((
        select jsonb_agg(p.code order by p.code)
        from public.bf_role_permissions rp
        join public.bf_permissions p on p.id=rp.permission_id
        where rp.role_id=r.id
      ),'[]'::jsonb)
    ) order by coalesce(l.level_no,99),r.name)
    from public.bf_roles r
    left join public.bf38_role_levels l on l.role_code=r.code
    where r.is_system=true
  ),'[]'::jsonb),
  'permission_anomalies',public.bf38_permission_anomalies(),
  'scope_anomalies',public.bf38_scope_anomalies(),
  'summary',jsonb_build_object(
    'roles',(select count(*) from public.bf_roles where is_system=true),
    'permissions',(select count(*) from public.bf_permissions),
    'active_scoped_assignments',(select count(*) from public.bf34_access_scopes where is_active),
    'permission_anomalies',jsonb_array_length(public.bf38_permission_anomalies()),
    'scope_anomalies',jsonb_array_length(public.bf38_scope_anomalies())
  )
 ) into result;

 return result;
end $$;

-- Adds any missing *.view permission for existing *.manage / *.execute permissions.
-- It never removes permissions and requires governance.manage.
create or replace function public.bf38_repair_missing_views()
returns integer
language plpgsql security definer set search_path=''
as $$
declare n integer:=0;
begin
 if not public.bf38_can_manage()
 then raise exception 'Governance management permission required' using errcode='42501'; end if;

 with candidates as (
  select distinct r.id role_id,
    case
     when p.code like '%.manage' then replace(p.code,'.manage','.view')
     when p.code like '%.execute' then replace(p.code,'.execute','.view')
    end view_code
  from public.bf_roles r
  join public.bf_role_permissions rp on rp.role_id=r.id
  join public.bf_permissions p on p.id=rp.permission_id
  where p.code like '%.manage' or p.code like '%.execute'
 ),
 ins as (
  insert into public.bf_role_permissions(role_id,permission_id)
  select c.role_id,p.id
  from candidates c
  join public.bf_permissions p on p.code=c.view_code
  where c.view_code is not null
  on conflict do nothing
  returning 1
 )
 select count(*) into n from ins;

 return n;
end $$;

revoke all on function
 public.bf38_can_view(),
 public.bf38_can_manage(),
 public.bf38_permission_anomalies(),
 public.bf38_scope_anomalies(),
 public.bf38_role_matrix(),
 public.bf38_repair_missing_views()
from public,anon;

grant execute on function
 public.bf38_permission_anomalies(),
 public.bf38_scope_anomalies(),
 public.bf38_role_matrix(),
 public.bf38_repair_missing_views()
to authenticated;

insert into public.bf_migrations(version) values(38);
commit;
