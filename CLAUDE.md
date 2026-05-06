# Sentinel HR — Staff Onboarding Module

Standalone onboarding module for **Sentinel HR**, an HRMS for Australian NDIS and community support providers. Owns the full lifecycle of bringing a new support worker into a provider, from invite through to a verified, compliance-checked employee record. On completion, hands off the verified record to the main Sentinel HR system.

Marketing site: https://www.sentinelhr.com.au

## Brand & tone

- Positioning: **"built by NDIS providers, for NDIS providers."** Industry-insider, compliance-first.
- UI should feel professional, trustworthy, competent. Not playful, not generic startup SaaS.
- Brand colours (configured as Tailwind theme extensions):
  - `navy` — `#0A2342` (primary)
  - `teal` — `#0D9488` (accent)
- Use `bg-navy`, `text-teal`, etc. Don't introduce new brand-level colours without checking.

## Tech stack

- Next.js 16 (App Router) + TypeScript, Turbopack for dev
- Tailwind CSS v3
- shadcn/ui for accessible primitives (button, input, label, card, table to start)
- Supabase — Postgres, Auth, Storage (for document uploads); `@supabase/supabase-js` + `@supabase/ssr`
- npm as package manager; ESLint + Prettier (Prettier integrated via `eslint-config-prettier`)

> Note: original spec said Next.js 15. Updated to 16 (current stable as of scaffold) on Mthompson's call. Next.js 16 has breaking changes from prior major versions — per the scaffold's own AGENTS.md note (since removed), refer to `node_modules/next/dist/docs/` for current conventions before relying on training-data knowledge.

## Domain context

- **NDIS** = National Disability Insurance Scheme (Australia). Providers operate under strict regulation by the NDIS Commission.
- Two user types:
  - **HR admin** — manages the onboarding pipeline across many candidates.
  - **New hire (support worker)** — completes their own onboarding (uploads docs, signs forms, completes orientation).
- **SCHADS Award** classifications matter for pay setup (Social, Community, Home Care and Disability Services Industry Award).

## Compliance checks the module must handle

Each needs upload + verification + (where relevant) expiry tracking:

- NDIS Worker Screening Check
- Working with Children Check — issuing state varies (NSW, VIC, QLD, etc.); schema must capture state
- National Police Check
- First Aid / CPR certificates — track expiry
- NDIS Worker Orientation Module completion
- Driver's licence + vehicle insurance — required for community access / transport roles
- Qualifications — Cert III / IV in Individual Support, Disability, Ageing Support, etc.

## Audit trail (regulatory requirement, not optional)

Every meaningful action must be logged with actor, timestamp, target, and (where relevant) before/after values:

- Document uploads — who uploaded what
- Verifications — who verified, when
- Status changes
- Admin overrides

Build this into the schema from day one. Baseline: an `audit_log` table referenced from every domain table. **Do not retrofit.**

## Integration boundary with main Sentinel HR

This module owns the full onboarding lifecycle. On completion it hands off a clean, verified employee record to the main HRMS.

The mechanism (REST API vs shared Supabase project vs event/webhook) is **not yet decided** with the developer. Design so it can be swapped later without major refactoring:

- Hide the "publish completed employee" step behind a single port/interface.
- Don't leak main-HRMS-specific assumptions into onboarding domain code.
- Treat the handoff payload as an explicit, versioned contract.

## Database schema

Multi-tenant onboarding schema lives in Supabase. Migration files in `supabase/migrations/`. Eight tables plus two views.

**Tables**

- `organisations` — tenant root (one per NDIS provider)
- `organisation_members` — HR staff membership; links to `auth.users`
- `leads` — public enquiry submissions; no auth user
- `candidates` — per-org onboarding subject; the workhorse table
- `invitations` — single-use tokens converting a lead into a candidate signup
- `document_types` — system-global rows + per-org custom; data-driven catalogue
- `documents` — versioned, immutable upload records; supersession via `replaces_document_id`
- `audit_log` — append-only event stream

**Views**

- `candidate_self_updatable` — column-allowlist view for candidate self-edits; INSTEAD OF UPDATE trigger writes only allowlisted columns to the base table
- `candidate_timeline` — convenience join surfacing lifecycle timestamps from `leads` + `invitations`

**Key design choices**

