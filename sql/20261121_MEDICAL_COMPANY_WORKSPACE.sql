create function public.bf_med_save_company_workspace(p_org uuid,p_identity jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare company uuid:=p_org;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then
  raise exception 'Platform administrator required' using errcode='42501';
 end if;
 if company is null then
  company:=public.bf36_create_organization(p_identity->>'name_ar',p_identity->>'name_en','maintenance_contractor',
   p_identity->>'registration_no',p_identity->>'vat_no',p_identity->>'email',p_identity->>'phone',
   p_identity->>'city',p_identity->>'address');
  insert into public.bf_acl_organization_modules(organization_id,module_code,is_enabled)
   values(company,'shared',true),(company,'medical',true) on conflict do nothing;
  insert into public.bf_acl_organization_permissions(organization_id,permission_key,is_allowed)
   select company,permission_key,true from public.bf_acl_permissions
   where is_active and module_code in ('shared','medical') and permission_key not in ('companies.manage','users.manage')
   on conflict do nothing;
 end if;
 return public.bf_fac_save_company_workspace(company,p_identity);
end
$$;

create function public.bf_med_set_company_workspace_status(p_org uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.bf_is_super_admin() then
  raise exception 'Platform administrator required' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('active','archived') then raise exception 'Invalid company status'; end if;
 update public.bf_organizations set status=p_status where id=p_org
    and (organization_type is null or organization_type in ('maintenance_contractor','service_provider','subcontractor'));
 if not found then raise exception 'Company not found'; end if;
end
$$;
revoke all on function public.bf_med_save_company_workspace(uuid,jsonb),public.bf_med_set_company_workspace_status(uuid,text) from public,anon;
grant execute on function public.bf_med_save_company_workspace(uuid,jsonb),public.bf_med_set_company_workspace_status(uuid,text) to authenticated;
