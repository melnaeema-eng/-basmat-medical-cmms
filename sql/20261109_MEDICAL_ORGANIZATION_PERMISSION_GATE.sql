-- MEDICAL project only. Enable the company's medical workflow gate using
-- omer's EXISTING active role grants. No memberships or role grants are added.
-- Validate canonical medical keys through bf_acl_has_permission, not the legacy alias bridge.
begin;
do $fix$
declare
  v_org uuid;
  v_user uuid;
  v_keys text[];
begin
  select id into strict v_org from public.bf_organizations
  where code='ORG-0001' and name='شركة بصمة النوابغ';
  select id into strict v_user from public.bf_profiles
  where lower(email)='melnaeem@gmail.com' and status='active';

  if not exists (
    select 1 from public.bf_acl_user_organizations
    where user_id=v_user and organization_id=v_org and is_active=true
  ) then
    raise exception 'omer has no active company membership; nothing changed';
  end if;

  select array_agg(distinct rp.permission_key) into v_keys
  from public.bf_acl_user_roles ur
  join public.bf_acl_roles r on r.id=ur.role_id and r.is_active=true
  join public.bf_acl_role_permissions rp on rp.role_id=r.id and rp.is_allowed=true
  join public.bf_acl_permissions pm on pm.permission_key=rp.permission_key and pm.is_active=true
  where ur.user_id=v_user and ur.organization_id=v_org and ur.is_active=true
    and (ur.valid_from is null or ur.valid_from<=current_date)
    and (ur.valid_until is null or ur.valid_until>=current_date)
    and rp.permission_key=any(array[
      'medical.assets.view','medical.assets.manage',
      'medical.work_orders.view','medical.work_orders.manage',
      'medical.work_orders.assign','medical.work_orders.execute','medical.work_orders.review',
      'medical.ppm.view','medical.ppm.manage','medical.ppm.execute','medical.ppm.review',
      'medical.inventory.view','medical.inventory.manage',
      'procurement.view','procurement.request','procurement.manage','procurement.approve',
      'documents.view','documents.generate','documents.manage',
      'approvals.view','approvals.request','approvals.manage',
      'notifications.view','reports.view','contracts.view','projects.view'
    ]::text[]);

  if not coalesce(v_keys @> array[
    'medical.assets.view','medical.work_orders.view','medical.ppm.view'
  ]::text[],false) then
    raise exception 'Existing active role grants do not include the three medical view permissions. Nothing changed; inspect role-permission mappings';
  end if;

  update public.bf_acl_organization_permissions
  set is_allowed=true
  where organization_id=v_org and permission_key=any(v_keys);

  insert into public.bf_acl_organization_permissions
    (organization_id,permission_key,is_allowed)
  select v_org,k,true from unnest(v_keys) as t(k)
  where not exists (
    select 1 from public.bf_acl_organization_permissions op
    where op.organization_id=v_org and op.permission_key=k
  );

  if not coalesce(public.bf_acl_has_permission(v_org,'medical.assets.view',v_user),false)
     or not coalesce(public.bf_acl_has_permission(v_org,'medical.work_orders.view',v_user),false)
     or not coalesce(public.bf_acl_has_permission(v_org,'medical.ppm.view',v_user),false) then
    raise exception 'Direct medical permission check still fails. All changes rolled back; inspect bf_acl_has_permission';
  end if;
end
$fix$;
commit;

select 'PASS — medical workflow enabled for ORG-0001 according to existing roles' as result;
