Basmat Facilities CMMS — Sprint 1 Foundation

Included:
- React routing foundation
- CMMS application shell
- Dashboard
- Organizations / Clients / Contracts / Sites / Users navigation
- Supabase client
- Multi-tenant bf_ database foundation
- Roles and permissions foundation
- Audit log + notifications foundation
- RLS enabled by default
- Installation/testing instructions

Not included intentionally:
- Full CRUD forms
- First admin bootstrap
- Final tenant RLS policies
- Assets / Work Orders / PPM

Reason:
Authentication and tenant context must be established before exposing database CRUD safely.
