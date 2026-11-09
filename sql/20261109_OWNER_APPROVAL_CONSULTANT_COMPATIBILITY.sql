begin;
do $guard$ begin
 if regexp_replace(pg_get_functiondef('public.bf11_action(text,uuid,jsonb)'::regprocedure),'[[:space:]]','','g')<>regexp_replace($original$CREATE OR REPLACE FUNCTION public.bf11_action(p_action text, p_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 a public.bf11_approvals;
 w public.bf_work_orders;
 j public.bf_ppm_jobs;

 org uuid;
 client uuid;
 site uuid;
 entity uuid;

 reviewer text;
 next_round integer;

 actor uuid:=auth.uid();

begin

 if actor is null
 or not exists(
 select 1
 from public.bf_profiles
 where id=actor
 and status='active'
 )
 then
 raise exception 'Authentication required'
 using errcode='42501';
 end if;

 if p_data is null
 or jsonb_typeof(p_data)<>'object'
 or pg_column_size(p_data)>32768
 then
 raise exception 'Invalid payload';
 end if;


 if p_action='create' then

 org:=(p_data->>'organization_id')::uuid;
 client:=(p_data->>'client_id')::uuid;
 site:=(p_data->>'site_id')::uuid;
 entity:=(p_data->>'entity_id')::uuid;
 reviewer:=p_data->>'reviewer_type';

 if reviewer not in(
 'owner',
 'consultant'
 )
 then
 raise exception 'Invalid reviewer type';
 end if;

 if not public.bf4_staff(
 org,
 'approvals.request'
 )
 then
 raise exception 'Permission denied'
 using errcode='42501';
 end if;

 if length(
 btrim(
 coalesce(
 p_data->>'subject',
 ''
 )
 )
 ) not between 3 and 250
 then
 raise exception 'Subject is required';
 end if;

 if coalesce(
 length(
 p_data->>'request_comment'
 ),
 0
 )>4000
 then
 raise exception 'Comment too long';
 end if;


 if reviewer='owner'
 and not exists(

 select 1

 from public.bf_acl_user_projects up

 join public.bf35_projects prj
 on prj.id=up.project_id
 and prj.organization_id=up.organization_id

 join public.bf_acl_user_roles ur
 on ur.user_id=up.user_id
 and ur.organization_id=up.organization_id
 and ur.is_active=true

 join public.bf_acl_roles rr
 on rr.id=ur.role_id
 and rr.role_code='owner_rep'
 and rr.is_active=true

 join public.bf_profiles p
 on p.id=up.user_id
 and p.status='active'

 where up.organization_id=org
 and up.is_active=true
 and prj.client_id=client

 )
 then
 raise exception
 'No active owner/client portal user for this client';
 end if;


 if reviewer='consultant'
 and not exists(
 select 1
 from public.bf11_consultant_access ca
 join public.bf_profiles p
 on p.id=ca.user_id
 where ca.organization_id=org
 and ca.client_id=client
 and p.status='active'
 )
 then
 raise exception
 'No active consultant portal user for this client';
 end if;


 if p_data->>'entity_type'='work_order' then

 select *
 into w
 from public.bf_work_orders
 where id=entity
 and organization_id=org
 and client_id=client
 and site_id=site
 for update;

 if not found
 or w.status<>'approved'
 then
 raise exception
 'Only internally approved work orders may be submitted';
 end if;


 elsif p_data->>'entity_type'='ppm_job' then

 select *
 into j
 from public.bf_ppm_jobs
 where id=entity
 and organization_id=org
 and client_id=client
 and site_id=site
 for update;

 if not found
 or j.status<>'approved'
 then
 raise exception
 'Only internally approved PPM jobs may be submitted';
 end if;

 else
 raise exception 'Invalid entity type';
 end if;


 if exists(
 select 1
 from public.bf11_approvals
 where organization_id=org
 and entity_type=p_data->>'entity_type'
 and entity_id=entity
 and reviewer_type=reviewer
 and status='pending'
 )
 then
 raise exception
 'A pending approval already exists';
 end if;


 select coalesce(max(round),0)+1
 into next_round
 from public.bf11_approvals
 where organization_id=org
 and entity_type=p_data->>'entity_type'
 and entity_id=entity
 and reviewer_type=reviewer;


 insert into public.bf11_approvals(
 organization_id,
 client_id,
 site_id,
 entity_type,
 entity_id,
 reviewer_type,
 round,
 subject,
 request_comment,
 due_at,
 requested_by
 )
 values(
 org,
 client,
 site,
 p_data->>'entity_type',
 entity,
 reviewer,
 next_round,
 btrim(p_data->>'subject'),
 coalesce(
 p_data->>'request_comment',
 ''
 ),
 nullif(
 p_data->>'due_at',
 ''
 )::timestamptz,
 actor
 )
 returning *
 into a;


 insert into public.bf11_events(
 organization_id,
 approval_id,
 actor_id,
 action,
 details
 )
 values(
 org,
 a.id,
 actor,
 'created',
 jsonb_build_object(
 'reviewer_type',
 reviewer,
 'round',
 next_round
 )
 );

 return a.id;

 end if;


 select *
 into a
 from public.bf11_approvals
 where id=p_id
 for update;

 if not found then
 raise exception 'Approval not found';
 end if;


 if p_action in(
 'approve',
 'reject'
 )
 then

 if a.status<>'pending' then
 raise exception 'Approval is not pending';
 end if;

 if actor=a.requested_by then
 raise exception
 'Requester cannot decide own approval';
 end if;


 if a.reviewer_type='owner'
 and not public.bf11_owner(
 a.organization_id,
 a.client_id
 )
 then
 raise exception 'Owner authorization required'
 using errcode='42501';
 end if;


 if a.reviewer_type='consultant'
 and not public.bf11_consultant(
 a.organization_id,
 a.client_id
 )
 then
 raise exception 'Consultant authorization required'
 using errcode='42501';
 end if;


 if p_action='reject'
 and length(
 btrim(
 coalesce(
 p_data->>'comment',
 ''
 )
 )
 )<5
 then
 raise exception
 'Rejection comment is required';
 end if;


 update public.bf11_approvals
 set
 status=
 case
 when p_action='approve'
 then 'approved'
 else 'rejected'
 end,
 decided_by=actor,
 decided_at=now(),
 decision_comment=
 nullif(
 btrim(
 coalesce(
 p_data->>'comment',
 ''
 )
 ),
 ''
 )
 where id=a.id;


 elsif p_action='cancel' then

 if a.status<>'pending' then
 raise exception
 'Only pending approvals can be cancelled';
 end if;

 if not public.bf4_staff(
 a.organization_id,
 'approvals.manage'
 )
 then
 raise exception 'Permission denied'
 using errcode='42501';
 end if;

 if length(
 btrim(
 coalesce(
 p_data->>'comment',
 ''
 )
 )
 )<5
 then
 raise exception
 'Cancellation comment is required';
 end if;

 update public.bf11_approvals
 set
 status='cancelled',
 cancelled_by=actor,
 cancelled_at=now(),
 decision_comment=
 btrim(
 p_data->>'comment'
 )
 where id=a.id;

 else
 raise exception 'Invalid approval action';
 end if;


 insert into public.bf11_events(
 organization_id,
 approval_id,
 actor_id,
 action,
 details
 )
 values(
 a.organization_id,
 a.id,
 actor,
 p_action,
 jsonb_build_object(
 'comment',
 coalesce(
 p_data->>'comment',
 ''
 )
 )
 );

 return a.id;

end;
$function$
$original$,'[[:space:]]','','g') then raise exception 'Live approval function changed'; end if;
 execute $newdef$CREATE OR REPLACE FUNCTION public.bf11_action(p_action text, p_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 a public.bf11_approvals;
 w public.bf_work_orders;
 j public.bf_ppm_jobs;

 org uuid;
 client uuid;
 site uuid;
 entity uuid;

 reviewer text;
 next_round integer;

 actor uuid:=auth.uid();

begin

 if actor is null
 or not exists(
 select 1
 from public.bf_profiles
 where id=actor
 and status='active'
 )
 then
 raise exception 'Authentication required'
 using errcode='42501';
 end if;

 if p_data is null
 or jsonb_typeof(p_data)<>'object'
 or pg_column_size(p_data)>32768
 then
 raise exception 'Invalid payload';
 end if;


 if p_action='create' then

 org:=(p_data->>'organization_id')::uuid;
 client:=(p_data->>'client_id')::uuid;
 site:=(p_data->>'site_id')::uuid;
 entity:=(p_data->>'entity_id')::uuid;
 reviewer:=p_data->>'reviewer_type';

 if reviewer not in(
 'owner',
 'consultant'
 )
 then
 raise exception 'Invalid reviewer type';
 end if;

 if not public.bf4_staff(
 org,
 'approvals.request'
 )
 then
 raise exception 'Permission denied'
 using errcode='42501';
 end if;

 if length(
 btrim(
 coalesce(
 p_data->>'subject',
 ''
 )
 )
 ) not between 3 and 250
 then
 raise exception 'Subject is required';
 end if;

 if coalesce(
 length(
 p_data->>'request_comment'
 ),
 0
 )>4000
 then
 raise exception 'Comment too long';
 end if;


 if reviewer='owner'
 and not exists(

 select 1

 from public.bf_acl_user_projects up

 join public.bf35_projects prj
 on prj.id=up.project_id
 and prj.organization_id=up.organization_id

 join public.bf_acl_user_roles ur
 on ur.user_id=up.user_id
 and ur.organization_id=up.organization_id
 and ur.is_active=true

 join public.bf_acl_roles rr
 on rr.id=ur.role_id
 and rr.role_code='owner_rep'
 and rr.is_active=true

 join public.bf_profiles p
 on p.id=up.user_id
 and p.status='active'

 where up.organization_id=org
 and up.is_active=true
 and prj.client_id=client

 )
 then
 raise exception
 'No active owner/client portal user for this client';
 end if;


 if reviewer='consultant' then
 -- Legacy consultant relation guarded 20261109
 if to_regclass('public.bf11_consultant_access') is null then
 raise exception 'No active consultant portal user for this client';
 end if;
 execute 'select count(*) from public.bf11_consultant_access ca join public.bf_profiles p on p.id=ca.user_id where ca.organization_id=$1 and ca.client_id=$2 and p.status=''active''' into next_round using org,client;
 if next_round=0 then raise exception 'No active consultant portal user for this client'; end if;
 end if;


 if p_data->>'entity_type'='work_order' then

 select *
 into w
 from public.bf_work_orders
 where id=entity
 and organization_id=org
 and client_id=client
 and site_id=site
 for update;

 if not found
 or w.status<>'approved'
 then
 raise exception
 'Only internally approved work orders may be submitted';
 end if;


 elsif p_data->>'entity_type'='ppm_job' then

 select *
 into j
 from public.bf_ppm_jobs
 where id=entity
 and organization_id=org
 and client_id=client
 and site_id=site
 for update;

 if not found
 or j.status<>'approved'
 then
 raise exception
 'Only internally approved PPM jobs may be submitted';
 end if;

 else
 raise exception 'Invalid entity type';
 end if;


 if exists(
 select 1
 from public.bf11_approvals
 where organization_id=org
 and entity_type=p_data->>'entity_type'
 and entity_id=entity
 and reviewer_type=reviewer
 and status='pending'
 )
 then
 raise exception
 'A pending approval already exists';
 end if;


 select coalesce(max(round),0)+1
 into next_round
 from public.bf11_approvals
 where organization_id=org
 and entity_type=p_data->>'entity_type'
 and entity_id=entity
 and reviewer_type=reviewer;


 insert into public.bf11_approvals(
 organization_id,
 client_id,
 site_id,
 entity_type,
 entity_id,
 reviewer_type,
 round,
 subject,
 request_comment,
 due_at,
 requested_by
 )
 values(
 org,
 client,
 site,
 p_data->>'entity_type',
 entity,
 reviewer,
 next_round,
 btrim(p_data->>'subject'),
 coalesce(
 p_data->>'request_comment',
 ''
 ),
 nullif(
 p_data->>'due_at',
 ''
 )::timestamptz,
 actor
 )
 returning *
 into a;


 insert into public.bf11_events(
 organization_id,
 approval_id,
 actor_id,
 action,
 details
 )
 values(
 org,
 a.id,
 actor,
 'created',
 jsonb_build_object(
 'reviewer_type',
 reviewer,
 'round',
 next_round
 )
 );

 return a.id;

 end if;


 select *
 into a
 from public.bf11_approvals
 where id=p_id
 for update;

 if not found then
 raise exception 'Approval not found';
 end if;


 if p_action in(
 'approve',
 'reject'
 )
 then

 if a.status<>'pending' then
 raise exception 'Approval is not pending';
 end if;

 if actor=a.requested_by then
 raise exception
 'Requester cannot decide own approval';
 end if;


 if a.reviewer_type='owner'
 and not public.bf11_owner(
 a.organization_id,
 a.client_id
 )
 then
 raise exception 'Owner authorization required'
 using errcode='42501';
 end if;


 if a.reviewer_type='consultant'
 and not public.bf11_consultant(
 a.organization_id,
 a.client_id
 )
 then
 raise exception 'Consultant authorization required'
 using errcode='42501';
 end if;


 if p_action='reject'
 and length(
 btrim(
 coalesce(
 p_data->>'comment',
 ''
 )
 )
 )<5
 then
 raise exception
 'Rejection comment is required';
 end if;


 update public.bf11_approvals
 set
 status=
 case
 when p_action='approve'
 then 'approved'
 else 'rejected'
 end,
 decided_by=actor,
 decided_at=now(),
 decision_comment=
 nullif(
 btrim(
 coalesce(
 p_data->>'comment',
 ''
 )
 ),
 ''
 )
 where id=a.id;


 elsif p_action='cancel' then

 if a.status<>'pending' then
 raise exception
 'Only pending approvals can be cancelled';
 end if;

 if not public.bf4_staff(
 a.organization_id,
 'approvals.manage'
 )
 then
 raise exception 'Permission denied'
 using errcode='42501';
 end if;

 if length(
 btrim(
 coalesce(
 p_data->>'comment',
 ''
 )
 )
 )<5
 then
 raise exception
 'Cancellation comment is required';
 end if;

 update public.bf11_approvals
 set
 status='cancelled',
 cancelled_by=actor,
 cancelled_at=now(),
 decision_comment=
 btrim(
 p_data->>'comment'
 )
 where id=a.id;

 else
 raise exception 'Invalid approval action';
 end if;


 insert into public.bf11_events(
 organization_id,
 approval_id,
 actor_id,
 action,
 details
 )
 values(
 a.organization_id,
 a.id,
 actor,
 p_action,
 jsonb_build_object(
 'comment',
 coalesce(
 p_data->>'comment',
 ''
 )
 )
 );

 return a.id;

end;
$function$
$newdef$;
end $guard$;
commit;
select 'PASS — owner approval no longer references the absent consultant access relation' as result;