-- =============================================================================
-- 20260506000001_enquiry_form_schema.sql
--
-- Schema changes to support the public enquiry form at /enquire.
--
-- 1. Adds enquiry-capture columns to `leads`:
--      suburb, has_existing_screening, availability_summary, privacy_consent_at
-- 2. Seeds the Social Plus pilot organisation. The public enquiry API route
--    looks this up by slug ('social-plus'); the slug is overridable via the
--    DEFAULT_ORGANISATION_SLUG env var.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. New columns on `leads`
-- ----------------------------------------------------------------------------
-- All nullable: HR-entered leads (future admin UI, walk-ins, phone enquiries,
-- imports from other systems) may legitimately omit any of these. Public
-- enquiry form enforces required fields at the API layer, where it can
-- return a friendly validation message.

ALTER TABLE leads
  ADD COLUMN suburb                 text,
  ADD COLUMN has_existing_screening boolean,
  ADD COLUMN availability_summary   text,
  ADD COLUMN privacy_consent_at     timestamptz;

COMMENT ON COLUMN leads.suburb IS
  'Suburb supplied in the enquiry form. Used by HR for geographic-fit triage at lead stage; superseded by the candidate address fields once converted.';

COMMENT ON COLUMN leads.has_existing_screening IS
  'Self-reported NDIS Worker Screening Check status from the enquiry form. High-signal HR triage hint; verified via the documents flow after conversion.';

COMMENT ON COLUMN leads.availability_summary IS
  'Free-text availability description (e.g. "Mon-Fri days, no weekends"). Triage only — formal availability captured at the candidate-profile step.';

COMMENT ON COLUMN leads.privacy_consent_at IS
  'Timestamp at which the enquirer ticked the consent checkbox. Required by APP 5 (Privacy Act 1988) for public submissions; nullable to allow HR-entered or imported leads. Set once at INSERT, never updated.';

-- The audit_trigger on `leads` uses to_jsonb(NEW)/to_jsonb(OLD), so the new
-- columns flow into before_state / after_state without trigger changes.

-- ----------------------------------------------------------------------------
-- 2. Seed the Social Plus pilot organisation
-- ----------------------------------------------------------------------------
-- Idempotent via the unique constraint on `slug`. Safe to re-run.

INSERT INTO organisations (name, slug, primary_state)
VALUES ('Social Plus Support Work', 'social-plus', 'NSW')
ON CONFLICT (slug) DO NOTHING;
