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
- **Auth user deletions cascade `SET NULL` on `candidates.user_id`** (verified via `pg_constraint`: `confdeltype = 'n'` on `candidates_user_id_fkey`). However, an orphaned `user_id` — a UUID that no longer exists in `auth.users` but didn't become orphaned through a real `DELETE` (e.g. dashboard mishap, manual SQL, or seeding against an auth user that was never persisted) — won't be nullified, and there's no query-time integrity check. If a candidate's `user_id` is stale, fix it with `UPDATE candidates SET user_id = '<correct-uuid>' WHERE id = '<candidate-id>'`.

**Audit / PII handling**

- `audit_log` contains **unredacted PII snapshots** (DOB, address, visa subclass, etc.) inside `before_state` / `after_state` JSONB.
- RLS on `audit_log` is **admin-only** for SELECT. This is doubly important because of the PII content.
- **Right-to-be-forgotten** requests will require a separate audit redaction process — not a v1 build; flag when production pressure arrives.
- **Audit log backups** must be treated as sensitive data when production-bound.

**`audit_log` column names** (avoid the common wrong guesses):

- `entity_type` text — *not* `table_name` / `target_table`
- `entity_id` uuid — *not* `target_id`
- `actor_id` uuid → `auth.users(id)` — *not* `actor_user_id`
- `actor_type` (enum) — populated by trigger; expect `'system'` for SQL Editor inserts where `auth.uid()` is null
- `occurred_at` timestamptz — *not* `created_at`
- `before_state` / `after_state` / `metadata` jsonb
- Indexed on `(entity_type, entity_id, occurred_at DESC)` and `(actor_id, occurred_at DESC)` — filter on those for fast lookups.

**Deferred to v2**

- `tax_file_number_provided`, `super_fund_provided`, `bank_details_provided`, `profile_photo_url` — likely a separate `candidate_payroll_setup` table; not in v1.
- **Availability scheduling.** `candidates.availability` (jsonb) is not editable in the v1 candidate portal. Read mode shows "Not yet set up"; edit mode shows a placeholder. The weekly-schedule UX is a dedicated design problem; availability is soft data and not blocking onboarding compliance, so it's deliberately deferred until that design lands. HR will collect availability out-of-band in the meantime.
- **`preferred_roles` ships as a single value (`support_worker`) for v1.** `support_worker` is the dominant role for our pilot. The schema stays `text[]` so future expansion is non-breaking — appending values to `PROFILE_PREFERRED_ROLES` in `src/lib/validation/profile.ts` lights up new checkboxes without a migration. UI implication: a single checkbox labelled "Support worker" looks slightly odd; revisit once a second role is added.
- Notifications/reminders (e.g. "First Aid expiring in 30 days") — query-driven for now via the `documents_expiry_idx` partial index.
- Two-eyes verification — single-step `verified_by` for v1; promotable to a verifications table later.

## Storage

Candidate document uploads land in Supabase Storage. One private bucket, RLS-policed.

