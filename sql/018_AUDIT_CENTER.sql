-- Basmat Facilities CMMS — Sprint 17
-- Unified Audit & Activity Center
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=16)
 then raise exception 'Install and verify Sprint 16 first'; end if;
 if exists(select 1 from public.bf_migrations where version=17)
 then raise exception 'Sprint 17 already installed'; end if;
 if to_regclass('public.bf_corrective_events') is null
 or to_regclass('public.bf_ppm_events') is null
 or to_regclass('public.bf8_material_events') is null
 or to_regclass('public.bf9_events') is null
 or to_regclass('public.bf11_events') is null
 or to_regclass('public.bf_asset_events') is null
 then raise exception 'Required audit sources are missing'; end if;
end $$;

insert into public.bf_permissions(code,description)
values ('audit.view','View unified operational audit trail')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id from public.bf_roles r cross join public.bf_permissions p
where p.code='audit.view'
and r.code in('company_admin','facility_manager','maintenance_manager','supervisor')
on conflict do nothing;

create or replace function public.bf17_audit_feed(
 p_org uuid default null,
 p_source text default null,
 p_from timestamptz default (now()-interval '30 days'),
 p_to timestamptz default now(),
 p_limit integer default 200,
 p_offset integer default 0
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
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid date range'; end if;
 if p_to-p_from>interval '366 days' then raise exception 'Date range cannot exceed 366 days'; end if;
 if p_limit is null or p_limit not between 1 and 500 or p_offset is null or p_offset<0
 then raise exception 'Invalid pagination'; end if;
 if p_source is not null and p_source not in('corrective','ppm','field','inventory','approvals','assets')
 then raise exception 'Invalid audit source'; end if;
 if p_org is not null and not public.bf4_staff(p_org,'audit.view')
 then raise exception 'Permission denied' using errcode='42501'; end if;

 with feed as (
  select e.organization_id,'corrective'::text source,e.id::text event_id,e.actor_id,e.action,e.details,e.created_at,
    coalesce(e.work_order_id,e.request_id)::text entity_id,
    case when e.work_order_id is not null then 'work_order' else 'service_request' end entity_type
  from public.bf_corrective_events e
  where public.bf4_staff(e.organization_id,'audit.view')

  union all
  select e.organization_id,'ppm',e.id::text,e.actor_id,e.action,e.details,e.created_at,
    coalesce(e.job_id,e.entity_id)::text,coalesce(e.entity_type,'ppm')
  from public.bf_ppm_events e
  where public.bf4_staff(e.organization_id,'audit.view')

  union all
  select e.organization_id,'field',e.id::text,e.actor_id,e.action,e.details,e.created_at,
    e.work_order_id::text,'work_order'
  from public.bf9_events e
  where public.bf4_staff(e.organization_id,'audit.view')

  union all
  select e.organization_id,'inventory',e.id::text,e.actor_id,e.action,
    e.details||jsonb_build_object('quantity',e.quantity),e.created_at,
    e.request_id::text,'material_request'
  from public.bf8_material_events e
  where public.bf4_staff(e.organization_id,'audit.view')

  union all
  select e.organization_id,'approvals',e.id::text,e.actor_id,e.action,e.details,e.created_at,
    e.approval_id::text,'approval'
  from public.bf11_events e
  where public.bf4_staff(e.organization_id,'audit.view')

  union all
  select e.organization_id,'assets',e.id::text,e.actor_id,e.action,e.details,e.created_at,
    e.asset_id::text,'asset'
  from public.bf_asset_events e
  where public.bf4_staff(e.organization_id,'audit.view')
 ),
 filtered as (
  select f.*,p.full_name,p.email
  from feed f
  left join public.bf_profiles p on p.id=f.actor_id
  where (p_org is null or f.organization_id=p_org)
    and (p_source is null or f.source=p_source)
    and f.created_at between p_from and p_to
 )
 select jsonb_build_object(
   'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.event_id desc)
     from (select * from filtered order by created_at desc,event_id desc limit p_limit offset p_offset)x),'[]'::jsonb),
   'total',(select count(*) from filtered),
   'has_more',(select count(*) from filtered)>p_offset+p_limit
 ) into result;
 return result;
end $$;

revoke all on function public.bf17_audit_feed(uuid,text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.bf17_audit_feed(uuid,text,timestamptz,timestamptz,integer,integer) to authenticated;

insert into public.bf_migrations(version) values(17);
commit;
