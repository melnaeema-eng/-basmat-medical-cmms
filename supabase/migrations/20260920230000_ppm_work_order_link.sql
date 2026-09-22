-- Basmat Facilities CMMS
-- Fix 043: Link PPM assignment to unified Work Orders.
-- Safe to run more than once.

begin;

-- 1) Keep a permanent link from each PPM job to its unified work order.
alter table public.bf_ppm_jobs
  add column if not exists work_order_id uuid;

create unique index if not exists bf5_ppm_job_work_order_uq
  on public.bf_ppm_jobs(work_order_id)
  where work_order_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bf_ppm_jobs_work_order_id_fkey'
      and conrelid = 'public.bf_ppm_jobs'::regclass
  ) then
    alter table public.bf_ppm_jobs
      add constraint bf_ppm_jobs_work_order_id_fkey
      foreign key (work_order_id) references public.bf_work_orders(id);
  end if;
end $$;

-- 2) Some deployed databases have tenant_id as a required column on work orders.
--    Fill it from organization_id before NOT NULL checks without changing older schemas.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='bf_work_orders' and column_name='tenant_id'
  ) then
    execute $fn$
      create or replace function public.bf43_fill_work_order_tenant()
      returns trigger
      language plpgsql
      security definer
      set search_path=''
      as $body$
      declare resolved_tenant uuid;
      begin
        if new.tenant_id is null then
          select nullif(to_jsonb(o)->>'tenant_id','')::uuid
            into resolved_tenant
          from public.bf_organizations o
          where o.id=new.organization_id;
          new.tenant_id := coalesce(resolved_tenant,new.organization_id);
        end if;
        return new;
      end
      $body$
    $fn$;

    execute 'drop trigger if exists bf43_fill_work_order_tenant on public.bf_work_orders';
    execute 'create trigger bf43_fill_work_order_tenant before insert on public.bf_work_orders for each row execute function public.bf43_fill_work_order_tenant()';
  end if;
end $$;

-- 3) Atomic PPM assignment + unified work order creation/reassignment.
create or replace function public.bf5_assign_job_work_order(p_job uuid,p_user uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  j public.bf_ppm_jobs;
  pl public.bf_ppm_plans;
  wo uuid;
begin
  if auth.uid() is null
     or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select * into j
  from public.bf_ppm_jobs
  where id=p_job
  for update;

  if not found then raise exception 'Job not found'; end if;

  if j.status not in ('scheduled','assigned') then
    raise exception 'Invalid job transition';
  end if;

  if not public.bf5_can(j.organization_id,'ppm.manage') then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  if not public.bf4_user_can(p_user,j.organization_id,'ppm.execute') then
    raise exception 'Assignee lacks execution permission';
  end if;

  select * into pl from public.bf_ppm_plans where id=j.plan_id;

  wo := j.work_order_id;

  if wo is null then
    wo := public.bf4_action(
      'work_order',
      null,
      'create',
      jsonb_build_object(
        'organization_id',j.organization_id,
        'client_id',j.client_id,
        'site_id',j.site_id,
        'contract_id',pl.contract_id,
        'asset_id',j.asset_id,
        'title','Preventive Maintenance - '||j.job_number,
        'description','Generated automatically from PPM job '||j.job_number,
        'priority','P3'
      )
    );
  end if;

  -- The PPM workflow owns execution. The unified WO mirrors assignment for dashboards/reporting.
  delete from public.bf_work_order_assignments where work_order_id=wo;
  insert into public.bf_work_order_assignments(work_order_id,user_id,assigned_by)
  values(wo,p_user,auth.uid())
  on conflict(work_order_id,user_id) do update
    set assigned_by=excluded.assigned_by,assigned_at=now();

  update public.bf_work_orders
  set status='assigned',
      assigned_at=coalesce(assigned_at,now()),
      updated_at=now()
  where id=wo;

  update public.bf_ppm_jobs
  set assigned_to=p_user,
      status='assigned',
      work_order_id=wo
  where id=j.id;

  insert into public.bf_ppm_events(organization_id,job_id,entity_type,entity_id,actor_id,action,details)
  values(j.organization_id,j.id,'job',j.id,auth.uid(),'assign',jsonb_build_object('user_id',p_user,'work_order_id',wo));

  insert into public.bf_corrective_events(organization_id,client_id,work_order_id,actor_id,action,from_status,to_status,details)
  values(j.organization_id,j.client_id,wo,auth.uid(),'assigned_from_ppm','draft','assigned',jsonb_build_object('ppm_job_id',j.id,'ppm_job_number',j.job_number,'user_id',p_user));

  return j.id;
end $$;

revoke all on function public.bf5_assign_job_work_order(uuid,uuid) from public,anon;
grant execute on function public.bf5_assign_job_work_order(uuid,uuid) to authenticated;

commit;

