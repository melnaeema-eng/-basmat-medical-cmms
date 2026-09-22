-- Basmat Facilities CMMS Sprint 5: preventive maintenance foundation.
-- Run once after migration 005. Existing data is not deleted.
begin;
do $$ begin
 if not exists(select 1 from public.bf_migrations where version=4) then raise exception 'Install Sprint 4 first';end if;
 if exists(select 1 from public.bf_migrations where version=5) then raise exception 'Sprint 5 already installed';end if;
end $$;
insert into public.bf_permissions(code,description) values
('ppm.view','View preventive maintenance'),('ppm.manage','Manage preventive plans and procedures'),
('ppm.execute','Execute assigned preventive work'),('ppm.approve','Approve preventive completion')
on conflict(code) do nothing;
insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where (r.code in('company_admin','facility_manager','maintenance_manager','supervisor') and p.code like 'ppm.%')
or (r.code='technician' and p.code in('ppm.view','ppm.execute'))
on conflict do nothing;

create table public.bf_ppm_procedures(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 code text not null,name_ar text not null,name_en text not null,
 category_id uuid,manufacturer text,model text,
 frequency text not null check(frequency in('daily','weekly','monthly','quarterly','semiannual','annual')),
 version integer not null default 1 check(version>0),
 revision_of uuid references public.bf_ppm_procedures(id),
 status text not null default 'draft' check(status in('draft','approved','archived')),
 reference text,estimated_minutes integer not null default 60 check(estimated_minutes>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,code),unique(id,organization_id),
 foreign key(category_id,organization_id) references public.bf_asset_categories(id,organization_id)
);
create table public.bf_ppm_steps(
 id uuid primary key default gen_random_uuid(),procedure_id uuid not null references public.bf_ppm_procedures(id),
 seq integer not null check(seq>0),title_ar text not null,title_en text not null,
 instructions_ar text not null default '',instructions_en text not null default '',
 task_type text not null default 'inspection' check(task_type in('inspection','cleaning','lubrication','adjustment','test','replacement','safety','other')),
 required boolean not null default true,
 response_type text not null default 'pass_fail' check(response_type in('pass_fail','reading','text')),
 unit text,min_value numeric,max_value numeric,
 safety_notes text,tools text,materials text,reference text,
 unique(procedure_id,seq),check(min_value is null or max_value is null or min_value<=max_value)
);
create table public.bf_ppm_plans(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,client_id uuid not null,site_id uuid not null,
 contract_id uuid,asset_id uuid not null,procedure_id uuid not null,
 code text not null,frequency text not null check(frequency in('daily','weekly','monthly','quarterly','semiannual','annual')),
 interval_count integer not null default 1 check(interval_count between 1 and 100),
 start_date date not null,next_due date not null,
 estimated_minutes integer not null default 60 check(estimated_minutes>0),
 status text not null default 'draft' check(status in('draft','active','paused','archived')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,code),unique(id,organization_id,client_id,site_id),
 foreign key(client_id,organization_id) references public.bf_clients(id,organization_id),
 foreign key(site_id,organization_id,client_id) references public.bf_sites(id,organization_id,client_id),
 foreign key(contract_id,organization_id,client_id) references public.bf_contracts(id,organization_id,client_id),
 foreign key(asset_id,organization_id,site_id) references public.bf_assets(id,organization_id,site_id),
 foreign key(procedure_id,organization_id) references public.bf_ppm_procedures(id,organization_id)
);
create table public.bf_ppm_jobs(
 id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.bf_ppm_plans(id),
 organization_id uuid not null,client_id uuid not null,site_id uuid not null,
 asset_id uuid not null,procedure_id uuid not null,
 job_number text not null,due_date date not null,
 status text not null default 'scheduled' check(status in('scheduled','assigned','in_progress','completed','approved','closed','cancelled')),
 procedure_snapshot jsonb not null,
 assigned_to uuid references public.bf_profiles(id),
 started_at timestamptz,completed_at timestamptz,approved_at timestamptz,closed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(organization_id,job_number),unique(plan_id,due_date),
 foreign key(asset_id,organization_id,site_id) references public.bf_assets(id,organization_id,site_id)
);
create table public.bf_ppm_results(
 job_id uuid not null references public.bf_ppm_jobs(id),
 step_id uuid not null,result text not null check(result in('pass','fail','na')),
 reading numeric,comment text,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 primary key(job_id,step_id)
);
create table public.bf_ppm_followups(
 job_id uuid not null references public.bf_ppm_jobs(id),
 step_id uuid not null,
 request_id uuid not null references public.bf_service_requests(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(job_id,step_id),
 unique(request_id),
 foreign key(job_id,step_id) references public.bf_ppm_results(job_id,step_id)
);
create table public.bf_ppm_events(
 id bigint generated always as identity primary key,
 organization_id uuid not null,job_id uuid references public.bf_ppm_jobs(id),
 entity_type text not null,entity_id uuid not null,
 actor_id uuid not null references auth.users(id),action text not null,
 details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create sequence public.bf5_procedure_seq;
create sequence public.bf5_plan_seq;
create sequence public.bf5_job_seq;
revoke all on sequence public.bf5_procedure_seq,public.bf5_plan_seq,public.bf5_job_seq from public,anon,authenticated;

-- Reads are tenant-scoped. Mutations are only possible through the checked RPC.
do $$ declare t text;begin
 foreach t in array array['bf_ppm_procedures','bf_ppm_steps','bf_ppm_plans','bf_ppm_jobs','bf_ppm_results','bf_ppm_followups','bf_ppm_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create or replace function public.bf5_can(p_org uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$
 select public.bf4_staff(p_org,p_permission);
$$;
create policy bf5_procedure_read on public.bf_ppm_procedures for select to authenticated
using(public.bf5_can(organization_id,'ppm.view'));
create policy bf5_step_read on public.bf_ppm_steps for select to authenticated
using(exists(select 1 from public.bf_ppm_procedures p where p.id=procedure_id));
create policy bf5_plan_read on public.bf_ppm_plans for select to authenticated
using(public.bf5_can(organization_id,'ppm.view') or public.bf4_client(organization_id,client_id));
create policy bf5_job_read on public.bf_ppm_jobs for select to authenticated
using(public.bf5_can(organization_id,'ppm.view') or public.bf4_client(organization_id,client_id));
create policy bf5_result_read on public.bf_ppm_results for select to authenticated
using(exists(select 1 from public.bf_ppm_jobs j where j.id=job_id));
create policy bf5_followup_read on public.bf_ppm_followups for select to authenticated
using(exists(select 1 from public.bf_ppm_jobs j where j.id=job_id));
create policy bf5_event_read on public.bf_ppm_events for select to authenticated
using(public.bf5_can(organization_id,'ppm.view'));

-- Calendar arithmetic uses the original start date rather than adding a month
-- to an already-clamped date (e.g. January 31).
create or replace function public.bf5_due(p_start date,p_frequency text,p_interval integer,p_occurrence integer)
returns date language plpgsql immutable set search_path=''
as $$
begin
 if p_interval<1 or p_occurrence<0 then raise exception 'Invalid recurrence';end if;
 return case p_frequency
 when 'daily' then p_start+p_interval*p_occurrence
 when 'weekly' then p_start+7*p_interval*p_occurrence
 when 'monthly' then (p_start+p_interval*p_occurrence*interval '1 month')::date
 when 'quarterly' then (p_start+3*p_interval*p_occurrence*interval '1 month')::date
 when 'semiannual' then (p_start+6*p_interval*p_occurrence*interval '1 month')::date
 when 'annual' then (p_start+12*p_interval*p_occurrence*interval '1 month')::date
 else null end;
end $$;
create or replace function public.bf5_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object('procedure_id',p.id,'version',p.version,'name_ar',p.name_ar,'name_en',p.name_en,
 'frequency',p.frequency,'reference',p.reference,'steps',
 coalesce((select jsonb_agg(to_jsonb(s) order by s.seq) from public.bf_ppm_steps s where s.procedure_id=p.id),'[]'::jsonb))
 from public.bf_ppm_procedures p where p.id=p_id;
$$;


create or replace function public.bf5_staff_directory()
returns table(id uuid,full_name text,email text,organization_id uuid)
language sql stable security definer set search_path=''
as $$
 select distinct p.id,p.full_name::text,p.email::text,ur.organization_id
 from public.bf_profiles p join public.bf_user_roles ur on ur.user_id=p.id
 where p.status='active' and public.bf5_can(ur.organization_id,'ppm.manage')
 and public.bf4_user_can(p.id,ur.organization_id,'ppm.execute');
$$;
revoke all on function public.bf5_staff_directory() from public,anon;
grant execute on function public.bf5_staff_directory() to authenticated;

-- One API for planning, controlled execution and auditable transitions.
create or replace function public.bf5_action(p_kind text,p_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare p public.bf_ppm_procedures; pl public.bf_ppm_plans; j public.bf_ppm_jobs;
 a public.bf_assets; s public.bf_ppm_steps;
 v uuid; org uuid; freq text; d date; target_date date; n integer; total integer:=0;
 item jsonb; event_details jsonb; result_text text; reading_value numeric; step_count integer; result_count integer; fail_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>131072 then raise exception 'Invalid payload';end if;
 event_details:=p_data;
 if p_kind='procedure' then
  if p_action='create' then
   org:=(p_data->>'organization_id')::uuid;
   if not public.bf5_can(org,'ppm.manage') then raise exception 'Permission denied' using errcode='42501';end if;
   if nullif(p_data->>'category_id','') is not null and not exists(select 1 from public.bf_asset_categories where id=(p_data->>'category_id')::uuid and organization_id=org) then raise exception 'Invalid category';end if;
   insert into public.bf_ppm_procedures(organization_id,code,name_ar,name_en,category_id,manufacturer,model,frequency,reference,estimated_minutes,created_by)
   values(org,'PPROC-'||lpad(nextval('public.bf5_procedure_seq')::text,6,'0'),p_data->>'name_ar',p_data->>'name_en',
   nullif(p_data->>'category_id','')::uuid,p_data->>'manufacturer',p_data->>'model',p_data->>'frequency',p_data->>'reference',
   coalesce((p_data->>'estimated_minutes')::integer,60),auth.uid()) returning * into p;
   v:=p.id;
  else
   select * into p from public.bf_ppm_procedures where id=p_id for update;
   if not found then raise exception 'Procedure not found';end if;
   if not public.bf5_can(p.organization_id,'ppm.manage') then raise exception 'Permission denied' using errcode='42501';end if;
   if p_action='add_step' and p.status='draft' then
    if (select count(*) from public.bf_ppm_steps where procedure_id=p.id)>=200 then raise exception 'Too many steps';end if;
    insert into public.bf_ppm_steps(procedure_id,seq,title_ar,title_en,instructions_ar,instructions_en,task_type,required,response_type,unit,min_value,max_value,safety_notes,tools,materials,reference)
    values(p.id,coalesce((select max(seq)+1 from public.bf_ppm_steps where procedure_id=p.id),1),
    p_data->>'title_ar',p_data->>'title_en',coalesce(p_data->>'instructions_ar',''),coalesce(p_data->>'instructions_en',''),
    coalesce(p_data->>'task_type','inspection'),coalesce((p_data->>'required')::boolean,true),coalesce(p_data->>'response_type','pass_fail'),
    p_data->>'unit',nullif(p_data->>'min_value','')::numeric,nullif(p_data->>'max_value','')::numeric,
    p_data->>'safety_notes',p_data->>'tools',p_data->>'materials',p_data->>'reference');
   elsif p_action in('update_step','delete_step') and p.status='draft' then
    select * into s from public.bf_ppm_steps where id=(p_data->>'step_id')::uuid and procedure_id=p.id for update;
    if not found then raise exception 'Step not found';end if;
    event_details:=p_data||jsonb_build_object('previous',to_jsonb(s));
    if p_action='delete_step' then
     delete from public.bf_ppm_steps where id=s.id;
    else
     update public.bf_ppm_steps set
      title_ar=p_data->>'title_ar',title_en=p_data->>'title_en',
      instructions_ar=coalesce(p_data->>'instructions_ar',''),instructions_en=coalesce(p_data->>'instructions_en',''),
      task_type=coalesce(p_data->>'task_type','inspection'),required=coalesce((p_data->>'required')::boolean,true),
      response_type=coalesce(p_data->>'response_type','pass_fail'),unit=p_data->>'unit',
      min_value=nullif(p_data->>'min_value','')::numeric,max_value=nullif(p_data->>'max_value','')::numeric,
      safety_notes=p_data->>'safety_notes',tools=p_data->>'tools',materials=p_data->>'materials',reference=p_data->>'reference'
     where id=s.id;
    end if;
   elsif p_action='approve' and p.status='draft' then
    if not exists(select 1 from public.bf_ppm_steps where procedure_id=p.id) then raise exception 'Add procedure steps first';end if;
    update public.bf_ppm_procedures set status='approved' where id=p.id;
   elsif p_action='revise' and p.status='approved' then
    insert into public.bf_ppm_procedures(organization_id,code,name_ar,name_en,category_id,manufacturer,model,frequency,version,revision_of,reference,estimated_minutes,created_by)
    values(p.organization_id,'PPROC-'||lpad(nextval('public.bf5_procedure_seq')::text,6,'0'),p.name_ar,p.name_en,p.category_id,p.manufacturer,p.model,p.frequency,p.version+1,p.id,p.reference,p.estimated_minutes,auth.uid())
    returning id into v;
    insert into public.bf_ppm_steps(procedure_id,seq,title_ar,title_en,instructions_ar,instructions_en,task_type,required,response_type,unit,min_value,max_value,safety_notes,tools,materials,reference)
    select v,seq,title_ar,title_en,instructions_ar,instructions_en,task_type,required,response_type,unit,min_value,max_value,safety_notes,tools,materials,reference
    from public.bf_ppm_steps where procedure_id=p.id order by seq;
   elsif p_action='archive' and p.status in('draft','approved') then
    if exists(select 1 from public.bf_ppm_plans where procedure_id=p.id and status='active') then raise exception 'Pause active plans before archiving a procedure';end if;
    update public.bf_ppm_procedures set status='archived' where id=p.id;
   else raise exception 'Invalid procedure transition';end if;
   if p_action<>'revise' then v:=p.id;end if;
  end if;
  insert into public.bf_ppm_events(organization_id,entity_type,entity_id,actor_id,action,details)
  values(coalesce(p.organization_id,org),'procedure',v,auth.uid(),p_action,event_details);
  return v;
 elsif p_kind='plan' then
  if p_action='create' then
   org:=(p_data->>'organization_id')::uuid;
   if not public.bf5_can(org,'ppm.manage') then raise exception 'Permission denied' using errcode='42501';end if;
   select * into a from public.bf_assets where id=(p_data->>'asset_id')::uuid and organization_id=org and status='active';
   if not found then raise exception 'Invalid asset';end if;
   if not exists(select 1 from public.bf_sites where id=a.site_id and organization_id=org and client_id=a.client_id and status='active') then raise exception 'Asset site is not active';end if;
   select * into p from public.bf_ppm_procedures where id=(p_data->>'procedure_id')::uuid and organization_id=org and status='approved';
   if not found then raise exception 'Select an approved procedure';end if;
   if p.category_id is not null and p.category_id<>a.category_id then raise exception 'Procedure category does not match asset';end if;
   if nullif(p.manufacturer,'') is not null and lower(p.manufacturer)<>lower(coalesce(a.manufacturer,'')) then raise exception 'Manufacturer mismatch';end if;
   if nullif(p.model,'') is not null and lower(p.model)<>lower(coalesce(a.model,'')) then raise exception 'Model mismatch';end if;
   d:=(p_data->>'start_date')::date;
   if d is null then raise exception 'Start date required';end if;
   if nullif(p_data->>'contract_id','') is not null and not exists(select 1 from public.bf_contracts where id=(p_data->>'contract_id')::uuid and organization_id=org and client_id=a.client_id) then raise exception 'Invalid contract';end if;
   insert into public.bf_ppm_plans(organization_id,client_id,site_id,contract_id,asset_id,procedure_id,code,frequency,interval_count,start_date,next_due,estimated_minutes,created_by)
   values(org,a.client_id,a.site_id,nullif(p_data->>'contract_id','')::uuid,a.id,p.id,
   'PLAN-'||lpad(nextval('public.bf5_plan_seq')::text,6,'0'),p.frequency,coalesce((p_data->>'interval_count')::integer,1),
   d,d,p.estimated_minutes,auth.uid()) returning * into pl;
   v:=pl.id;
  else
   select * into pl from public.bf_ppm_plans where id=p_id for update;
   if not found then raise exception 'Plan not found';end if;
   if not public.bf5_can(pl.organization_id,'ppm.manage') then raise exception 'Permission denied' using errcode='42501';end if;
   if p_action='activate' and pl.status in('draft','paused') then
    if not exists(select 1 from public.bf_ppm_procedures where id=pl.procedure_id and status='approved') then raise exception 'Approved procedure required';end if;
    update public.bf_ppm_plans set status='active' where id=pl.id;
   elsif p_action='pause' and pl.status='active' then
    update public.bf_ppm_plans set status='paused' where id=pl.id;
   elsif p_action='archive' and pl.status in('draft','paused') then
    update public.bf_ppm_plans set status='archived' where id=pl.id;
   elsif p_action='generate' and pl.status='active' then
    target_date:=(p_data->>'through_date')::date;
    if target_date is null or target_date<pl.start_date or target_date>current_date+interval '3 years' then raise exception 'Invalid schedule horizon';end if;
    if not exists(select 1 from public.bf_assets where id=pl.asset_id and status='active') then raise exception 'Asset is not active';end if;
    select * into p from public.bf_ppm_procedures where id=pl.procedure_id;
    if p.status<>'approved' then raise exception 'Procedure is not approved';end if;
    for n in 0..5000 loop
     d:=public.bf5_due(pl.start_date,pl.frequency,pl.interval_count,n);
     exit when d>target_date;
     if d is null then raise exception 'Invalid frequency';end if;
     insert into public.bf_ppm_jobs(plan_id,organization_id,client_id,site_id,asset_id,procedure_id,job_number,due_date,procedure_snapshot)
     values(pl.id,pl.organization_id,pl.client_id,pl.site_id,pl.asset_id,pl.procedure_id,
     'PPM-'||to_char(d,'YYYY')||'-'||lpad(nextval('public.bf5_job_seq')::text,6,'0'),d,public.bf5_snapshot(p.id))
     on conflict(plan_id,due_date) do nothing;
     if found then total:=total+1;end if;
    end loop;
    if d<=target_date then raise exception 'Schedule exceeds 5000 occurrences';end if;
    -- Next due is based on the first occurrence after the generated horizon.
    update public.bf_ppm_plans set next_due=greatest(next_due,d) where id=pl.id;
   else raise exception 'Invalid plan transition';end if;
   v:=pl.id;
  end if;
  insert into public.bf_ppm_events(organization_id,entity_type,entity_id,actor_id,action,details)
  values(coalesce(pl.organization_id,org),'plan',v,auth.uid(),p_action,p_data||jsonb_build_object('generated',total));
  return v;
 elsif p_kind='job' then
  select * into j from public.bf_ppm_jobs where id=p_id for update;
  if not found then raise exception 'Job not found';end if;
  if p_action in('assign','approve','close','reject') then
   if not public.bf5_can(j.organization_id,case when p_action in('approve','close') then 'ppm.approve' else 'ppm.manage' end) then raise exception 'Permission denied' using errcode='42501';end if;
  elsif p_action='followup' then
   if not(public.bf5_can(j.organization_id,'ppm.manage') or (public.bf5_can(j.organization_id,'ppm.execute') and j.assigned_to=auth.uid())) then raise exception 'Permission denied' using errcode='42501';end if;
  elsif p_action in('start','result','complete') then
   if not(public.bf5_can(j.organization_id,'ppm.execute') and j.assigned_to=auth.uid()) then raise exception 'Not the assigned technician' using errcode='42501';end if;
  else raise exception 'Invalid action';end if;
  if p_action='followup' and j.status in('in_progress','completed') then
   v:=(p_data->>'step_id')::uuid;
   if not exists(select 1 from public.bf_ppm_results where job_id=j.id and step_id=v and result='fail') then raise exception 'A failed step is required';end if;
   select request_id into v from public.bf_ppm_followups where job_id=j.id and step_id=v;
   if found then return v;end if;
   v:=(p_data->>'step_id')::uuid;
   select * into s from jsonb_populate_record(null::public.bf_ppm_steps,
    (select x from jsonb_array_elements(j.procedure_snapshot->'steps') x where x->>'id'=v::text));
   if s.id is null then raise exception 'Invalid step';end if;
   org:=public.bf4_action('request',null,'create',jsonb_build_object(
    'organization_id',j.organization_id,'client_id',j.client_id,'site_id',j.site_id,'asset_id',j.asset_id,
    'title','PPM failure: '||left(s.title_en,200),
    'description','PPM '||j.job_number||' / Step '||s.seq||': '||coalesce((select comment from public.bf_ppm_results where job_id=j.id and step_id=v),''),
    'priority','P3'));
   insert into public.bf_ppm_followups(job_id,step_id,request_id,created_by) values(j.id,v,org,auth.uid());
   insert into public.bf_ppm_events(organization_id,job_id,entity_type,entity_id,actor_id,action,details)
   values(j.organization_id,j.id,'job',j.id,auth.uid(),'followup',jsonb_build_object('step_id',v,'request_id',org));
   return org;
  end if;
  if p_action='assign' and j.status in('scheduled','assigned') then
   v:=(p_data->>'user_id')::uuid;
   if not public.bf4_user_can(v,j.organization_id,'ppm.execute') then raise exception 'Assignee lacks execution permission';end if;
   update public.bf_ppm_jobs set assigned_to=v,status='assigned' where id=j.id;
  elsif p_action='start' and j.status='assigned' then
   update public.bf_ppm_jobs set status='in_progress',started_at=coalesce(started_at,now()) where id=j.id;
  elsif p_action='result' and j.status='in_progress' then
   v:=(p_data->>'step_id')::uuid;
   select * into s from public.bf_ppm_steps where id=v and procedure_id=j.procedure_id;
   if not found or not exists(select 1 from jsonb_array_elements(j.procedure_snapshot->'steps') x where x->>'id'=v::text) then raise exception 'Invalid snapshot step';end if;
   result_text:=p_data->>'result';reading_value:=nullif(p_data->>'reading','')::numeric;
   select * into s from jsonb_populate_record(null::public.bf_ppm_steps,
    (select x from jsonb_array_elements(j.procedure_snapshot->'steps') x where x->>'id'=v::text));
   if result_text='na' and s.required then raise exception 'Required step cannot be marked N/A';end if;
   if result_text='na' and length(btrim(coalesce(p_data->>'comment','')))<5 then raise exception 'N/A requires justification';end if;
   if s.response_type='reading' and result_text<>'na' then
    if reading_value is null then raise exception 'Reading required';end if;
    if result_text='pass' and ((s.min_value is not null and reading_value<s.min_value) or (s.max_value is not null and reading_value>s.max_value)) then raise exception 'Reading outside limits cannot pass';end if;
   end if;
   if s.response_type='text' and result_text<>'na' and length(btrim(coalesce(p_data->>'comment','')))<3 then raise exception 'Text response required';end if;
   if result_text='fail' and length(btrim(coalesce(p_data->>'comment','')))<5 then raise exception 'Failure requires details';end if;
   insert into public.bf_ppm_results(job_id,step_id,result,reading,comment,updated_by)
   values(j.id,v,result_text,reading_value,p_data->>'comment',auth.uid())
   on conflict(job_id,step_id) do update set result=excluded.result,reading=excluded.reading,comment=excluded.comment,updated_by=excluded.updated_by,updated_at=now();
  elsif p_action='complete' and j.status='in_progress' then
   select count(*) into step_count from jsonb_array_elements(j.procedure_snapshot->'steps');
   select count(*) into result_count from public.bf_ppm_results where job_id=j.id;
   if step_count=0 or result_count<>step_count then raise exception 'Complete every checklist step first';end if;
   update public.bf_ppm_jobs set status='completed',completed_at=now() where id=j.id;
  elsif p_action='approve' and j.status='completed' then
   if j.assigned_to=auth.uid() then raise exception 'Independent approval required';end if;
   select count(*) into fail_count from public.bf_ppm_results where job_id=j.id and result='fail';
   if fail_count>0 then raise exception 'Resolve failed steps before approval';end if;
   update public.bf_ppm_jobs set status='approved',approved_at=now() where id=j.id;
  elsif p_action='reject' and j.status='completed' then
   if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Reason required';end if;
   update public.bf_ppm_jobs set status='in_progress',completed_at=null where id=j.id;
  elsif p_action='close' and j.status='approved' then
   update public.bf_ppm_jobs set status='closed',closed_at=now() where id=j.id;
  else raise exception 'Invalid job transition';end if;
  insert into public.bf_ppm_events(organization_id,job_id,entity_type,entity_id,actor_id,action,details)
  values(j.organization_id,j.id,'job',j.id,auth.uid(),p_action,p_data);
  return j.id;
 end if;
 raise exception 'Invalid entity';
end $$;
revoke all on function public.bf5_action(text,uuid,text,jsonb),public.bf5_snapshot(uuid) from public,anon;
grant execute on function public.bf5_action(text,uuid,text,jsonb) to authenticated;
revoke all on function public.bf5_snapshot(uuid) from authenticated;
revoke all on function public.bf5_due(date,text,integer,integer) from public,anon;
insert into public.bf_migrations(version) values(5);
commit;
