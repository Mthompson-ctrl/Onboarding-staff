-- =============================================================================
-- Sentinel HR — RLS policies + candidate self-update view/trigger + timeline view
-- All SELECT policies filter deleted_at IS NULL where applicable.
-- Service-role connections bypass RLS entirely (used for: public lead intake,
-- invitation token lookup, system jobs, integration handoff, consent recording).
--
-- Note: with RLS enabled, the absence of a policy = denial. Tables like
-- organisations have no INSERT policy for `authenticated` — that is the
-- enforcement, not an oversight. Privileged operations use the service role.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- organisations
-- ----------------------------------------------------------------------------

CREATE POLICY organisations_select ON organisations
  FOR SELECT TO authenticated
  USING (is_org_member(id) AND deleted_at IS NULL);

CREATE POLICY organisations_update ON organisations
  FOR UPDATE TO authenticated
  USING (is_org_admin(id))
  WITH CHECK (is_org_admin(id));

-- INSERT/DELETE on organisations: service role only.

-- ----------------------------------------------------------------------------
-- organisation_members
-- ----------------------------------------------------------------------------

CREATE POLICY organisation_members_select ON organisation_members
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id) AND deleted_at IS NULL);

CREATE POLICY organisation_members_insert ON organisation_members
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(organisation_id));

CREATE POLICY organisation_members_update ON organisation_members
  FOR UPDATE TO authenticated
  USING (is_org_admin(organisation_id))
  WITH CHECK (is_org_admin(organisation_id));

-- ----------------------------------------------------------------------------
-- leads — public form INSERT goes through service-role server-side route
-- ----------------------------------------------------------------------------

CREATE POLICY leads_select ON leads
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id) AND deleted_at IS NULL);

CREATE POLICY leads_insert ON leads
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organisation_id));

CREATE POLICY leads_update ON leads
  FOR UPDATE TO authenticated
  USING (is_org_member(organisation_id))
  WITH CHECK (is_org_member(organisation_id));

-- ----------------------------------------------------------------------------
-- candidates  (base table — HR-only writes; candidate self-edits via view)
-- ----------------------------------------------------------------------------

CREATE POLICY candidates_select ON candidates
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (is_org_member(organisation_id) OR is_candidate_self(user_id))
  );

CREATE POLICY candidates_insert ON candidates
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organisation_id));

CREATE POLICY candidates_update ON candidates
  FOR UPDATE TO authenticated
  USING (is_org_member(organisation_id))
  WITH CHECK (is_org_member(organisation_id));

