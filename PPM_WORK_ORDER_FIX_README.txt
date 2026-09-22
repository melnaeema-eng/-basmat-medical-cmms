BASMAT FACILITIES CMMS - PPM / WORK ORDER FIX
==============================================

Problem fixed:
- Assigning a preventive-maintenance (PPM) job changed the PPM status but did not create a unified Work Order.
- Dashboard therefore continued to show Work Orders = 0.

What this package changes:
1. Adds bf_ppm_jobs.work_order_id.
2. Adds an atomic Supabase RPC: bf5_assign_job_work_order.
3. PPM Assign now creates a WO number, links it to the PPM job, and assigns the same technician.
4. Existing assigned/in-progress/completed PPM jobs without a WO are backfilled during migration.
5. The PPM job details page displays a clickable Unified Work Order number.
6. Handles deployed databases where bf_work_orders.tenant_id is mandatory.

INSTALL (one command from PowerShell in the project folder):
  powershell -ExecutionPolicy Bypass -File .\RUN_PPM_WORK_ORDER_FIX.ps1

Then run:
  npm run dev

Test:
- Open PPM > Work Order.
- Assign a scheduled PPM job to a technician.
- The PPM job should show a Unified Work Order link.
- Dashboard Work Orders should increase.
- Corrective > Work Orders should show WO-YYYY-xxxxxx.

Backup:
- Keep your original ZIP until this test passes.
