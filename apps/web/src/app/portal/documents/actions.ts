"use server";

import { createClient } from "@/lib/supabase/server";
import {
  buildDocumentStoragePath,
  DOCUMENT_ALLOWED_MIME,
  DOCUMENT_STORAGE_BUCKET,
} from "@sentinel/shared/documents";
import {
  documentUploadSchema,
  type DocumentTypeFlags,
} from "@sentinel/shared/validation/document";

// =============================================================================
// Document upload — server action.
//
// Pipeline:
//   1. auth.getUser() — return state on no session (don't redirect from a
//      useActionState reducer; the dialog choreography needs the state back,
//      not a NEXT_REDIRECT throw).
//   2. Look up candidate row by user_id (deleted_at IS NULL).
//   3. Read `code` from the dialog's hidden field (untrusted), look up the
//      document_types row (system-global only for v1) — the row gives us
//      the doc type id + flags for the validation schema.
//   4. Build documentUploadSchema(flags) and parse the FormData. fieldErrors
//      surface back to the dialog.
//   5. Generate doc_id; build storage path via buildDocumentStoragePath()
//      (single source of truth shared with the RPC's path verification).
//   6. supabase.storage.upload() with upsert: false.
//   7. supabase.rpc('candidate_insert_document', {...}). The RPC is the
//      source of truth for actor_type='candidate' tagging — see
//      20260508000001_candidate_insert_document_rpc.sql.
//   8. On RPC failure: best-effort .remove([path]) to clean up the orphan
//      blob. Special-case Postgres SQLSTATE 23505 (unique_violation on the
//      one-current-per-type partial index) → friendly "already uploaded"
//      copy. All other errors → generic message + console.error.
//   9. Return { ok: true } on success. The dialog's useEffect reacts to
//      ok by closing the modal and calling router.refresh().
//
// Raw RPC error strings ('forbidden', 'invalid document type',
// 'storage_path mismatch') never reach the user — they're internal-only.
// Server-side console.error captures the original for debugging.
// =============================================================================

export type UploadDocumentFieldKey =
  | "file"
  | "reference_number"
  | "issuing_state"
  | "issue_date"
  | "expiry_date";

export type UploadDocumentState = {
  ok?: true;
  error?: string;
  fieldErrors?: Partial<Record<UploadDocumentFieldKey, string>>;
};

const GENERIC_ERROR = "Upload failed. Please try again in a moment.";
const SESSION_ERROR = "Your session has expired — please sign in again.";
const PROFILE_ERROR =
  "We couldn't find your candidate profile. Please contact your HR administrator.";
const INVALID_TYPE_ERROR =
  "That document type isn't recognised. Please refresh the page and try again.";
const DUPLICATE_ERROR =
  "You've already uploaded this document. Replacing an existing upload is coming soon.";

const PG_UNIQUE_VIOLATION = "23505";

export async function uploadDocument(
  _prev: UploadDocumentState,
  formData: FormData,
): Promise<UploadDocumentState> {
  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: SESSION_ERROR };
  }

  // 2. Candidate row → org_id + candidate_id for the storage path.
  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, organisation_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (candidateError) {
    console.error("uploadDocument: candidate fetch failed", {
      error: candidateError,
    });
    return { error: GENERIC_ERROR };
  }
  if (!candidate) {
    return { error: PROFILE_ERROR };
  }

  // 3. Doc type — the dialog passes `code` as a hidden field. Treated as
  // untrusted; the predicate here mirrors the RPC's own check.
  const codeValue = formData.get("code");
  if (typeof codeValue !== "string" || codeValue.length === 0) {
    return { error: GENERIC_ERROR };
  }
  const code = codeValue;

  const { data: docType, error: docTypeError } = await supabase
    .from("document_types")
    .select("id, captures_reference_number, captures_state, has_expiry")
    .eq("code", code)
    .is("organisation_id", null)
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle();

  if (docTypeError) {
    console.error("uploadDocument: doc-type fetch failed", {
      error: docTypeError,
    });
    return { error: GENERIC_ERROR };
  }
  if (!docType) {
    return { error: INVALID_TYPE_ERROR };
  }

  const flags: DocumentTypeFlags = {
    capturesReferenceNumber: docType.captures_reference_number,
    capturesState: docType.captures_state,
    hasExpiry: docType.has_expiry,
  };

  // 4. Schema parse. Field names line up with the dialog's input `name`
  // attributes verbatim (M4 set this contract).
  const getString = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };

  const parsed = documentUploadSchema(flags).safeParse({
    file: formData.get("file"),
    reference_number: getString("reference_number"),
    issuing_state: getString("issuing_state"),
    issue_date: getString("issue_date"),
    expiry_date: getString("expiry_date"),
  });

  if (!parsed.success) {
    const fieldErrors: UploadDocumentState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as UploadDocumentFieldKey | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const data = parsed.data;
  const file = data.file;

  // 5. Build storage path. Same builder the RPC's expected-path check
  // uses — drift between caller and verifier is impossible.
  const docId = crypto.randomUUID();
  const storagePath = buildDocumentStoragePath({
    organisationId: candidate.organisation_id,
    candidateId: candidate.id,
    docTypeCode: code,
    documentId: docId,
  });

  // 6. Storage upload. upsert: false catches the (unlikely) UUID collision
  // and any pre-existing object at this path.
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: DOCUMENT_ALLOWED_MIME,
      upsert: false,
    });

  if (uploadError) {
    console.error("uploadDocument: storage upload failed", {
      error: uploadError,
      storagePath,
    });
    return { error: GENERIC_ERROR };
  }

  // 7. RPC insert. Optional fields are omitted from the args object when
  // the parsed schema produced undefined — the Postgres function defaults
  // them to NULL.
  const rpcArgs: Record<string, unknown> = {
    p_id: docId,
    p_document_type_id: docType.id,
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_file_size_bytes: file.size,
    p_mime_type: file.type,
  };
  if (data.reference_number !== undefined)
    rpcArgs.p_reference_number = data.reference_number;
  if (data.issuing_state !== undefined)
    rpcArgs.p_issuing_state = data.issuing_state;
  if (data.issue_date !== undefined) rpcArgs.p_issue_date = data.issue_date;
  if (data.expiry_date !== undefined) rpcArgs.p_expiry_date = data.expiry_date;

  const { error: rpcError } = await supabase.rpc(
    "candidate_insert_document",
    rpcArgs,
  );

  if (rpcError) {
    // 8. Orphan-blob cleanup — best effort. If remove() itself fails
    // (network blip, permissions oddity), log and move on; the user-facing
    // error is still the RPC failure.
    try {
      const { error: removeError } = await supabase.storage
        .from(DOCUMENT_STORAGE_BUCKET)
        .remove([storagePath]);
      if (removeError) {
        console.error("uploadDocument: orphan cleanup failed", {
          error: removeError,
          storagePath,
        });
      }
    } catch (cleanupErr) {
      console.error("uploadDocument: orphan cleanup threw", {
        error: cleanupErr,
        storagePath,
      });
    }

    if (rpcError.code === PG_UNIQUE_VIOLATION) {
      return { error: DUPLICATE_ERROR };
    }

    console.error("uploadDocument: rpc failed", {
      error: rpcError,
      code,
      docId,
    });
    return { error: GENERIC_ERROR };
  }

  // 9. Success — dialog reacts to ok via useEffect (close + router.refresh).
  return { ok: true };
}
