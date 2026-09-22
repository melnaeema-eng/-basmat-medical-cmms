begin;

-- Master Library editor RPCs.
-- Only the platform Super Admin may change the shared master library.

create or replace function public.bf_master_admin_asset_upsert(
 p_id uuid default null,
 p_system_code text default null,
 p_code text default null,
 p_name_ar text default null,
 p_name_en text default null,
 p_icon_text text default '🔧',
 p_group_ar text default null,
 p_group_en text default null,
 p_description_ar text default null,
 p_description_en text default null,
 p_default_criticality text default 'medium',
 p_expected_life_years integer default null,
 p_procurement_class text default 'standard',
 p_default_lead_time_days integer default null,
 p_critical_spare boolean default false,
 p_stock_strategy text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then
  raise exception 'Super Admin permission required' using errcode='42501';
 end if;

 if nullif(trim(p_system_code),'') is null
    or nullif(trim(p_code),'') is null
    or nullif(trim(p_name_ar),'') is null
    or nullif(trim(p_name_en),'') is null then
  raise exception 'System, code, Arabic name and English name are required';
 end if;

 if p_default_criticality not in ('low','medium','high','critical') then
  raise exception 'Invalid criticality';
 end if;
 if p_procurement_class not in ('standard','long_lead','special_order') then
  raise exception 'Invalid procurement class';
 end if;

 if p_id is null then
  insert into public.bf_master_asset_types(
   system_code,code,name_ar,name_en,icon_text,group_ar,group_en,
   description_ar,description_en,default_criticality,expected_life_years,
   procurement_class,default_lead_time_days,critical_spare,stock_strategy,status
  )
  values(
   upper(trim(p_system_code)),upper(trim(p_code)),trim(p_name_ar),trim(p_name_en),
   coalesce(nullif(trim(p_icon_text),''),'🔧'),nullif(trim(p_group_ar),''),nullif(trim(p_group_en),''),
   nullif(trim(p_description_ar),''),nullif(trim(p_description_en),''),
   p_default_criticality,p_expected_life_years,p_procurement_class,
   p_default_lead_time_days,coalesce(p_critical_spare,false),nullif(trim(p_stock_strategy),''),
   'active'
  )
  returning id into v_id;
 else
  update public.bf_master_asset_types
  set system_code=upper(trim(p_system_code)),
      code=upper(trim(p_code)),
      name_ar=trim(p_name_ar),
      name_en=trim(p_name_en),
      icon_text=coalesce(nullif(trim(p_icon_text),''),'🔧'),
      group_ar=nullif(trim(p_group_ar),''),
      group_en=nullif(trim(p_group_en),''),
      description_ar=nullif(trim(p_description_ar),''),
      description_en=nullif(trim(p_description_en),''),
      default_criticality=p_default_criticality,
      expected_life_years=p_expected_life_years,
      procurement_class=p_procurement_class,
      default_lead_time_days=p_default_lead_time_days,
      critical_spare=coalesce(p_critical_spare,false),
      stock_strategy=nullif(trim(p_stock_strategy),''),
      status='active'
  where id=p_id
  returning id into v_id;
  if v_id is null then raise exception 'Asset type not found'; end if;
 end if;

 notify pgrst,'reload schema';
 return v_id;
end $$;

create or replace function public.bf_master_admin_manufacturer_upsert(
 p_id uuid default null,
 p_code text default null,
 p_name text default null,
 p_short_name text default null,
 p_website text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then
  raise exception 'Super Admin permission required' using errcode='42501';
 end if;
 if nullif(trim(p_code),'') is null or nullif(trim(p_name),'') is null then
  raise exception 'Code and manufacturer name are required';
 end if;

 if p_id is null then
  -- Reuse existing exact name where possible.
  select id into v_id from public.bf_master_manufacturers where lower(name)=lower(trim(p_name)) limit 1;
  if v_id is null then
   insert into public.bf_master_manufacturers(code,name,short_name,website,status)
   values(upper(trim(p_code)),trim(p_name),nullif(trim(p_short_name),''),nullif(trim(p_website),''),'active')
   returning id into v_id;
  else
   update public.bf_master_manufacturers
   set short_name=coalesce(nullif(trim(p_short_name),''),short_name),
       website=coalesce(nullif(trim(p_website),''),website),
       status='active'
   where id=v_id;
  end if;
 else
  update public.bf_master_manufacturers
  set code=upper(trim(p_code)),
      name=trim(p_name),
      short_name=nullif(trim(p_short_name),''),
      website=nullif(trim(p_website),''),
      status='active'
  where id=p_id
  returning id into v_id;
  if v_id is null then raise exception 'Manufacturer not found'; end if;
 end if;
 return v_id;
end $$;

create or replace function public.bf_master_admin_option_upsert(
 p_id uuid default null,
 p_asset_type_id uuid default null,
 p_manufacturer_id uuid default null,
 p_model_family text default null,
 p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then
  raise exception 'Super Admin permission required' using errcode='42501';
 end if;
 if p_asset_type_id is null or p_manufacturer_id is null then
  raise exception 'Asset type and manufacturer are required';
 end if;

 if p_id is null then
  select id into v_id
  from public.bf_master_asset_options
  where asset_type_id=p_asset_type_id
    and manufacturer_id=p_manufacturer_id
    and coalesce(model_family,'')=coalesce(nullif(trim(p_model_family),''),'')
  limit 1;

  if v_id is null then
   insert into public.bf_master_asset_options(asset_type_id,manufacturer_id,model_family,notes,status)
   values(p_asset_type_id,p_manufacturer_id,nullif(trim(p_model_family),''),nullif(trim(p_notes),''),'active')
   returning id into v_id;
  else
   update public.bf_master_asset_options
   set notes=coalesce(nullif(trim(p_notes),''),notes),status='active'
   where id=v_id;
  end if;
 else
  update public.bf_master_asset_options
  set asset_type_id=p_asset_type_id,
      manufacturer_id=p_manufacturer_id,
      model_family=nullif(trim(p_model_family),''),
      notes=nullif(trim(p_notes),''),
      status='active'
  where id=p_id
  returning id into v_id;
  if v_id is null then raise exception 'Asset option not found'; end if;
 end if;
 return v_id;
end $$;

create or replace function public.bf_master_admin_template_upsert(
 p_id uuid default null,
 p_asset_type_id uuid default null,
 p_manufacturer_id uuid default null,
 p_title_ar text default null,
 p_title_en text default null,
 p_frequency text default 'monthly',
 p_estimated_minutes integer default 60,
 p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then
  raise exception 'Super Admin permission required' using errcode='42501';
 end if;
 if p_asset_type_id is null or nullif(trim(p_title_ar),'') is null or nullif(trim(p_title_en),'') is null then
  raise exception 'Asset type and template titles are required';
 end if;
 if p_frequency not in ('daily','weekly','monthly','quarterly','semiannual','annual') then
  raise exception 'Invalid frequency';
 end if;
 if coalesce(p_estimated_minutes,0)<=0 then raise exception 'Estimated minutes must be positive'; end if;

 if p_id is null then
  insert into public.bf_master_ppm_templates(
   asset_type_id,manufacturer_id,title_ar,title_en,frequency,estimated_minutes,reference,status
  )
  values(
   p_asset_type_id,p_manufacturer_id,trim(p_title_ar),trim(p_title_en),
   p_frequency,p_estimated_minutes,nullif(trim(p_reference),''),'active'
  )
  returning id into v_id;
 else
  update public.bf_master_ppm_templates
  set asset_type_id=p_asset_type_id,
      manufacturer_id=p_manufacturer_id,
      title_ar=trim(p_title_ar),
      title_en=trim(p_title_en),
      frequency=p_frequency,
      estimated_minutes=p_estimated_minutes,
      reference=nullif(trim(p_reference),''),
      status='active'
  where id=p_id
  returning id into v_id;
  if v_id is null then raise exception 'PPM template not found'; end if;
 end if;
 return v_id;
end $$;

create or replace function public.bf_master_admin_step_upsert(
 p_id uuid default null,
 p_template_id uuid default null,
 p_seq integer default 1,
 p_title_ar text default null,
 p_title_en text default null,
 p_instructions_ar text default '',
 p_instructions_en text default '',
 p_task_type text default 'inspection',
 p_response_type text default 'pass_fail',
 p_unit text default null,
 p_safety_notes text default null,
 p_tools text default null,
 p_materials text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then
  raise exception 'Super Admin permission required' using errcode='42501';
 end if;
 if p_template_id is null or coalesce(p_seq,0)<=0
    or nullif(trim(p_title_ar),'') is null or nullif(trim(p_title_en),'') is null then
  raise exception 'Template, sequence and titles are required';
 end if;
 if p_task_type not in ('inspection','cleaning','lubrication','adjustment','test','replacement','safety','other') then
  raise exception 'Invalid task type';
 end if;
 if p_response_type not in ('pass_fail','reading','text') then
  raise exception 'Invalid response type';
 end if;

 if p_id is null then
  insert into public.bf_master_ppm_steps(
   template_id,seq,title_ar,title_en,instructions_ar,instructions_en,
   task_type,response_type,unit,safety_notes,tools,materials
  )
  values(
   p_template_id,p_seq,trim(p_title_ar),trim(p_title_en),
   coalesce(p_instructions_ar,''),coalesce(p_instructions_en,''),
   p_task_type,p_response_type,nullif(trim(p_unit),''),
   nullif(trim(p_safety_notes),''),nullif(trim(p_tools),''),nullif(trim(p_materials),'')
  )
  returning id into v_id;
 else
  update public.bf_master_ppm_steps
  set template_id=p_template_id,
      seq=p_seq,
      title_ar=trim(p_title_ar),
      title_en=trim(p_title_en),
      instructions_ar=coalesce(p_instructions_ar,''),
      instructions_en=coalesce(p_instructions_en,''),
      task_type=p_task_type,
      response_type=p_response_type,
      unit=nullif(trim(p_unit),''),
      safety_notes=nullif(trim(p_safety_notes),''),
      tools=nullif(trim(p_tools),''),
      materials=nullif(trim(p_materials),'')
  where id=p_id
  returning id into v_id;
  if v_id is null then raise exception 'PPM step not found'; end if;
 end if;
 return v_id;
end $$;

create or replace function public.bf_master_admin_archive(p_entity text,p_id uuid,p_active boolean default false)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_status text:=case when p_active then 'active' else 'inactive' end;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then
  raise exception 'Super Admin permission required' using errcode='42501';
 end if;

 case p_entity
  when 'asset' then update public.bf_master_asset_types set status=v_status where id=p_id;
  when 'manufacturer' then update public.bf_master_manufacturers set status=v_status where id=p_id;
  when 'option' then update public.bf_master_asset_options set status=v_status where id=p_id;
  when 'template' then update public.bf_master_ppm_templates set status=v_status where id=p_id;
  else raise exception 'Unsupported entity';
 end case;
 return true;
end $$;

revoke all on function public.bf_master_admin_asset_upsert(uuid,text,text,text,text,text,text,text,text,text,text,integer,text,integer,boolean,text) from public,anon;
grant execute on function public.bf_master_admin_asset_upsert(uuid,text,text,text,text,text,text,text,text,text,text,integer,text,integer,boolean,text) to authenticated;

revoke all on function public.bf_master_admin_manufacturer_upsert(uuid,text,text,text,text) from public,anon;
grant execute on function public.bf_master_admin_manufacturer_upsert(uuid,text,text,text,text) to authenticated;

revoke all on function public.bf_master_admin_option_upsert(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.bf_master_admin_option_upsert(uuid,uuid,uuid,text,text) to authenticated;

revoke all on function public.bf_master_admin_template_upsert(uuid,uuid,uuid,text,text,text,integer,text) from public,anon;
grant execute on function public.bf_master_admin_template_upsert(uuid,uuid,uuid,text,text,text,integer,text) to authenticated;

revoke all on function public.bf_master_admin_step_upsert(uuid,uuid,integer,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.bf_master_admin_step_upsert(uuid,uuid,integer,text,text,text,text,text,text,text,text,text,text) to authenticated;

revoke all on function public.bf_master_admin_archive(text,uuid,boolean) from public,anon;
grant execute on function public.bf_master_admin_archive(text,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
