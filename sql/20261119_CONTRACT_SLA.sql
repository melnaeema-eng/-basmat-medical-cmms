create or replace function private.bf_sla_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(p)<>'object' then return false; end if;
 for k,v in select * from jsonb_each(p) loop
  if k='ppm' then
   if jsonb_typeof(v)<>'boolean' then return false; end if;
  elsif k in ('P1','P2','P3','P4') then
   if jsonb_typeof(v)<>'object' or jsonb_typeof(v->'response') is distinct from 'number'
     or jsonb_typeof(v->'completion') is distinct from 'number' then return false; end if;
   if (v->>'response') !~ '^[0-9]{1,6}$' or (v->>'completion') !~ '^[0-9]{1,6}$'
     or (v->>'response')::int < 1 or (v->>'completion')::int < (v->>'response')::int then return false; end if;
  else return false;
  end if;
 end loop;
 return true;
end
$$;
-- Contract writers already use the existing contract RLS policies.
grant execute on function private.bf_sla_valid(jsonb) to authenticated;
alter table public.bf_contracts add column sla_targets jsonb not null default '{}'
 check (private.bf_sla_valid(sla_targets));
alter table public.bf_work_orders add column sla_deadline_source text
 check (sla_deadline_source in ('contract','schedule','manual'));

create or replace function private.bf_sla_status(
 response_due timestamptz, completion_due timestamptz, responded timestamptz,
 completed timestamptz, at_time timestamptz
) returns text language sql immutable set search_path='' as $$
 select case
  when response_due is null and completion_due is null then 'not_configured'
  when response_due < coalesce(responded,at_time) or completion_due < coalesce(completed,at_time) then 'breached'
  when (response_due is null or responded is not null) and (completion_due is null or completed is not null) then 'met'
  else 'running' end
$$;

create or replace function private.bf_sla_work_order() returns trigger
language plpgsql security definer set search_path='' as $$
declare targets jsonb; due_day date; starts timestamptz;
begin
 if new.status='cancelled' then return new; end if;
 if tg_op='UPDATE' then
  if old.status='closed' then return new; end if;
  if current_setting('basmat.sla_ppm_link',true) is distinct from 'yes'
    and new.sla_deadline_source is not distinct from old.sla_deadline_source
    and row(new.response_due_at,new.completion_due_at) is distinct from row(old.response_due_at,old.completion_due_at) then
   new.sla_deadline_source:='manual';
  end if;
 end if;
 if tg_op='INSERT' and new.response_due_at is null and new.completion_due_at is null
   and new.sla_deadline_source is null and new.completed_at is null and new.status not in ('completed','approved','closed') then
  select c.sla_targets into targets from public.bf_contracts c where c.id=new.contract_id
   and c.organization_id=new.organization_id and c.client_id=new.client_id and c.status='active';
  select min(j.due_date) into due_day from public.bf_ppm_jobs j where j.work_order_id=new.id;
  if due_day is not null then
   if targets->>'ppm'='true' then
    new.completion_due_at:=((due_day+1)::timestamp at time zone 'Asia/Riyadh')-interval '1 microsecond';
    new.sla_deadline_source:='schedule';
   end if;
  elsif targets ? new.priority then
   select r.reported_at into starts from public.bf_service_requests r where r.id=new.request_id
    and r.organization_id=new.organization_id and r.client_id=new.client_id;
   starts:=coalesce(starts,new.created_at,now());
   new.response_due_at:=starts+make_interval(mins=>(targets->new.priority->>'response')::int);
   new.completion_due_at:=starts+make_interval(mins=>(targets->new.priority->>'completion')::int);
   new.sla_deadline_source:='contract';
  end if;
 end if;
 new.sla_status:=private.bf_sla_status(new.response_due_at,new.completion_due_at,
   new.accepted_at,new.completed_at,now());
 return new;
end
$$;
create trigger zz_bf_work_order_sla before insert or update on public.bf_work_orders
 for each row execute function private.bf_sla_work_order();

