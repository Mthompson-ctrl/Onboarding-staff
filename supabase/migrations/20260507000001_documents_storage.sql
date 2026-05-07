-- =============================================================================
-- Sentinel HR — Onboarding Module — M1: candidate-documents storage
--
-- Creates the private bucket for candidate document uploads (PDF only, ≤5MB)
-- and storage.objects RLS policies that mirror the documents-table access
-- model: candidate reads/writes their own <org_id>/<candidate_id>/... prefix;
-- HR reads/writes anywhere in their org's prefix; UPDATE and DELETE are
-- denied at the RLS layer for `authenticated` (immutable design — service
-- role handles retention).
--
-- Path layout (set by upload action):
--   <org_id>/<candidate_id>/<doc_type_code>/<doc_id>.pdf
--     [1] = org_id        (uuid as text, lowercase)        — (storage.foldername(name))[1]
--     [2] = candidate_id  (uuid as text, lowercase)        — (storage.foldername(name))[2]
--     [3] = doc_type_code (e.g. 'wwcc', 'ndis_screening')  — (storage.foldername(name))[3], opaque to RLS
--     [4] = doc_id.pdf    (uuid as text + .pdf)            — storage.filename(name), opaque to RLS
--
-- RLS enforces WHO can write into [1]/[2]; the upload Server Action enforces
-- WHAT goes into [3]/[4]. The two layers compose; neither alone is sufficient.
--
-- The bucket name 'candidate-documents' is hard-coded in every policy below.
-- If the bucket is ever renamed, the policies must be updated in lockstep.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Bucket — UPSERT so this migration is the source of truth for bucket config.
-- The dashboard-created bucket (10 MB, any MIME) is corrected to 5 MB / PDF.
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-documents',
  'candidate-documents',
  false,
  5242880,                         -- 5 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Policies on storage.objects
-- RLS is already enabled on storage.objects by the Supabase platform; we
-- scope every policy below to bucket_id = 'candidate-documents' so this
-- migration cannot affect other buckets.
-- ----------------------------------------------------------------------------

-- INSERT — candidate writes only into their own <org_id>/<candidate_id>/ prefix.
-- Text comparison on the path tokens (no uuid cast needed) — safe even on
-- malformed paths; they simply won't match.
CREATE POLICY "candidate-documents candidate insert own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'candidate-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.user_id = auth.uid()
        AND c.deleted_at IS NULL
        AND (storage.foldername(name))[1] = c.organisation_id::text
        AND (storage.foldername(name))[2] = c.id::text
    )
  );

-- INSERT — HR writes anywhere in their org's prefix.
-- Regex guards the uuid cast: a malformed first token is denied without
-- raising an invalid_text_representation error inside RLS evaluation.
CREATE POLICY "candidate-documents hr insert org"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'candidate-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- SELECT — candidate reads their own prefix.
CREATE POLICY "candidate-documents candidate select own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'candidate-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.user_id = auth.uid()
        AND c.deleted_at IS NULL
        AND (storage.foldername(name))[1] = c.organisation_id::text
        AND (storage.foldername(name))[2] = c.id::text
    )
  );

-- SELECT — HR reads anywhere in their org's prefix.
CREATE POLICY "candidate-documents hr select org"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'candidate-documents'
    AND array_length(storage.foldername(name), 1) >= 1
    AND (storage.foldername(name))[1] ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- UPDATE / DELETE — no policy for `authenticated`. Absence = denial.
-- Matches the immutable-row design of the documents table (corrections via
-- supersession, not in-place edit). Retention work is service-role only.