-- ----------------------------------------------------------------------------
-- candidate_self_updatable — view + INSTEAD OF UPDATE trigger
-- Candidates UPDATE this view to edit their own profile. The trigger writes
-- the allowlisted columns to the base table, enforcing:
--   - row ownership (must be the candidate's own row)
--   - DOB lock (editable while null, locked once set)
--   - RTW lock (locked once status leaves invited / profile_in_progress)
-- Consent fields (privacy_consent_at, terms_accepted_at) are NOT in the view —
-- they are System-only, set once via a server-side consent endpoint.
-- ----------------------------------------------------------------------------

CREATE VIEW candidate_self_updatable
WITH (security_invoker = true) AS
SELECT
  id,
  organisation_id,
  first_name,
  last_name,
  preferred_name,
  pronouns,
  date_of_birth,
  phone,
  address_line1,
  address_line2,
  suburb,
  state,
  postcode,
  country,
  emergency_contact_name,
  emergency_contact_phone,
  emergency_contact_relationship,
  rtw_status,
  visa_subclass,
  visa_expiry,
  preferred_roles,
  availability,
  has_drivers_licence,
  has_own_vehicle,
  languages_spoken
FROM candidates
WHERE user_id = auth.uid()
  AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION candidate_self_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Re-verify ownership; SECURITY DEFINER bypasses RLS so we must check.
  IF NOT EXISTS (
    SELECT 1 FROM candidates
    WHERE id = OLD.id
      AND user_id = auth.uid()
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'candidate_self_update: forbidden';
  END IF;

  -- date_of_birth: editable while null, locked once set.
  IF OLD.date_of_birth IS NOT NULL
     AND NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
    RAISE EXCEPTION 'candidate_self_update: date_of_birth cannot be changed once set';
  END IF;

  -- RTW fields: locked once status leaves invited / profile_in_progress.
  IF OLD.status NOT IN ('invited', 'profile_in_progress')
     AND (
       NEW.rtw_status     IS DISTINCT FROM OLD.rtw_status
       OR NEW.visa_subclass IS DISTINCT FROM OLD.visa_subclass
       OR NEW.visa_expiry   IS DISTINCT FROM OLD.visa_expiry
     ) THEN
    RAISE EXCEPTION 'candidate_self_update: right-to-work fields are locked once profile is complete';
  END IF;

  -- Tag transaction so audit_trigger records actor_type='candidate'.
  PERFORM set_config('app.actor_type', 'candidate', true);

  UPDATE candidates SET
    first_name                     = NEW.first_name,
    last_name                      = NEW.last_name,
    preferred_name                 = NEW.preferred_name,
    pronouns                       = NEW.pronouns,
    date_of_birth                  = NEW.date_of_birth,
    phone                          = NEW.phone,
    address_line1                  = NEW.address_line1,
    address_line2                  = NEW.address_line2,
    suburb                         = NEW.suburb,
    state                          = NEW.state,
    postcode                       = NEW.postcode,
    country                        = NEW.country,
    emergency_contact_name         = NEW.emergency_contact_name,
    emergency_contact_phone        = NEW.emergency_contact_phone,
    emergency_contact_relationship = NEW.emergency_contact_relationship,
    rtw_status                     = NEW.rtw_status,
    visa_subclass                  = NEW.visa_subclass,
    visa_expiry                    = NEW.visa_expiry,
    preferred_roles                = NEW.preferred_roles,
    availability                   = NEW.availability,
    has_drivers_licence            = NEW.has_drivers_licence,
    has_own_vehicle                = NEW.has_own_vehicle,
    languages_spoken               = NEW.languages_spoken
  WHERE id = OLD.id;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_candidate_self_update
  INSTEAD OF UPDATE ON candidate_self_updatable
  FOR EACH ROW EXECUTE FUNCTION candidate_self_update();

GRANT SELECT, UPDATE ON candidate_self_updatable TO authenticated;

-- ----------------------------------------------------------------------------
-- candidate_timeline — convenience view joining lifecycle timestamps from
-- source-of-truth tables (leads, invitations) without denormalising onto
-- candidates. RLS inherits from base tables via security_invoker = true.
-- ----------------------------------------------------------------------------

CREATE VIEW candidate_timeline
WITH (security_invoker = true) AS
SELECT
  c.id AS candidate_id,
  c.organisation_id,
  c.created_at,
  c.profile_completed_at,
  c.documents_submitted_at,
  c.submitted_for_review_at,
  c.decision_made_at,
  c.handoff_published_at,
  l.converted_at AS lead_converted_at,
  (
    SELECT max(i.created_at) FROM invitations i
    WHERE i.candidate_id = c.id AND i.deleted_at IS NULL
  ) AS most_recent_invitation_sent_at,
  (
    SELECT max(i.accepted_at) FROM invitations i
    WHERE i.candidate_id = c.id
      AND i.accepted_at IS NOT NULL
      AND i.deleted_at IS NULL
  ) AS invitation_accepted_at
FROM candidates c
LEFT JOIN leads l ON l.id = c.source_lead_id;

GRANT SELECT ON candidate_timeline TO authenticated;

-- ----------------------------------------------------------------------------
-- invitations — token verification at acceptance happens server-side via service role
-- ----------------------------------------------------------------------------

CREATE POLICY invitations_select ON invitations
  FOR SELECT TO authenticated
  USING (is_org_member(organisation_id) AND deleted_at IS NULL);

CREATE POLICY invitations_insert ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organisation_id));

CREATE POLICY invitations_update ON invitations
  FOR UPDATE TO authenticated
  USING (is_org_member(organisation_id))
  WITH CHECK (is_org_member(organisation_id));

-- ----------------------------------------------------------------------------
-- document_types
-- ----------------------------------------------------------------------------

CREATE POLICY document_types_select ON document_types
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND is_active = true
    AND (organisation_id IS NULL OR is_org_member(organisation_id))
  );

CREATE POLICY document_types_insert ON document_types
  FOR INSERT TO authenticated
  WITH CHECK (
    organisation_id IS NOT NULL AND is_org_admin(organisation_id)
  );

CREATE POLICY document_types_update ON document_types
  FOR UPDATE TO authenticated
  USING (
    organisation_id IS NOT NULL AND is_org_admin(organisation_id)
  )
  WITH CHECK (
    organisation_id IS NOT NULL AND is_org_admin(organisation_id)
  );

-- ----------------------------------------------------------------------------
-- documents
-- ----------------------------------------------------------------------------

CREATE POLICY documents_select ON documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      is_org_member(organisation_id)
      OR EXISTS (
        SELECT 1 FROM candidates c
        WHERE c.id = documents.candidate_id
          AND is_candidate_self(c.user_id)
          AND c.deleted_at IS NULL
      )
    )
  );

CREATE POLICY documents_insert ON documents
  FOR INSERT TO authenticated
  WITH CHECK (
    is_org_member(organisation_id)
    OR EXISTS (
      SELECT 1 FROM candidates c
      WHERE c.id = documents.candidate_id
        AND is_candidate_self(c.user_id)
        AND c.deleted_at IS NULL
    )
  );

CREATE POLICY documents_update ON documents
  FOR UPDATE TO authenticated
  USING (is_org_member(organisation_id))
  WITH CHECK (is_org_member(organisation_id));

-- ----------------------------------------------------------------------------
-- audit_log — admin-only read; immutable; INSERT via SECURITY DEFINER triggers
-- ----------------------------------------------------------------------------

CREATE POLICY audit_log_select ON audit_log
  FOR SELECT TO authenticated
  USING (is_org_admin(organisation_id));