-- PPM mirror rows are inserted before their job link. Reclassify only deadlines
-- generated earlier in this transaction, or initialize an unset linked order.
create or replace function private.bf_sla_ppm_link() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior text:=current_setting('bf4.authorized_write',true);
 prior_link text:=current_setting('basmat.sla_ppm_link',true);
begin
 if new.work_order_id is null then return new; end if;
 if tg_op='UPDATE' and old.work_order_id is not distinct from new.work_order_id
  and old.due_date is not distinct from new.due_date then return new; end if;
 perform set_config('bf4.authorized_write','yes',true);
 perform set_config('basmat.sla_ppm_link','yes',true);
 update public.bf_work_orders w set
   response_due_at=null,
   completion_due_at=case when c.status='active' and c.sla_targets->>'ppm'='true'
     then ((new.due_date+1)::timestamp at time zone 'Asia/Riyadh')-interval '1 microsecond' end,
   sla_deadline_source='schedule'
 from public.bf_contracts c where c.id=w.contract_id and c.organization_id=w.organization_id and c.client_id=w.client_id
   and w.id=new.work_order_id and new.organization_id=w.organization_id and new.client_id=w.client_id
   and new.site_id=w.site_id and new.asset_id=w.asset_id and w.status not in ('cancelled','completed','approved','closed')
   and (w.sla_deadline_source='contract' or
     (w.sla_deadline_source is null and w.response_due_at is null and w.completion_due_at is null)
     or (w.sla_deadline_source='schedule' and tg_op='UPDATE' and old.due_date is distinct from new.due_date));
 perform set_config('basmat.sla_ppm_link',coalesce(prior_link,''),true);
 perform set_config('bf4.authorized_write',coalesce(prior,''),true);
 return new;
end
$$;
create trigger bf_sla_ppm_link after insert or update of work_order_id,due_date on public.bf_ppm_jobs
 for each row execute function private.bf_sla_ppm_link();

-- Keep certified rows and caller permissions intact. The scheduler can only
-- make the running-to-breached status change on a still-open order.
do $$
declare d text:=pg_get_functiondef('public.bf44_order_guard()'::regprocedure);
declare marker text:='begin';
declare guard text:=$guard$
 if session_user='postgres' and auth.uid() is null
    and current_setting('basmat.sla_tick',true)='yes'
    and old.sla_status in ('running','paused') and new.sla_status='breached'
    and old.status not in ('cancelled','completed','approved','closed')
    and (to_jsonb(old)-'sla_status') = (to_jsonb(new)-'sla_status') then
  return new;
 end if;
$guard$;
begin
 if strpos(d,marker)=0 then raise exception 'Integrated work-order guard not found'; end if;
 execute overlay(d placing marker||guard from strpos(d,marker) for length(marker));
end
$$;
create or replace function private.bf_sla_tick() returns void
language plpgsql set search_path='' as $$
declare prior text:=current_setting('bf4.authorized_write',true);
begin
 perform set_config('bf4.authorized_write','yes',true);
 perform set_config('basmat.sla_tick','yes',true);
 update public.bf_work_orders w set sla_status='breached'
 where w.sla_status in ('running','paused') and w.status not in ('cancelled','completed','approved','closed')
   and ((w.response_due_at<coalesce(w.accepted_at,now()))
     or (w.completed_at is null and w.completion_due_at<now()))
   and private.bf_sla_status(w.response_due_at,w.completion_due_at,w.accepted_at,w.completed_at,now())='breached';
 perform set_config('basmat.sla_tick','',true);
 perform set_config('bf4.authorized_write',coalesce(prior,''),true);
end
$$;
revoke all on function private.bf_sla_work_order(),private.bf_sla_ppm_link(),private.bf_sla_tick() from public,anon,authenticated;
create index bf_sla_open_deadlines on public.bf_work_orders (id)
 where sla_status in ('running','paused') and status not in ('cancelled','completed','approved','closed');
select cron.schedule('bf-contract-sla','* * * * *','select private.bf_sla_tick()');