- **Bucket: `candidate-documents`** — private, PDF only, 5 MB ceiling. Configured via `INSERT … ON CONFLICT (id) DO UPDATE` so the migration (`20260507000001_documents_storage.sql`) is the source of truth for `public`, `file_size_limit`, and `allowed_mime_types`; dashboard drift is corrected on next apply.
- **Path layout:** `<org_id>/<candidate_id>/<doc_type_code>/<doc_id>.pdf`. Tokens [1] and [2] are RLS-checked against the candidate's row; [3] (doc_type_code) and [4] (filename) are application-enforced — RLS treats them as opaque. The upload Server Action is the only place that decides what goes into [3]/[4].
- **Storage RLS** (`storage.objects` policies) mirrors the `documents`-table access model: candidate reads/writes their own `<org_id>/<candidate_id>/...` prefix; HR (`is_org_member`) reads/writes anywhere in their org's prefix. Two separate INSERT policies (candidate + HR) for clearer audit. HR predicates regex-guard the uuid cast to avoid `invalid_text_representation` errors on malformed paths. No UPDATE / DELETE policies for `authenticated` — immutable design (matches `documents` table; corrections via supersession, retention via service role).
- **Bucket-name lockstep.** The literal `'candidate-documents'` is hard-coded in every storage policy in `supabase/migrations/20260507000001_documents_storage.sql`. If the bucket is ever renamed, the policies must be updated in lockstep.

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
- Public enquiry form at `/enquire` shipped and verified end-to-end. Submits via `/api/enquiries` (service-role insert, honeypot, slug-pinned org lookup); audit trigger captures every submission as `actor_type='system'`. Validation schema in `src/lib/validation/enquiry.ts` is shared between client and server.
- Candidate portal **Phase 1** landed and verified end-to-end: Supabase Auth email/password login & logout via Server Actions; a cookie-bridging middleware (`src/lib/supabase/middleware.ts` + root `middleware.ts`) refreshes tokens and protects `/portal/*` with a redirect to `/login` when no auth user is present; `/portal` index greets the candidate by `first_name` via an RLS-respecting query against `candidates`. Login form imports its server action directly into the client component (not via prop) — required pattern under Next 16's RSC→Client boundary.
- Codespaces dev requires `experimental.serverActions.allowedOrigins` to include both the Codespace URL and `localhost:3000` (proxy presents different `origin` and `x-forwarded-host`). Gated on `CODESPACE_NAME` env in `next.config.ts`; production same-origin enforcement unaffected.
- Candidate portal **Phase 2** landed: `/portal/profile` (read mode) and `/portal/profile/edit` (edit mode) as separate RSC routes. Edit posts via a Server Action that writes through the `candidate_self_updatable` view; lock state for DOB and RTW fields is enforced both server-side (action gates the payload) and at the DB layer (INSTEAD OF UPDATE trigger). Tri-state booleans for licence / vehicle, comma-split text input for languages, single-checkbox `support_worker` for `preferred_roles`. Availability deferred (see Deferred to v2).
- Candidate portal **Phase 3** in progress — `/portal/documents` (list + upload).
  - **M1 landed:** candidate-documents storage bucket (private, PDF only, 5 MB) and `storage.objects` RLS policies, via migration `20260507000001_documents_storage.sql`. Verified end-to-end against dev (bucket config + 4 policies). See the **Storage** section above for the full path-layout / RLS model.
  - **M2 landed:** documents list page (`/portal/documents`), read-only, all 12 system-global doc types grouped into 4 visual categories (clearances, health & safety, transport, qualifications) via `src/lib/documents.ts`. Status pills (Not uploaded / Pending review / Verified / Rejected) + "Required" badges + verified-required-of-total stat. Per-row Upload button opens a shadcn **Dialog** (`src/app/portal/documents/upload-dialog.tsx`) — chosen over a separate route so the candidate stays in context and the list refreshes in place after upload (M3+). Dialog body is a stub for M2; the form lands in M4 once the validation/helpers from M3 exist. Portal index (`/portal`) gains nav cards to Profile and Documents.
  - **M3 landed:** upload-validation schema and storage helpers, all pure code. `documentUploadSchema(flags)` factory in `src/lib/validation/document.ts` — pass the relevant `document_types` row's flags (`capturesReferenceNumber`, `capturesState`, `hasExpiry`); both M4 form and M5 action build the same schema from the same row, so there's no drift between "show this field" and "validate this field". File validation (PDF MIME, ≤5 MB, non-empty) lives in the schema; file/storage constants and `buildDocumentStoragePath()` live in `src/lib/documents.ts` so the schema and the Storage upload call share one source of truth. `expiryLabelFor()` encodes the Police Check "Renewal due" vs "Expires" copy distinction from the schema column comment.
  - **M4 landed:** upload form UI inside the dialog body. `src/app/portal/documents/upload-dialog.tsx` now renders a `useActionState`-driven form with conditional fields keyed off the `document_types` flags passed from the RSC list page (file always; reference number / issuing state / expiry rendered when their flag is true; issue date always optional). Conditional fields are conditionally **rendered**, not CSS-hidden, so `required` attributes don't block submit on inapplicable fields. Submit button uses `useFormStatus` for the pending state; client-side file-size pre-check disables submit before the wire if a >5 MB file is picked. `src/app/portal/documents/actions.ts` ships the M5-ready action signature stubbed to return `{ error }` so M4 verifies form rendering + state plumbing without touching Storage. Description text shows under the dialog title to confirm the candidate is on the right doc type. Form input `name` attributes match the M3 Zod object keys verbatim (`file`, `reference_number`, `issuing_state`, `issue_date`, `expiry_date`) so M5's `documentUploadSchema(flags).safeParse` lands cleanly.
  - **M5 landed and verified end-to-end against dev** with a real 67 KB PDF upload by the seeded candidate: `documents` row created with full `<org>/<candidate>/<code>/<doc_id>.pdf` storage_path, status defaulted to `pending_review`, all NOT NULL columns populated; matching `audit_log` row with `action='documents.insert'`, `actor_type='candidate'`, and `entity_id` aligned with both `documents.id` and the storage filename (three sources of truth in lockstep). The full pipeline lives in `src/app/portal/documents/actions.ts`: `auth.getUser()` → `candidates` lookup by `user_id` → `document_types` lookup (system-global + active) → `documentUploadSchema(flags).safeParse` → `supabase.storage.upload()` (bucket `candidate-documents`, `upsert: false`) → `supabase.rpc('candidate_insert_document', ...)` → best-effort orphan-blob `.remove()` on RPC failure → SQLSTATE `23505` mapped to a friendly "already uploaded" message → `{ ok: true }` on success. `next.config.ts` lifts `experimental.serverActions.bodySizeLimit` to `"6mb"` (Next 16 only supports a global value — no per-route scoping today; the 5 MB PDF cap stays enforced in the validation schema and bucket config). Dialog client component (`upload-dialog.tsx`) gains a hidden `name="code"` input pinned to the row's doc-type code, plus a `useEffect` on `state.ok` (guarded by `didCloseRef`) that closes the modal and triggers a re-fetch — see M6 for the post-upload navigation refinement.
  - **Phase 3 design note — RPC pattern for candidate document inserts** (decided and shipped in M5, migration `20260508000001_candidate_insert_document_rpc.sql`). Candidate-side `documents` inserts go through `candidate_insert_document(...)` rather than a direct INSERT under the existing RLS policy or an INSTEAD OF INSERT view. The function is `SECURITY DEFINER`, runs with `search_path = public, pg_temp`, and (1) re-derives `organisation_id` and `candidate_id` from `auth.uid()` — never trusts client-asserted ownership; (2) verifies `document_type_id` resolves to a system-global, active type (per-org custom types deferred); (3) verifies `storage_path` equals `format('%s/%s/%s/%s.pdf', org, candidate, doc_code, doc_id)` — the same layout `buildDocumentStoragePath()` produces in `src/lib/documents.ts`, so the action's path builder and the RPC's verifier are two anchors on one rope; (4) `PERFORM set_config('app.actor_type', 'candidate', true)` so the existing `audit_trigger` on `documents` records the INSERT as `actor_type='candidate'` (same mechanism as `candidate_self_update`); (5) inserts and returns the new id. EXECUTE is revoked from PUBLIC and granted to `authenticated` only. **Why RPC over an INSTEAD OF INSERT view:** documents are immutable inserts (corrections via supersession, not UPDATE), so we don't gain anything from the view's column-allowlist machinery, and a single named function is more naturally fit, easier to audit, and gives us the txn-tagging hook in one place. HR uploads continue to INSERT directly under the existing `is_org_member` policy and do not use this RPC; the candidate-self branch of `documents_insert` remains in place as defense in depth.
  - **Phase 3 design note — close-after-success choreography** (decided in M3, landed in M5, refined in M6): `uploadDocument` returns `{ ok: true } | { fieldErrors } | { error }` rather than calling `redirect()`. `redirect()` throws `NEXT_REDIRECT`, which bypasses any `setOpen(false)` queued client-side. The dialog reacts to `ok` in a `useEffect` (guarded by `didCloseRef` so re-mounts with retained ok-state can't re-fire), calls `setOpen(false)`, then `router.replace('/portal/documents?uploaded=<code>', { scroll: false })`. The query-string change re-renders the page (so the row updates) AND signals the success banner (M6). `replace` not `push` keeps back-button history clean. Assumption: the dialog only opens from `/portal/documents` — if deep-linkable upload URLs ever arrive (e.g. an email "click to upload your First Aid cert"), this needs revisiting.
  - **M6 landed (Phase 3 polish, closes Phase 3):** post-upload success banner, long-form date display, and a documents-progress mirror on the portal index. (1) Banner: `/portal/documents?uploaded=<code>` is read by the list page (Next 16 `searchParams: Promise<…>`, awaited inside the async RSC), the code is resolved against the already-fetched `docTypes` array (no human name in the URL — keeps it short and avoids escaping), and a client `UploadedBanner` renders a teal-accented "**[Doc type name]** uploaded — pending review" with a dismiss button. Stays until dismissed (compliance flow benefits from explicit acknowledgement) — dismiss → `router.replace('/portal/documents', { scroll: false })`. Stale or unresolvable codes render no banner. (2) Long-form dates: extracted `formatAuDate(iso)` to `src/lib/date.ts` so the read-mode profile, the locked DOB block in edit mode, and any future date display all render `10 August 1995` rather than `1995-08-10`. (3) Index card mirrors the documents page's `verifiedRequired / totalRequired (pctComplete%)` so the candidate sees their progress without clicking through. Verified end-to-end against dev: upload a PDF → banner appears with the doc-type name → dismiss drops the param → reload → banner gone; both DOB sites render long-form; portal index card shows the correct progress numbers.
- **Phase 3 closed.** Next: **Phase 4 — HR admin login flow + `organisation_members` seed**, then HR-side document review (verify / reject), then a candidate "view what I uploaded" affordance (signed-URL plumbing shared with HR review). Re-upload / supersession via `replaces_document_id` is still deferred — the RPC currently always inserts as a new document and the unique partial index fires `23505` on a second attempt for the same type (mapped to a friendly message in the action). Per-org custom doc types, image upload support, and server-side virus scanning all remain post-MVP.
