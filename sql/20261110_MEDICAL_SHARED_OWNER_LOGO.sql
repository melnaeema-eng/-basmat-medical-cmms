-- MEDICAL only. Shared owner identity; existing client RLS and grants remain unchanged.
begin;
alter table public.bf_clients add column if not exists logo_url text;
comment on column public.bf_clients.logo_url is 'Owner logo: HTTPS URL or validated raster data URI, shared across medical outputs.';
-- Reuse a saved report logo only when exactly one distinct logo identifies this owner in this organization.
with sources as (
 select c.organization_id,c.client_id,min(b.owner_logo_data) as logo
 from public.bf_owner_report_branding b
 join public.bf_contracts c on c.id=b.contract_id and c.organization_id=b.organization_id
 where nullif(trim(b.owner_logo_data),'') is not null
 group by c.organization_id,c.client_id having count(distinct b.owner_logo_data)=1
)
update public.bf_clients o set logo_url=s.logo from sources s
where o.id=s.client_id and o.organization_id=s.organization_id and nullif(trim(o.logo_url),'') is null;
notify pgrst,'reload schema';
commit;
