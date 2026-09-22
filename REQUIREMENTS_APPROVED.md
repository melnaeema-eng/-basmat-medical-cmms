# Basmat Facilities CMMS — Approved product scope

The product is a cloud multi-company facilities maintenance platform serving
maintenance companies, owners, consultants, supervisors, technicians and stores.
Arabic/English with full RTL/LTR is mandatory. Deliver each sprint as one ZIP
with SQL, installation instructions, tests and a GitHub acceptance gate.

## Approved operational modules

### Corrective Maintenance
Incident or Service Request -> triage -> priority/contract SLA -> Work Order ->
assignment -> GPS/QR arrival -> diagnosis -> safety permit/material/approval
holds -> repair -> testing -> QA -> owner/consultant approval when required ->
closure -> immutable technical report and asset history.
Support multiple technicians, visits, reassignment, rejection/rework, temporary
repairs with follow-up, escalation, downtime, root cause, and audit events.
SLA pauses are contract-controlled and retain actual/excluded durations.

### Preventive Maintenance
A separate versioned procedure for each asset category, manufacturer/model,
maintenance frequency and individual asset override.
Weekly, monthly, quarterly, semiannual, annual, meter-based and condition-based
plans. An approved 12-month master schedule with per-asset tasks and exact dates.
Each procedure contains ordered instructions, safety requirements, tools,
measurements and limits, required photographs, condition/failure results,
replacement parts, testing, supervision and report requirements.
Automatic idempotent Work Order generation, due/overdue notifications,
material forecasting, checklist snapshots, corrective follow-ups and PPM KPI.
Technical instructions must be reviewed against manufacturer manuals and
applicable codes; illustrative schedules are not maintenance instructions.

### Stores and Spare Parts
Part master, OEM/alternative compatibility, multiple warehouses and bin
locations, owner/company stock ownership, serialized/batch/expiry tracking,
reservations, receipts, issues, returns, transfers, approved adjustments,
stock ledger, reorder rules, procurement, cycle counts and valuation.
No negative available stock or double issue under concurrent transactions.
Actual consumption links to Work Orders, assets, contracts and internal cost.

### Contract commercial rules
Labour-only, comprehensive, limited/mixed and reimbursable parts coverage.
Included/excluded parts, limits, approval thresholds, emergency purchase rules,
warranty, owner-supplied inventory and reimbursement margins.
Labour, parts, equipment/plant, subcontractors and other costs support T&M,
fixed price, SOR, cost-plus, included and mixed pricing.
Separate internal cost from billable value; technician records quantities/hours
but does not approve sale prices.

### Fleet, equipment and plant
Vehicles, lifting plant, tools, measuring instruments and temporary equipment.
Availability, booking, operator qualifications, certification/calibration,
check-out/return, operating hours, fuel, maintenance and contract charge rates.

### Mobile users
Technician, management, owner and consultant role-based interfaces with
a shared backend. PWA first, native app when device capabilities require it.
GPS geofence attendance with accuracy/time evidence, optional QR fallback,
documented supervisor override, and no continuous off-duty tracking.
Offline queues and conflict handling require a dedicated implementation and test.

### Reports
Technical reports default to English. Owner monthly, semiannual and annual
reports default to Arabic, with reviewed bilingual export as required.
Include corrective and PPM performance, SLA, asset condition, downtime,
materials, labour, plant, HSE, costs, open risks and forward planning.
Draft -> internal review -> consultant review where required -> owner submission
-> approval -> immutable versioned PDF/Excel report. Signed report versions must
retain their underlying dataset/snapshot and approval history.

## Delivery sequence
S3: Asset and location foundation plus security hardening.
S4: Corrective Work Order and workflow engine.
S5: SLA, escalation, attendance and mobile execution.
S6: PPM procedure library and annual scheduling engine.
S7: Step-by-step PPM execution and reports.
S8: Inventory, spare parts and procurement.
S9: Contracts, rate cards, reimbursement and commercial approvals.
S10: Fleet/plant, HSE and subcontractors.
S11: Owner and consultant portals with approvals.
S12: Periodic reports, analytics and executive dashboards.
S13: Offline mobile, notifications and production hardening.
Actual sprint scope and acceptance may be split further when required for safety.
