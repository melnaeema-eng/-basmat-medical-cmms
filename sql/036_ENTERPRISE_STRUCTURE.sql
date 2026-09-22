-- Basmat Facilities CMMS — Sprint 35
-- Enterprise Project / Contract / Site / Team Structure
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=34)
 then raise exception 'Install and verify Sprint 34 first'; end if;
 if exists(select 1 from public.bf_migrations where version=35)
 then raise exception 'Sprint 35 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description) values
('enterprise-structure.view','View enterprise project, service-line and team structure'),
('enterprise-structure.manage','Manage enterprise project, service-line and team structure')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where
 (r.code in('company_admin','owner_director','contractor_director','operations_manager')
  and p.code in('enterprise-structure.view','enterprise-structure.manage'))
 or
 (r.code in('owner_maintenance_manager','project_manager','facility_manager','maintenance_manager',
            'contract_manager','site_manager','consultant_manager','auditor_readonly')
  and p.code='enterprise-structure.view')
on conflict do nothing;

create table public.bf35_service_lines(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 code text not null,
 name_ar text not null,
 name_en text not null,
 service_type text not null check(service_type in('hard_fm','soft_fm','support')),
 is_active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(organization_id,code)
);

create table public.bf35_projects(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 client_id uuid not null,
 contract_id uuid,
 project_code text not null,
 name text not null,
 status text not null default 'active' check(status in('planned','active','on_hold','closed')),
 start_date date,
 end_date date,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,project_code),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(contract_id,organization_id,client_id) references public.bf_contracts(id,organization_id,client_id),
 check(end_date is null or start_date is null or end_date>=start_date)
);

create table public.bf35_project_sites(
 project_id uuid not null references public.bf35_projects(id) on delete cascade,
 organization_id uuid not null references public.bf_organizations(id),
 site_id uuid not null,
 client_id uuid not null,
 primary key(project_id,site_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id)
);

create table public.bf35_teams(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 project_id uuid not null references public.bf35_projects(id) on delete cascade,
 service_line_id uuid references public.bf35_service_lines(id),
 site_id uuid,
 client_id uuid not null,
 team_code text not null,
 name text not null,
 discipline_code text,
 shift_code text,
 status text not null default 'active' check(status in('active','inactive')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(organization_id,team_code),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id)
);

create table public.bf35_team_members(
 team_id uuid not null references public.bf35_teams(id) on delete cascade,
 organization_id uuid not null references public.bf_organizations(id),
 user_id uuid not null references public.bf_profiles(id),
 role_id uuid references public.bf_roles(id),
 member_type text not null default 'worker'
   check(member_type in('manager','supervisor','technician','worker','support')),
 is_lead boolean not null default false,
 is_active boolean not null default true,
 valid_from date,
 valid_until date,
 assigned_by uuid not null references auth.users(id),
 assigned_at timestamptz not null default now(),
 primary key(team_id,user_id),
 check(valid_until is null or valid_from is null or valid_until>=valid_from)
);

create index bf35_projects_scope on public.bf35_projects(organization_id,client_id,status);
create index bf35_teams_scope on public.bf35_teams(organization_id,project_id,site_id,status);
create index bf35_members_user on public.bf35_team_members(user_id,organization_id,is_active);

alter table public.bf35_service_lines enable row level security;
alter table public.bf35_projects enable row level security;
alter table public.bf35_project_sites enable row level security;
alter table public.bf35_teams enable row level security;
alter table public.bf35_team_members enable row level security;

revoke all on public.bf35_service_lines,public.bf35_projects,public.bf35_project_sites,
 public.bf35_teams,public.bf35_team_members from public,anon,authenticated;
grant select on public.bf35_service_lines,public.bf35_projects,public.bf35_project_sites,
 public.bf35_teams,public.bf35_team_members to authenticated;

