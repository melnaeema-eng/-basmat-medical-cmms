-- Basmat Medical CMMS - Project Setup V1
-- Project setup references only. No Facilities/PPM/WO/Inventory/Finance changes.

begin;

create or replace function public.bf_med_ps_save_reference(p_kind text,p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid; v_org uuid; v_client uuid; v_contract uuid; v_name text; v_row jsonb;
begin
  if not public.bf_acl_is_super_user(auth.uid()) then
    raise exception 'Project setup administrator permission required' using errcode='42501';
  end if;

  if p_kind='organization' then
    v_name=nullif(trim(p_data->>'name'),'');
    if v_name is null then raise exception 'Company name is required'; end if;
    select id into v_id from public.bf_organizations where lower(trim(name))=lower(v_name) and status<>'archived' limit 1;
    if v_id is null then
      insert into public.bf_organizations(name,status) values(v_name,'active') returning id into v_id;
    end if;
    if not exists(select 1 from public.bf_tenants where id=v_id) then
      insert into public.bf_tenants(id,tenant_code,display_name,legal_name,plan_code,subscription_status,status,settings)
      values(v_id,'MED-'||upper(substr(replace(v_id::text,'-',''),1,10)),v_name,v_name,'professional','trial','active','{}'::jsonb);
    end if;
    select to_jsonb(o) into v_row from public.bf_organizations o where o.id=v_id;
    return v_row;

  elsif p_kind='client' then
    v_org=(p_data->>'organization_id')::uuid; v_name=nullif(trim(p_data->>'name'),'');
    if v_org is null or v_name is null then raise exception 'Organization and owner name are required'; end if;
    if not exists(select 1 from public.bf_tenants where id=v_org) then perform public.bf_med_ensure_org_tenant(v_org); end if;
    select id into v_id from public.bf_clients where organization_id=v_org and lower(trim(name))=lower(v_name) and status<>'archived' limit 1;
    if v_id is null then
      insert into public.bf_clients(tenant_id,organization_id,name,email,phone,status)
      values(v_org,v_org,v_name,nullif(p_data->>'email',''),nullif(p_data->>'phone',''),'active') returning id into v_id;
    end if;
    select to_jsonb(c) into v_row from public.bf_clients c where c.id=v_id; return v_row;

  elsif p_kind='contract' then
    v_org=(p_data->>'organization_id')::uuid; v_client=(p_data->>'client_id')::uuid;
    if v_org is null or v_client is null then raise exception 'Organization and owner are required'; end if;
    select public.bf_med_save_contract(null,v_org,v_client,nullif(p_data->>'contract_number',''),nullif(p_data->>'contract_type',''),
      nullif(p_data->>'start_date','')::date,nullif(p_data->>'end_date','')::date,nullif(p_data->>'contract_value','')::numeric,'active') into v_row;
    return v_row;

  elsif p_kind='site' then
    v_org=(p_data->>'organization_id')::uuid; v_client=(p_data->>'client_id')::uuid; v_contract=nullif(p_data->>'contract_id','')::uuid; v_name=nullif(trim(p_data->>'name'),'');
    if v_org is null or v_client is null or v_name is null then raise exception 'Organization, owner and site name are required'; end if;
    select id into v_id from public.bf_sites where organization_id=v_org and client_id=v_client and lower(trim(name))=lower(v_name) and status<>'archived' limit 1;
    if v_id is null then
      insert into public.bf_sites(organization_id,client_id,contract_id,name,city,address,status)
      values(v_org,v_client,v_contract,v_name,nullif(p_data->>'city',''),nullif(p_data->>'address',''),'active') returning id into v_id;
    end if;
    select to_jsonb(s) into v_row from public.bf_sites s where s.id=v_id; return v_row;
  end if;

  raise exception 'Unsupported project setup reference type: %',p_kind;
end $$;

revoke all on function public.bf_med_ps_save_reference(text,jsonb) from public,anon;
grant execute on function public.bf_med_ps_save_reference(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
