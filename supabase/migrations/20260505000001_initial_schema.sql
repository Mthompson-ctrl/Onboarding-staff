-- =============================================================================
-- Sentinel HR — Onboarding Module — Initial schema
-- Multi-tenant via Supabase RLS keyed on organisation_id.
-- Soft-delete on tenant tables; append-only audit_log with belt-and-braces triggers.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums and domains
-- ----------------------------------------------------------------------------

CREATE DOMAIN au_state AS text
  CHECK (VALUE IN ('NSW','VIC','QLD','WA','SA','TAS','ACT','NT'));

CREATE TYPE lead_status AS ENUM (
  'new','in_review','qualified','invited','rejected','duplicate'
);

CREATE TYPE candidate_status AS ENUM (
  'invited',
  'profile_in_progress',
  'documents_in_progress',
  'under_review',
  'approved',
  'rejected',
  'withdrawn'
);

CREATE TYPE document_status AS ENUM (
  'pending_review','verified','rejected','superseded'
);

CREATE TYPE rtw_status AS ENUM (
  'citizen','permanent_resident','temporary_visa','other'
);

CREATE TYPE actor_type AS ENUM ('user','candidate','system');

-- ----------------------------------------------------------------------------
-- organisations + membership
-- ----------------------------------------------------------------------------

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  ndis_provider_number text,
  primary_contact_email text,
  primary_state au_state,

  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organisation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin','verifier','viewer')),

  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX organisation_members_org_user_uniq
  ON organisation_members (organisation_id, user_id)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- leads — public enquiry submissions (no auth user)
-- ----------------------------------------------------------------------------

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  preferred_state au_state,
  preferred_role text,
  availability_summary text,
  has_existing_screening boolean,
  source text,
  notes text,                           -- HR-internal

  status lead_status NOT NULL DEFAULT 'new',
  rejection_reason text,

  converted_to_candidate_id uuid,        -- FK added after candidates table
  converted_at timestamptz,

  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_org_status_idx
  ON leads (organisation_id, status) WHERE deleted_at IS NULL;
CREATE INDEX leads_email_idx
  ON leads (organisation_id, lower(email)) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- candidates — per-org candidate / onboarding subject
-- ----------------------------------------------------------------------------

CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  person_id uuid,                       -- future people(id); nullable for now
  source_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,

  -- Identity / contact
  first_name text NOT NULL,
  last_name text NOT NULL,
  preferred_name text,
  pronouns text,
  date_of_birth date,
  email text NOT NULL,
  phone text,

  -- Address (home address; state is the candidate's home state)
  address_line1 text,
  address_line2 text,
  suburb text,
  state au_state,
  postcode text,
  country text DEFAULT 'AU',

  -- Emergency contact
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,

  -- Right To Work (locked once status passes profile_in_progress; see candidate_self_update())
  rtw_status rtw_status,
  visa_subclass text,
  visa_expiry date,

  -- Role / availability
  preferred_roles text[],
  availability jsonb,
  has_drivers_licence boolean,
  has_own_vehicle boolean,
  languages_spoken text[],

  -- Pay setup (HR-managed)
  schads_level text,
  schads_pay_point text,

  -- Consent (System-only; immutable once set)
  privacy_consent_at timestamptz,
  terms_accepted_at timestamptz,

  -- Onboarding lifecycle
  status candidate_status NOT NULL DEFAULT 'invited',
  profile_completed_at timestamptz,
  documents_submitted_at timestamptz,
  submitted_for_review_at timestamptz,

  -- Decision
  decision_made_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_made_at timestamptz,
  rejection_reason text,                -- internal-only
  withdrawal_reason text,

  -- Handoff to main HRMS (integration boundary)
  handoff_payload jsonb,
  handoff_published_at timestamptz,

  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX candidates_org_status_idx
  ON candidates (organisation_id, status) WHERE deleted_at IS NULL;
CREATE INDEX candidates_person_idx
  ON candidates (person_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX candidates_org_user_uniq
  ON candidates (organisation_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX candidates_org_email_uniq
  ON candidates (organisation_id, lower(email))
  WHERE deleted_at IS NULL;

ALTER TABLE leads
  ADD CONSTRAINT leads_converted_to_candidate_fk
  FOREIGN KEY (converted_to_candidate_id)
  REFERENCES candidates(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- invitations — token to convert lead → candidate signup
-- ----------------------------------------------------------------------------

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  token_hash text NOT NULL UNIQUE,      -- store hash; raw token only emailed
  email text NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,

  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invitations_candidate_idx
  ON invitations (candidate_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- document_types — system-global + per-org custom catalogue
-- organisation_id IS NULL  ⇒ global / seeded NDIS standard
-- organisation_id NOT NULL ⇒ provider-defined custom
-- ----------------------------------------------------------------------------

CREATE TABLE document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,

  required_by_default boolean NOT NULL DEFAULT true,
  has_expiry boolean NOT NULL DEFAULT true,
  captures_state boolean NOT NULL DEFAULT false,
  captures_reference_number boolean NOT NULL DEFAULT true,

  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,

  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX document_types_code_global_uniq
  ON document_types (code)
  WHERE organisation_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX document_types_code_org_uniq
  ON document_types (organisation_id, code)
  WHERE organisation_id IS NOT NULL AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- documents — versioned, immutable upload records
-- ----------------------------------------------------------------------------

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,

  replaces_document_id uuid UNIQUE REFERENCES documents(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,

  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint,
  mime_type text,

  reference_number text,
  issuing_state au_state,                -- only used when document_type.captures_state
  issue_date date,
  expiry_date date,

  status document_status NOT NULL DEFAULT 'pending_review',
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verification_notes text,
  rejection_reason text,

  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  deleted_at timestamptz
);

COMMENT ON COLUMN documents.expiry_date IS
'Date this document is no longer considered valid. For most types this is a real expiry printed on the certificate (First Aid, WWCC, vehicle insurance). For National Police Check it reflects provider freshness policy (e.g. 12 months from issue), not an expiry on the certificate itself. UI should label per document_type — e.g. "Renewal due" for police check, "Expires" for First Aid.';

CREATE INDEX documents_candidate_idx
  ON documents (candidate_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_org_status_idx
  ON documents (organisation_id, status) WHERE deleted_at IS NULL;
CREATE INDEX documents_type_idx
  ON documents (document_type_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_expiry_idx
  ON documents (expiry_date)
  WHERE status = 'verified' AND deleted_at IS NULL;

CREATE UNIQUE INDEX documents_one_current_per_type
  ON documents (candidate_id, document_type_id)
  WHERE status <> 'superseded' AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- audit_log — append-only event stream
-- ----------------------------------------------------------------------------

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  organisation_id uuid REFERENCES organisations(id) ON DELETE SET NULL,

  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type actor_type NOT NULL,

  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,

  before_state jsonb,
  after_state jsonb,
  metadata jsonb,

  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_org_time_idx
  ON audit_log (organisation_id, occurred_at DESC);
CREATE INDEX audit_log_entity_idx
  ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx
  ON audit_log (actor_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organisations_updated_at  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leads_updated_at          BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_candidates_updated_at     BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_document_types_updated_at BEFORE UPDATE ON document_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- Belt-and-braces audit trigger
-- Fires on every INSERT/UPDATE/DELETE to audited tables. Resolves actor via
-- auth.uid(); service-role / system calls record actor_type = 'system'.
-- App code can mark a candidate-originated transaction via:
--   SELECT set_config('app.actor_type', 'candidate', true);
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_type actor_type;
  v_entity_id uuid;
  v_org_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    v_actor_type := 'system';
  ELSE
    BEGIN
      v_actor_type := COALESCE(
        NULLIF(current_setting('app.actor_type', true), '')::actor_type,
        'user'
      );
    EXCEPTION WHEN others THEN
      v_actor_type := 'user';
    END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_org_id    := OLD.organisation_id;
    v_before    := to_jsonb(OLD);
    v_after     := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := NEW.id;
    v_org_id    := NEW.organisation_id;
    v_before    := to_jsonb(OLD);
    v_after     := to_jsonb(NEW);
  ELSE  -- INSERT
    v_entity_id := NEW.id;
    v_org_id    := NEW.organisation_id;
    v_before    := NULL;
    v_after     := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_log (
    organisation_id, actor_id, actor_type, action,
    entity_type, entity_id, before_state, after_state, metadata
  ) VALUES (
    v_org_id, v_actor_id, v_actor_type,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME, v_entity_id, v_before, v_after,
    jsonb_build_object('source','db_trigger','op',TG_OP)
  );

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_organisation_members
  AFTER INSERT OR UPDATE OR DELETE ON organisation_members
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER trg_audit_leads
  AFTER INSERT OR UPDATE OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER trg_audit_candidates
  AFTER INSERT OR UPDATE OR DELETE ON candidates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER trg_audit_invitations
  AFTER INSERT OR UPDATE OR DELETE ON invitations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER trg_audit_document_types
  AFTER INSERT OR UPDATE OR DELETE ON document_types
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER trg_audit_documents
  AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- Note: organisations is intentionally NOT audited via this generic trigger.
-- Org-level events should be audited from app code with richer context.

-- ----------------------------------------------------------------------------
-- Email sync: auth.users.email → candidates.email
-- Keeps candidates.email aligned when the user changes email via Supabase Auth.
-- The audit_trigger on candidates captures the change as a normal UPDATE event.
-- NOTE: requires postgres-role privileges to attach to auth.users. Supabase CLI
-- (`supabase db push` / `supabase migration up`) and the dashboard SQL editor
-- both run as postgres and apply this cleanly. If a hosted-plan restriction
-- blocks it, fall back to performing the sync in app code at email-change time.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_candidate_email_from_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE candidates
       SET email = NEW.email
     WHERE user_id = NEW.id
       AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_candidate_email
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_candidate_email_from_auth();

-- ----------------------------------------------------------------------------
-- RLS — enabled everywhere; policies in next migration
-- ----------------------------------------------------------------------------

ALTER TABLE organisations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log             ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_org_member(org_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisation_members
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION is_org_admin(org_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisation_members
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role = 'admin'
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION is_candidate_self(candidate_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT candidate_user_id = auth.uid();
$$;
