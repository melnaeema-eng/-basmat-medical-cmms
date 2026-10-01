begin;
create table if not exists public.bf_med_asset_commercial_links(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.bf_organizations(id) on delete cascade,
 asset_id uuid not null references public.bf_med_assets(id) on delete cascade, serial_number text,
 link_type text not null check(link_type in('purchase_request','purchase_order','goods_receipt','invoice','payment','warranty','maintenance_cost','spare_part','other')),
 reference_number text, source_table text, source_id uuid, supplier_name text, amount numeric(18,2), currency text not null default 'SAR', transaction_date date, notes text,
 metadata jsonb not null default '{}'::jsonb, created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists bf_med_asset_commercial_links_asset_idx on public.bf_med_asset_commercial_links(asset_id,transaction_date desc,created_at desc);
create index if not exists bf_med_asset_commercial_links_serial_idx on public.bf_med_asset_commercial_links(organization_id,lower(serial_number));
alter table public.bf_med_asset_commercial_links enable row level security;
drop policy if exists bf_med_asset_commercial_links_select on public.bf_med_asset_commercial_links;
create policy bf_med_asset_commercial_links_select on public.bf_med_asset_commercial_links for select to authenticated using(
 exists(select 1 from public.bf_acl_user_organizations u where u.user_id=auth.uid() and u.organization_id=bf_med_asset_commercial_links.organization_id and coalesce(u.is_active,true))
 or exists(select 1 from public.bf_acl_user_roles ur join public.bf_acl_roles r on r.id=ur.role_id where ur.user_id=auth.uid() and coalesce(ur.is_active,true) and r.role_code='super_admin')
);
create or replace function public.bf_med_add_commercial_link(p_asset uuid,p_link_type text,p_reference_number text default null,p_source_table text default null,p_source_id uuid default null,p_supplier_name text default null,p_amount numeric default null,p_currency text default 'SAR',p_transaction_date date default null,p_notes text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.bf_med_assets; v_id uuid; v_passport uuid; allowed boolean:=false;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into a from public.bf_med_assets where id=p_asset; if not found then raise exception 'Medical asset not found'; end if;
 select exists(select 1 from public.bf_acl_user_roles ur join public.bf_acl_roles r on r.id=ur.role_id left join public.bf_acl_role_permissions rp on rp.role_id=r.id and coalesce(rp.is_allowed,true) left join public.bf_acl_permissions pm on pm.id=rp.permission_id where ur.user_id=auth.uid() and coalesce(ur.is_active,true) and (r.role_code='super_admin' or (ur.organization_id=a.organization_id and pm.permission_key in('medical.assets.manage','medical.inventory.manage','procurement.manage')))) into allowed;
 if not allowed then begin allowed:=public.bf_acl_can_manage_org(a.organization_id); exception when undefined_function then allowed:=false; end; end if;
 if not allowed then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_link_type not in('purchase_request','purchase_order','goods_receipt','invoice','payment','warranty','maintenance_cost','spare_part','other') then raise exception 'Invalid link type'; end if;
 insert into public.bf_med_asset_commercial_links(organization_id,asset_id,serial_number,link_type,reference_number,source_table,source_id,supplier_name,amount,currency,transaction_date,notes,created_by)
 values(a.organization_id,a.id,a.serial_number,p_link_type,nullif(btrim(p_reference_number),''),nullif(btrim(p_source_table),''),p_source_id,nullif(btrim(p_supplier_name),''),p_amount,coalesce(nullif(upper(btrim(p_currency)),''),'SAR'),p_transaction_date,nullif(btrim(p_notes),''),auth.uid()) returning id into v_id;
 select id into v_passport from public.bf_asset_passports where asset_domain='medical' and asset_id=a.id limit 1;
 if v_passport is not null then insert into public.bf_asset_lifecycle_events(organization_id,asset_domain,asset_id,passport_id,event_type,event_title,event_status,details,performed_by)
 values(a.organization_id,'medical',a.id,v_passport,'commercial_link','Commercial / procurement record linked','linked',jsonb_build_object('serial_number',a.serial_number,'link_id',v_id,'link_type',p_link_type,'reference_number',p_reference_number,'supplier_name',p_supplier_name,'amount',p_amount,'currency',coalesce(p_currency,'SAR'),'transaction_date',p_transaction_date),auth.uid()); end if;
 return v_id;
end $$;
grant execute on function public.bf_med_add_commercial_link(uuid,text,text,text,uuid,text,numeric,text,date,text) to authenticated;
grant select on public.bf_med_asset_commercial_links to authenticated;
notify pgrst,'reload schema';
commit;
