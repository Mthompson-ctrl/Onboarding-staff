-- =============================================================================
-- Sentinel HR — candidate_insert_document RPC
--
-- Candidates do not INSERT into `documents` directly from app code. They call
-- this SECURITY DEFINER function, which:
--   - re-derives organisation_id and candidate_id from auth.uid() (does not
--     trust client input for ownership)
--   - verifies document_type_id resolves to a system-global, active type
--     (per-org custom types are deferred — see CLAUDE.md)
--   - verifies storage_path matches the expected
--     <org>/<candidate>/<code>/<doc_id>.pdf layout
--   - tags the transaction with app.actor_type='candidate' so the
--     audit_trigger on `documents` records the INSERT as a candidate action
--     (mirrors the candidate_self_updatable INSTEAD OF UPDATE pattern)
--   - performs the INSERT and returns the new document id
--
-- HR uploads do not use this RPC — they continue to INSERT directly under
-- the existing documents_insert RLS policy (is_org_member predicate). The
-- existing candidate-self branch of documents_insert remains in place as
-- defense-in-depth; the application-level path going forward is this RPC.
-- =============================================================================

CREATE OR REPLACE FUNCTION candidate_insert_document(
  p_id                uuid,
  p_document_type_id  uuid,
  p_storage_path      text,
  p_file_name         text,
  p_file_size_bytes   bigint,
  p_mime_type         text,
  p_reference_number  text     DEFAULT NULL,
  p_issuing_state     au_state DEFAULT NULL,
  p_issue_date        date     DEFAULT NULL,
  p_expiry_date       date     DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id         uuid := auth.uid();
  v_candidate_id    uuid;
  v_organisation_id uuid;
  v_doc_code        text;
  v_expected_path   text;
  v_inserted_id     uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'candidate_insert_document: forbidden';
  END IF;

  -- Derive candidate + org from the caller's auth user. Anything the client
  -- might have asserted about candidate_id / organisation_id is ignored.
  SELECT id, organisation_id
    INTO v_candidate_id, v_organisation_id
  FROM candidates
  WHERE user_id = v_user_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate_insert_document: forbidden';
  END IF;

  -- v1: candidates may only attach against system-global doc types.
  SELECT code
    INTO v_doc_code
  FROM document_types
  WHERE id = p_document_type_id
    AND organisation_id IS NULL
    AND is_active = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate_insert_document: invalid document type';
  END IF;

  -- Storage-path format check. Mirrors buildDocumentStoragePath() in
  -- src/lib/documents.ts. Tokens [1] org and [2] candidate are also RLS-
  -- enforced at the storage layer; this check additionally pins token [3]
  -- (doc-type code) and the leaf filename, which storage RLS treats as
  -- opaque.
  v_expected_path := format(
    '%s/%s/%s/%s.pdf',
    v_organisation_id, v_candidate_id, v_doc_code, p_id
  );
  IF p_storage_path IS DISTINCT FROM v_expected_path THEN
    RAISE EXCEPTION 'candidate_insert_document: storage_path mismatch';
  END IF;

  -- Tag txn so audit_trigger on `documents` records actor_type='candidate'.
  -- Same mechanism as candidate_self_update (rls_policies migration).
  PERFORM set_config('app.actor_type', 'candidate', true);

  INSERT INTO documents (
    id,
    organisation_id,
    candidate_id,
    document_type_id,
    storage_path,
    file_name,
    file_size_bytes,
    mime_type,
    reference_number,
    issuing_state,
    issue_date,
    expiry_date,
    uploaded_by
    -- version, status, uploaded_at: column defaults
    -- replaces_document_id: v1 always NULL (no re-upload yet)
    -- verified_by, verified_at, verification_notes, rejection_reason: HR-set
  ) VALUES (
    p_id,
    v_organisation_id,
    v_candidate_id,
    p_document_type_id,
    p_storage_path,
    p_file_name,
    p_file_size_bytes,
    p_mime_type,
    p_reference_number,
    p_issuing_state,
    p_issue_date,
    p_expiry_date,
    v_user_id
  )
  RETURNING id INTO v_inserted_id;

  RETURN v_inserted_id;
END $$;

-- Default Postgres grants EXECUTE to PUBLIC on new functions; revoke and
-- re-grant explicitly to `authenticated` only. `anon` is excluded — calls
-- without a JWT would hit the auth.uid() IS NULL guard above, but an
-- explicit deny is cleaner.
REVOKE ALL ON FUNCTION candidate_insert_document(
  uuid, uuid, text, text, bigint, text, text, au_state, date, date
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION candidate_insert_document(
  uuid, uuid, text, text, bigint, text, text, au_state, date, date
) TO authenticated;