- Per-org `candidates` rows; `person_id` is a forward-looking placeholder column for a future shared `people` layer (cross-provider portability).
- Documents are immutable rows; corrections are new rows linked via `replaces_document_id`. Unique partial index `(candidate_id, document_type_id) WHERE status <> 'superseded' AND deleted_at IS NULL`.
- `% complete` is derived at query time from the verified-vs-required document set, not stored.
- `document_types` is data, with `(organisation_id IS NULL)` = system-global and `(organisation_id NOT NULL)` = provider-custom.
- Soft delete (`deleted_at timestamptz`) on every tenant-scoped table except `audit_log` (which is append-only).
- `audit_log` is append-only via UPDATE/DELETE-blocking triggers. Belt-and-braces audit triggers on every tenant-scoped table capture INSERT/UPDATE/DELETE with `before_state`/`after_state` JSONB.
- Multi-tenancy enforced via Supabase RLS keyed on `organisation_id`. Helpers: `is_org_member(org_id)`, `is_org_admin(org_id)`, `is_candidate_self(user_id)`.
- Integration handoff to main HRMS lives behind `candidates.handoff_payload jsonb` — single port, swappable mechanism.
- `documents` uses `uploaded_at` instead of `created_at` — semantically clearer for an upload event. There's no `updated_at` on `documents`; verification timestamps (`verified_at`) and the `audit_log` cover row-history needs.

**Access patterns worth knowing**

- **Absence of a policy = denial.** RLS is enabled on every tenant-scoped table; only actions explicitly granted via `CREATE POLICY` are permitted. Tables like `organisations` deliberately have no INSERT policy for `authenticated` — that's the enforcement, not an oversight. Service-role connections bypass RLS for these privileged operations.
- **Public lead intake** does NOT use anonymous RLS. The public enquiry form posts to a server-side route that uses the Supabase service role to insert. Lock down the API route, not the DB.
- **Candidate self-edits** go through the `candidate_self_updatable` view. The base `candidates` table's UPDATE policy is HR-only.
- **`date_of_birth` is editable while null, then locked.** Once set, only HR can change it (via the base table). The INSTEAD OF trigger raises if a candidate tries to change a non-null DOB.
- **RTW fields (`rtw_status`, `visa_subclass`, `visa_expiry`) are editable while `status IN ('invited', 'profile_in_progress')`, then locked.** Compliance gate: once the profile moves past editing, RTW is set in stone for the candidate. HR can still change via the base table. (Alternative gate of "any RTW-supporting document verified" was considered; status-based gate chosen for v1 simplicity.)
- **Consent fields (`privacy_consent_at`, `terms_accepted_at`) are System-only.** Set once via a server-side consent endpoint; never updated. Withdrawal of consent (if needed) will be modelled separately.
- **`candidates.email` syncs from `auth.users.email`** via an `AFTER UPDATE OF email ON auth.users` trigger. Email changes go through the Supabase Auth flow only; the trigger keeps `candidates.email` aligned, and the audit_trigger captures the change.
- **Migration caveat for the email-sync trigger.** The trigger attaches to `auth.users`, which lives in Supabase's managed `auth` schema. Creating it requires `postgres`-role privileges. The Supabase CLI (`supabase db push` / `supabase migration up`) and the dashboard SQL editor both run as `postgres` and apply the trigger cleanly. If a hosted-plan restriction blocks writes to the `auth` schema, fall back to performing the email sync in app code: when Supabase Auth completes an email change, the server route updates `candidates.email` for matching `user_id`. Drop the trigger if going that route.

**Audit / PII handling**

- `audit_log` contains **unredacted PII snapshots** (DOB, address, visa subclass, etc.) inside `before_state` / `after_state` JSONB.
- RLS on `audit_log` is **admin-only** for SELECT. This is doubly important because of the PII content.
- **Right-to-be-forgotten** requests will require a separate audit redaction process — not a v1 build; flag when production pressure arrives.
- **Audit log backups** must be treated as sensitive data when production-bound.

**Deferred to v2**

- `tax_file_number_provided`, `super_fund_provided`, `bank_details_provided`, `profile_photo_url` — likely a separate `candidate_payroll_setup` table; not in v1.
- Notifications/reminders (e.g. "First Aid expiring in 30 days") — query-driven for now via the `documents_expiry_idx` partial index.
- Two-eyes verification — single-step `verified_by` for v1; promotable to a verifications table later.

## Migration workflow

- Migrations live in `supabase/migrations/` with timestamp-prefixed filenames (`YYYYMMDDhhmmss_name.sql`).
- We run migrations **directly against the dev Supabase project as we write them**, via the dashboard SQL Editor. Developer review happens at handover / PR review, not per-migration.
- The Supabase project at `bdmcxciktsjqonyxnnen` is **dev-only**; production will be a separate project.
- Migration files must remain correct against a fresh database. If the dev project drifts (e.g. a column already exists from an earlier ad-hoc edit), reconcile dev to match the file — don't patch the file to match drift.

## Current focus

_Update this as we go._

- Schema is live in the dev Supabase project. Three migrations applied: initial schema (`20260505000001`), RLS policies (`20260505000002`), enquiry-form additions (`20260506000001`).
- Project scaffold landed: Next.js 16 + Tailwind v3 + shadcn primitives + Supabase server/client helpers.
- Social Plus pilot organisation seeded (slug `social-plus`, id `c1d9cf17-3f1c-4a13-aca6-d95fafed3397`).
- Next: public enquiry form at `/enquire` + server-side `/api/enquiries` route inserting into `leads` via service role.
