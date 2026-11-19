CREATE OR REPLACE FUNCTION public.bf9_action(p_action text, p_wo uuid, p_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.bf_work_orders;v public.bf9_visits;e public.bf9_evidence;
 result_id uuid;start_time timestamptz;end_time timestamptz;actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.bf_profiles where id=actor and status='active')
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>32768
 then raise exception 'Invalid payload';end if;
 select * into w from public.bf_work_orders where id=p_wo;
 if not found then raise exception 'Work order not found';end if;
 if not public.bf9_can(p_wo) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_action='start_visit' then
  if not public.bf9_can(p_wo,true) or w.status not in('accepted','in_progress')
  then raise exception 'Assigned technician and active work order required';end if;
  loop
   select * into v from public.bf9_visits
   where technician_id=actor and status='open' for update;
   if found then
    if v.work_order_id=w.id then return v.id; end if;
    if v.organization_id=w.organization_id and public.bf9_can(v.work_order_id) then
     raise sqlstate 'PT409' using
      message='An earlier field visit is still open',
      detail=jsonb_build_object('visit_number',v.visit_number,'work_order_id',v.work_order_id,
       'work_order_number',(select work_order_number from public.bf_work_orders where id=v.work_order_id))::text;
    end if;
    raise sqlstate 'PT409' using message='An earlier field visit is still open';
   end if;

   insert into public.bf9_visits(organization_id,work_order_id,technician_id,visit_number)
   values(w.organization_id,w.id,actor,'VIS-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.bf9_visit_seq')::text,6,'0'))
   on conflict (technician_id) where status='open' do nothing
   returning * into v;
   exit when v.id is not null;
  end loop;
  result_id:=v.id;
 elsif p_action in('finish_visit','cancel_visit','labor') then
  select * into v from public.bf9_visits where id=p_id and work_order_id=p_wo for update;
  if not found then raise exception 'Visit not found';end if;
  if v.technician_id<>actor and not public.bf4_staff(w.organization_id,'corrective.manage')
  then raise exception 'Permission denied' using errcode='42501';end if;
  if p_action='labor' then
   if v.status<>'open' then raise exception 'Visit is not open';end if;
   start_time:=(p_data->>'started_at')::timestamptz;
   end_time:=(p_data->>'ended_at')::timestamptz;
   if start_time is null or end_time is null or start_time < v.started_at - interval '1 second'
    or end_time<=start_time or end_time>clock_timestamp()+interval '1 minute'
    or end_time-start_time>interval '24 hours'
   then raise exception 'Invalid labor interval';end if;
         start_time := greatest(start_time, v.started_at);
         if end_time <= start_time then
           raise exception 'Invalid labor interval';
         end if;
   perform pg_advisory_xact_lock(hashtextextended(v.technician_id::text,9));
   if end_time>coalesce(v.finished_at,now()+interval '5 minutes') then raise exception 'Labor exceeds visit end';end if;
   if exists(select 1 from public.bf9_labor l where l.technician_id=v.technician_id
    and l.started_at<end_time and l.ended_at>start_time)
   then raise exception 'Overlapping labor interval';end if;
   insert into public.bf9_labor(organization_id,visit_id,technician_id,started_at,ended_at,activity,created_by)
   values(w.organization_id,v.id,v.technician_id,start_time,end_time,p_data->>'activity',actor)
   returning id into result_id;
  elsif p_action='finish_visit' then
   if v.status<>'open' then raise exception 'Visit is not open';end if;
   if length(btrim(coalesce(p_data->>'work_performed','')))<5
   then raise exception 'Work performed is required';end if;
   update public.bf9_visits set status='finished',finished_at=now(),
    diagnosis=p_data->>'diagnosis',work_performed=p_data->>'work_performed',
    tests_performed=p_data->>'tests_performed',notes=p_data->>'notes'
   where id=v.id;
   result_id:=v.id;
  else
   if v.status<>'open' or length(btrim(coalesce(p_data->>'reason','')))<5
   then raise exception 'Cancellation reason required for an open visit';end if;
   update public.bf9_visits set status='cancelled',finished_at=now(),cancellation_reason=p_data->>'reason' where id=v.id;
   result_id:=v.id;
  end if;
 elsif p_action='register_evidence' then
  if not public.bf9_can(p_wo,true) or w.status not in('accepted','in_progress','on_hold')
  then raise exception 'Assigned technician required';end if;
  select * into v from public.bf9_visits where id=(p_data->>'visit_id')::uuid and work_order_id=p_wo;
  if not found or v.status<>'open' or v.technician_id<>actor
  then raise exception 'Your open visit is required';end if;
  if p_data->>'mime_type' not in('image/jpeg','image/png','image/webp','application/pdf')
   or coalesce((p_data->>'file_size')::bigint,0) not between 1 and 10485760
  then raise exception 'Unsupported evidence file';end if;
  if length(btrim(coalesce(p_data->>'file_name',''))) not between 1 and 255 then raise exception 'File name required';end if;
  result_id:=gen_random_uuid();
  insert into public.bf9_evidence(id,organization_id,work_order_id,visit_id,uploaded_by,file_name,object_path,mime_type,file_size,caption)
  values(result_id,w.organization_id,w.id,v.id,actor,p_data->>'file_name',
   w.organization_id::text||'/'||w.id::text||'/'||result_id::text,
   p_data->>'mime_type',(p_data->>'file_size')::bigint,coalesce(p_data->>'caption',''));
 elsif p_action='confirm_evidence' then
  select * into e from public.bf9_evidence where id=p_id and work_order_id=p_wo for update;
  if not found or e.uploaded_by<>actor or e.status<>'pending'
  then raise exception 'Pending evidence not found';end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='bf9-evidence'
   and o.name=e.object_path and o.owner_id=actor::text
   and (o.metadata->>'size')::bigint=e.file_size
   and o.metadata->>'mimetype'=e.mime_type)
  then raise exception 'Uploaded object not found';end if;
  update public.bf9_evidence set status='ready',verified_at=now() where id=e.id;
  result_id:=e.id;
 else raise exception 'Invalid field action';end if;
 insert into public.bf9_events(organization_id,work_order_id,visit_id,actor_id,action,details)
 values(w.organization_id,w.id,case when p_action in('register_evidence','confirm_evidence') then
  case when p_action='register_evidence' then v.id else e.visit_id end else v.id end,
  actor,p_action,jsonb_build_object('record_id',result_id));
 return result_id;
end $function$;