create or replace function public.bf35_can_view(p_org uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or public.bf4_staff(p_org,'enterprise-structure.view')
 or public.bf4_staff(p_org,'enterprise-structure.manage');
$$;

create or replace function public.bf35_can_manage(p_org uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.bf_is_super_admin()
 or public.bf4_staff(p_org,'enterprise-structure.manage');
$$;

create policy bf35_service_lines_read on public.bf35_service_lines
for select to authenticated using(public.bf35_can_view(organization_id));
create policy bf35_projects_read on public.bf35_projects
for select to authenticated using(public.bf35_can_view(organization_id));
create policy bf35_project_sites_read on public.bf35_project_sites
for select to authenticated using(public.bf35_can_view(organization_id));
create policy bf35_teams_read on public.bf35_teams
for select to authenticated using(public.bf35_can_view(organization_id));
create policy bf35_team_members_read on public.bf35_team_members
for select to authenticated using(public.bf35_can_view(organization_id) or user_id=auth.uid());

create or replace function public.bf35_seed_service_lines(p_org uuid)
returns void
language plpgsql security definer set search_path=''
as $$
begin
 if not public.bf35_can_manage(p_org)
 then raise exception 'Enterprise structure management permission required' using errcode='42501'; end if;

 insert into public.bf35_service_lines(organization_id,code,name_ar,name_en,service_type,created_by) values
 (p_org,'electrical','الكهرباء','Electrical','hard_fm',auth.uid()),
 (p_org,'mechanical','الميكانيكا','Mechanical','hard_fm',auth.uid()),
 (p_org,'hvac','التكييف والتهوية','HVAC','hard_fm',auth.uid()),
 (p_org,'plumbing','السباكة','Plumbing','hard_fm',auth.uid()),
 (p_org,'elv','الأنظمة منخفضة التيار','ELV','hard_fm',auth.uid()),
 (p_org,'civil','الأعمال المدنية','Civil','hard_fm',auth.uid()),
 (p_org,'cleaning','النظافة','Cleaning','soft_fm',auth.uid()),
 (p_org,'security','الأمن','Security','soft_fm',auth.uid()),
 (p_org,'landscape','تنسيق الحدائق','Landscape','soft_fm',auth.uid()),
 (p_org,'pest_control','مكافحة الآفات','Pest Control','soft_fm',auth.uid()),
 (p_org,'waste','إدارة النفايات','Waste Management','soft_fm',auth.uid()),
 (p_org,'helpdesk','مركز البلاغات','Help Desk','support',auth.uid()),
 (p_org,'stores','المخازن','Stores','support',auth.uid()),
 (p_org,'procurement','المشتريات','Procurement','support',auth.uid()),
 (p_org,'hse','الصحة والسلامة','HSE','support',auth.uid())
 on conflict(organization_id,code) do nothing;
end $$;

create or replace function public.bf35_create_project(
 p_org uuid,p_client uuid,p_contract uuid,p_code text,p_name text,
 p_start date default null,p_end date default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare rid uuid;
begin
 if not public.bf35_can_manage(p_org)
 then raise exception 'Enterprise structure management permission required' using errcode='42501'; end if;
 if not exists(select 1 from public.bf_clients c where c.id=p_client and c.organization_id=p_org)
 then raise exception 'Invalid client'; end if;
 if p_contract is not null and not exists(
  select 1 from public.bf_contracts c where c.id=p_contract and c.organization_id=p_org and c.client_id=p_client
 ) then raise exception 'Invalid contract'; end if;
 if length(btrim(coalesce(p_code,'')))<2 or length(btrim(coalesce(p_name,'')))<3
 then raise exception 'Project code and name are required'; end if;
 if p_end is not null and p_start is not null and p_end<p_start
 then raise exception 'Invalid project dates'; end if;

 insert into public.bf35_projects(
  organization_id,client_id,contract_id,project_code,name,start_date,end_date,created_by
 ) values(p_org,p_client,p_contract,upper(btrim(p_code)),btrim(p_name),p_start,p_end,auth.uid())
 returning id into rid;
 return rid;
end $$;

create or replace function public.bf35_link_site(p_project uuid,p_site uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare p public.bf35_projects; s public.bf_sites;
begin
 select * into p from public.bf35_projects where id=p_project;
 if not found then raise exception 'Project not found'; end if;
 if not public.bf35_can_manage(p.organization_id)
 then raise exception 'Enterprise structure management permission required' using errcode='42501'; end if;
 select * into s from public.bf_sites where id=p_site;
 if not found or s.organization_id<>p.organization_id or s.client_id<>p.client_id
 then raise exception 'Site is outside project scope'; end if;

 insert into public.bf35_project_sites(project_id,organization_id,site_id,client_id)
 values(p.id,p.organization_id,s.id,s.client_id)
 on conflict do nothing;
end $$;

create or replace function public.bf35_create_team(
 p_project uuid,p_service_line uuid,p_site uuid,p_code text,p_name text,
 p_discipline text default null,p_shift text default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare p public.bf35_projects; rid uuid;
begin
 select * into p from public.bf35_projects where id=p_project;
 if not found then raise exception 'Project not found'; end if;
 if not public.bf35_can_manage(p.organization_id)
 then raise exception 'Enterprise structure management permission required' using errcode='42501'; end if;
 if p_service_line is not null and not exists(
  select 1 from public.bf35_service_lines l where l.id=p_service_line and l.organization_id=p.organization_id and l.is_active
 ) then raise exception 'Invalid service line'; end if;
 if p_site is not null and not exists(
  select 1 from public.bf35_project_sites ps where ps.project_id=p.id and ps.site_id=p_site
 ) then raise exception 'Site must be linked to project first'; end if;

 insert into public.bf35_teams(
  organization_id,project_id,service_line_id,site_id,client_id,team_code,name,
  discipline_code,shift_code,created_by
 ) values(
  p.organization_id,p.id,p_service_line,p_site,p.client_id,upper(btrim(p_code)),btrim(p_name),
  nullif(btrim(p_discipline),''),nullif(btrim(p_shift),''),auth.uid()
 ) returning id into rid;
 return rid;
end $$;

create or replace function public.bf35_add_team_member(
 p_team uuid,p_user uuid,p_role uuid default null,p_member_type text default 'worker',
 p_is_lead boolean default false,p_from date default null,p_until date default null
)
returns void
language plpgsql security definer set search_path=''
as $$
declare t public.bf35_teams;
begin
 select * into t from public.bf35_teams where id=p_team;
 if not found then raise exception 'Team not found'; end if;
 if not public.bf35_can_manage(t.organization_id)
 then raise exception 'Enterprise structure management permission required' using errcode='42501'; end if;
 if not exists(select 1 from public.bf_profiles p where p.id=p_user and p.status='active')
 then raise exception 'Active user required'; end if;
 if p_role is not null and not exists(
  select 1 from public.bf_roles r where r.id=p_role and (r.organization_id is null or r.organization_id=t.organization_id)
 ) then raise exception 'Invalid role'; end if;
 if p_member_type not in('manager','supervisor','technician','worker','support')
 then raise exception 'Invalid member type'; end if;
 if p_until is not null and p_from is not null and p_until<p_from
 then raise exception 'Invalid membership period'; end if;

 insert into public.bf35_team_members(
  team_id,organization_id,user_id,role_id,member_type,is_lead,is_active,valid_from,valid_until,assigned_by
 ) values(
  t.id,t.organization_id,p_user,p_role,p_member_type,p_is_lead,true,p_from,p_until,auth.uid()
 )
 on conflict(team_id,user_id) do update set
  role_id=excluded.role_id,member_type=excluded.member_type,is_lead=excluded.is_lead,
  is_active=true,valid_from=excluded.valid_from,valid_until=excluded.valid_until,
  assigned_by=excluded.assigned_by,assigned_at=now();
end $$;

create or replace function public.bf35_structure(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if not public.bf35_can_view(p_org)
 then raise exception 'Enterprise structure view permission required' using errcode='42501'; end if;

 select jsonb_build_object(
  'service_lines',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.service_type,x.name_en)
    from public.bf35_service_lines x where x.organization_id=p_org
  ),'[]'::jsonb),
  'projects',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'client_id',p.client_id,'contract_id',p.contract_id,
      'project_code',p.project_code,'name',p.name,'status',p.status,
      'start_date',p.start_date,'end_date',p.end_date,
      'sites',coalesce((
        select jsonb_agg(jsonb_build_object('site_id',ps.site_id,'site_name',s.name) order by s.name)
        from public.bf35_project_sites ps
        join public.bf_sites s on s.id=ps.site_id
        where ps.project_id=p.id
      ),'[]'::jsonb)
    ) order by p.project_code)
    from public.bf35_projects p where p.organization_id=p_org
  ),'[]'::jsonb),
  'teams',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',t.id,'project_id',t.project_id,'team_code',t.team_code,'name',t.name,
      'service_line_id',t.service_line_id,'site_id',t.site_id,
      'discipline_code',t.discipline_code,'shift_code',t.shift_code,'status',t.status,
      'members',coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id',m.user_id,'full_name',pr.full_name,'email',pr.email,
          'role_id',m.role_id,'role_code',r.code,'member_type',m.member_type,
          'is_lead',m.is_lead,'is_active',m.is_active
        ) order by m.is_lead desc,pr.full_name)
        from public.bf35_team_members m
        join public.bf_profiles pr on pr.id=m.user_id
        left join public.bf_roles r on r.id=m.role_id
        where m.team_id=t.id
      ),'[]'::jsonb)
    ) order by t.team_code)
    from public.bf35_teams t where t.organization_id=p_org
  ),'[]'::jsonb)
 ) into result;

 return result;
end $$;

revoke all on function
 public.bf35_can_view(uuid),
 public.bf35_can_manage(uuid),
 public.bf35_seed_service_lines(uuid),
 public.bf35_create_project(uuid,uuid,uuid,text,text,date,date),
 public.bf35_link_site(uuid,uuid),
 public.bf35_create_team(uuid,uuid,uuid,text,text,text,text),
 public.bf35_add_team_member(uuid,uuid,uuid,text,boolean,date,date),
 public.bf35_structure(uuid)
from public,anon;

grant execute on function
 public.bf35_can_view(uuid),
 public.bf35_can_manage(uuid),
 public.bf35_seed_service_lines(uuid),
 public.bf35_create_project(uuid,uuid,uuid,text,text,date,date),
 public.bf35_link_site(uuid,uuid),
 public.bf35_create_team(uuid,uuid,uuid,text,text,text,text),
 public.bf35_add_team_member(uuid,uuid,uuid,text,boolean,date,date),
 public.bf35_structure(uuid)
to authenticated;

insert into public.bf_migrations(version) values(35);
commit;
