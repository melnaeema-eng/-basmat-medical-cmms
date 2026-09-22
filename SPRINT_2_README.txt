Basmat Facilities CMMS — Sprint 2

Scope delivered:
- Supabase email/password authentication
- Protected application routes
- First Super Admin bootstrap
- Multi-tenant RLS helper functions
- RLS policies for Organizations, Clients, Contracts, Sites, Profiles, Roles and Memberships
- Organizations CRUD
- Clients CRUD
- Contracts CRUD
- Sites CRUD
- Users & Roles assignment foundation
- Dashboard live counts
- Archive lifecycle instead of hard delete
- Arabic + English
- RTL + LTR
- Responsive web UI
- Logout
- SQL script designed to be rerunnable for Sprint 2 policies

Security note:
The publishable/anon key remains safe for frontend use because access is controlled by Supabase Auth + RLS.
Never expose service_role in the frontend.

Sprint 3 planned:
Asset & Location Management.
