-- Basmat Facilities CMMS — Sprint 1 Foundation
-- Safe namespace: bf_

create extension if not exists pgcrypto;

create table if not exists public.bf_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bf_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bf_organizations(id) on delete restrict,
  name text not null,
  code text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.bf_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bf_organizations(id) on delete restrict,
  client_id uuid not null references public.bf_clients(id) on delete restrict,
  contract_number text not null,
  contract_type text,
  start_date date,
  end_date date,
  contract_value numeric(18,2),
  status text not null default 'draft' check (status in ('draft','active','suspended','expired','closed','archived')),
  created_at timestamptz not null default now(),
  unique (organization_id, contract_number)
);

create table if not exists public.bf_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bf_organizations(id) on delete restrict,
  client_id uuid references public.bf_clients(id) on delete restrict,
  contract_id uuid references public.bf_contracts(id) on delete set null,
  name text not null,
  code text,
  city text,
  address text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.bf_buildings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.bf_sites(id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now()
);

create table if not exists public.bf_floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.bf_buildings(id) on delete cascade,
  name text not null,
  level_no integer,
  created_at timestamptz not null default now()
);

create table if not exists public.bf_zones (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.bf_floors(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bf_rooms (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.bf_zones(id) on delete cascade,
  name text not null,
  room_number text,
  created_at timestamptz not null default now()
);

create table if not exists public.bf_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.bf_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.bf_organizations(id) on delete cascade,
  name text not null,
  code text not null,
  is_system boolean not null default false,
  unique (organization_id, code)
);

create table if not exists public.bf_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text
);

create table if not exists public.bf_role_permissions (
  role_id uuid not null references public.bf_roles(id) on delete cascade,
  permission_id uuid not null references public.bf_permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.bf_user_roles (
  user_id uuid not null references public.bf_profiles(id) on delete cascade,
  organization_id uuid not null references public.bf_organizations(id) on delete cascade,
  role_id uuid not null references public.bf_roles(id) on delete restrict,
  primary key (user_id, organization_id, role_id)
);

create table if not exists public.bf_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.bf_organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bf_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.bf_organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed permissions
insert into public.bf_permissions(code, description) values
('organizations.view','View organizations'),
('organizations.manage','Manage organizations'),
('clients.view','View clients'),
('clients.manage','Manage clients'),
('contracts.view','View contracts'),
('contracts.manage','Manage contracts'),
('sites.view','View sites'),
('sites.manage','Manage sites'),
('users.view','View users'),
('users.manage','Manage users and roles')
on conflict (code) do nothing;

-- Enable RLS. Detailed tenant policies will be added after first admin bootstrap.
alter table public.bf_organizations enable row level security;
alter table public.bf_clients enable row level security;
alter table public.bf_contracts enable row level security;
alter table public.bf_sites enable row level security;
alter table public.bf_buildings enable row level security;
alter table public.bf_floors enable row level security;
alter table public.bf_zones enable row level security;
alter table public.bf_rooms enable row level security;
alter table public.bf_profiles enable row level security;
alter table public.bf_roles enable row level security;
alter table public.bf_permissions enable row level security;
alter table public.bf_role_permissions enable row level security;
alter table public.bf_user_roles enable row level security;
alter table public.bf_audit_logs enable row level security;
alter table public.bf_notifications enable row level security;

-- Sprint 1 intentionally does not add broad anonymous access policies.
-- We will add exact tenant-safe RLS policies after the first authenticated admin user is created.
