begin;
create or replace function public.bf_med_sync_linked_ppm_work_order()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare w public.bf_work_orders; previous_flag text;
begin
 if new.work_order_id is null or new.status not in('assigned','in_progress','completed','approved','closed','cancelled') then return new; end if;
 select * into w from public.bf_work_orders where id=new.work_order_id and organization_id=new.organization_id and client_id=new.client_id and site_id=new.site_id and asset_id=new.asset_id for update;
 if not found then raise exception 'Linked PPM work order scope mismatch'; end if;
 if w.status=new.status and (new.status not in('approved','closed') or w.approval_status='approved') then return new; end if;
 if w.status in('closed','cancelled') and w.status<>new.status then raise exception 'Closed linked work requires controlled reopening'; end if;
 previous_flag:=current_setting('bf4.authorized_write',true);
 perform set_config('bf4.authorized_write','yes',true);
 update public.bf_work_orders set status=new.status,
 approval_status=case when new.status in('approved','closed') then 'approved' when new.status='completed' then 'pending' when new.status in('assigned','in_progress') then 'not_submitted' else approval_status end,
 started_at=coalesce(started_at,(to_jsonb(new)->>'started_at')::timestamptz),
 accepted_at=coalesce(accepted_at,(to_jsonb(new)->>'started_at')::timestamptz),
 completed_at=coalesce((to_jsonb(new)->>'completed_at')::timestamptz,completed_at),
 closed_at=case when new.status='closed' then coalesce((to_jsonb(new)->>'closed_at')::timestamptz,now()) else closed_at end,
 updated_at=now() where id=w.id;
 insert into public.bf_corrective_events(organization_id,client_id,work_order_id,actor_id,action,from_status,to_status,details)
 values(new.organization_id,new.client_id,w.id,auth.uid(),'status_synced_from_ppm',w.status,new.status,jsonb_build_object('ppm_job_id',new.id,'ppm_job_number',new.job_number));
 perform set_config('bf4.authorized_write',coalesce(previous_flag,''),true);
 return new;
end $function$;
revoke all on function public.bf_med_sync_linked_ppm_work_order() from public,anon,authenticated;
do $trigger$ begin
 if not exists(select 1 from pg_trigger where tgname='bf_med_sync_linked_ppm_work_order' and tgrelid='public.bf_ppm_jobs'::regclass) then
 create trigger bf_med_sync_linked_ppm_work_order after update of status,work_order_id on public.bf_ppm_jobs for each row execute function public.bf_med_sync_linked_ppm_work_order();
 end if;
end $trigger$;
commit;
