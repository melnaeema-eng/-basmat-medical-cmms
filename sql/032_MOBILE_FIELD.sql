-- Basmat Facilities CMMS — Sprint 31
-- Mobile Field Workspace & Asset QR Lookup
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=30)
 then raise exception 'Install and verify Sprint 30 first'; end if;
 if exists(select 1 from public.bf_migrations where version=31)
 then raise exception 'Sprint 31 already installed'; end if;
 if to_regclass('public.bf_work_orders') is null
 or to_regclass('public.bf_work_order_assignments') is null
 or to_regclass('public.bf_assets') is null
 or to_regclass('public.bf9_visits') is null
 then raise exception 'Required mobile field sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description)
values ('mobile-field.view','Use mobile field workspace and asset lookup')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where p.code='mobile-field.view'
and r.code in('company_admin','facility_manager','maintenance_manager','supervisor','technician')
on conflict do nothing;

create or replace function public.bf31_workspace(p_limit integer default 100)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(
   select 1 from public.bf_profiles p where p.id=auth.uid() and p.status='active'
 )
 then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 300 then raise exception 'Invalid limit'; end if;

 with assigned as (
   select
    w.id,w.organization_id,w.client_id,w.site_id,w.asset_id,w.work_order_number,w.title,w.description,
    w.priority,w.status,w.sla_status,w.response_due_at,w.completion_due_at,w.started_at,w.created_at,
    c.name client_name,s.name site_name,
    a.asset_tag,a.name_ar asset_name_ar,a.name_en asset_name_en,a.criticality,a.condition,a.operational_status,
    v.id open_visit_id,v.visit_number,v.started_at visit_started_at
   from public.bf_work_orders w
   join public.bf_work_order_assignments wa on wa.work_order_id=w.id and wa.user_id=auth.uid()
   join public.bf_clients c on c.id=w.client_id
   join public.bf_sites s on s.id=w.site_id
   left join public.bf_assets a on a.id=w.asset_id
   left join public.bf9_visits v on v.work_order_id=w.id and v.technician_id=auth.uid() and v.status='open'
   where w.status in('assigned','accepted','in_progress','on_hold')
     and public.bf4_staff(w.organization_id,'mobile-field.view')
   order by
    case w.priority when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 else 4 end,
    w.completion_due_at nulls last,w.created_at
   limit p_limit
 ),
 active_visit as (
   select v.id,v.work_order_id,v.visit_number,v.started_at,w.work_order_number,w.title
   from public.bf9_visits v
   join public.bf_work_orders w on w.id=v.work_order_id
   where v.technician_id=auth.uid() and v.status='open'
   limit 1
 )
 select jsonb_build_object(
  'work_orders',coalesce((select jsonb_agg(to_jsonb(x)) from assigned x),'[]'::jsonb),
  'active_visit',(select to_jsonb(x) from active_visit x),
  'summary',jsonb_build_object(
    'assigned',(select count(*) from assigned),
    'p1',(select count(*) from assigned where priority='P1'),
    'sla_breached',(select count(*) from assigned where sla_status='breached'),
    'due_today',(select count(*) from assigned where completion_due_at::date=current_date),
    'active_visit',(select count(*) from active_visit)
  )
 ) into result;

 return result;
end $$;

create or replace function public.bf31_asset_lookup(p_code text)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb; code text:=btrim(coalesce(p_code,''));
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if length(code) not between 1 and 200 then raise exception 'Asset code is required'; end if;

 with candidate as (
   select a.*,c.name client_name,s.name site_name
   from public.bf_assets a
   join public.bf_clients c on c.id=a.client_id
   join public.bf_sites s on s.id=a.site_id
   where a.status='active'
     and (
       lower(a.asset_tag)=lower(code)
       or (code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' and a.id=code::uuid)
     )
     and (
       public.bf4_staff(a.organization_id,'mobile-field.view')
       or public.bf4_client(a.organization_id,a.client_id)
     )
   limit 1
 ),
 work_orders as (
   select w.id,w.work_order_number,w.title,w.priority,w.status,w.sla_status,w.completion_due_at
   from public.bf_work_orders w
   join candidate a on a.id=w.asset_id
   where w.status not in('closed','cancelled')
     and public.bf9_view(w.id)
   order by w.created_at desc
   limit 20
 )
 select jsonb_build_object(
   'asset',(select to_jsonb(x) from candidate x),
   'work_orders',coalesce((select jsonb_agg(to_jsonb(x)) from work_orders x),'[]'::jsonb)
 ) into result;

 if result->'asset' is null then raise exception 'Asset not found or access denied'; end if;
 return result;
end $$;

revoke all on function public.bf31_workspace(integer),
 public.bf31_asset_lookup(text)
from public,anon;

grant execute on function public.bf31_workspace(integer),
 public.bf31_asset_lookup(text)
to authenticated;

insert into public.bf_migrations(version) values(31);
commit;
