// =============================================================================
// Documents — domain helpers for the candidate documents portal.
//
// Categories are a UI concept (visual grouping); the schema only stores
// `display_order`. The mapping is keyed on `document_types.code` so it
// survives id changes between environments.
//
// File constants and the storage path builder live here too — single
// source of truth shared between the validation schema (which checks the
// candidate's upload) and the action that writes to Supabase Storage.
// =============================================================================

export type DocumentCategory =
  | "required_clearances"
  | "health_safety"
  | "transport"
  | "qualifications";

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  required_clearances: "Required clearances",
  health_safety: "Health & safety",
  transport: "Transport",
  qualifications: "Qualifications",
};

// Display order of categories on the list. Within a category, types are
// ordered by `document_types.display_order` (the SQL query handles that).
export const DOCUMENT_CATEGORY_ORDER: DocumentCategory[] = [
  "required_clearances",
  "health_safety",
  "transport",
  "qualifications",
];

const DOCUMENT_CATEGORY_BY_CODE: Record<string, DocumentCategory> = {
  ndis_worker_screening_check: "required_clearances",
  working_with_children_check: "required_clearances",
  national_police_check: "required_clearances",
  ndis_worker_orientation: "required_clearances",
  first_aid_certificate: "health_safety",
  cpr_certificate: "health_safety",
  drivers_licence: "transport",
  vehicle_insurance: "transport",
  cert_iii_individual_support: "qualifications",
  cert_iv_individual_support: "qualifications",
  cert_iv_disability: "qualifications",
  cert_iv_ageing_support: "qualifications",
};

// Fallback for codes outside the v1 system-global catalogue (e.g. a future
// org-custom type). Lands in Qualifications by default until categorised.
const DOCUMENT_DEFAULT_CATEGORY: DocumentCategory = "qualifications";

export function categoryForCode(code: string): DocumentCategory {
  return DOCUMENT_CATEGORY_BY_CODE[code] ?? DOCUMENT_DEFAULT_CATEGORY;
}

// Mirrors the `document_status` enum in the schema. Surfaced here so UI
// code branching on status gets type checked.
export type DocumentStatus =
  | "pending_review"
  | "verified"
  | "rejected"
  | "superseded";

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending_review: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
  superseded: "Superseded",
};

// ---------------------------------------------------------------------------
// File + storage constants
//
// Consumed by both the validation schema (`src/lib/validation/document.ts`)
// and the upload action (M5). Bucket-level limits in the M1 migration must
// stay aligned with these values — change them in lockstep.
// ---------------------------------------------------------------------------

export const DOCUMENT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const DOCUMENT_ALLOWED_MIME = "application/pdf" as const;
export const DOCUMENT_ALLOWED_EXTENSION = ".pdf" as const;

// Storage bucket name. Hard-coded literal — see CLAUDE.md → Storage for
// the bucket-rename lockstep rule (RLS policies + this constant move
// together).
export const DOCUMENT_STORAGE_BUCKET = "candidate-documents" as const;

// Path layout: <org_id>/<candidate_id>/<doc_type_code>/<doc_id>.pdf
// Must match the Storage RLS policies in migration 20260507000001 — token
// [1] (org_id) and [2] (candidate_id) are RLS-checked; [3] / filename are
// application-enforced. Don't reorder without updating the policies.
export function buildDocumentStoragePath(args: {
  organisationId: string;
  candidateId: string;
  docTypeCode: string;
  documentId: string;
}): string {
  return `${args.organisationId}/${args.candidateId}/${args.docTypeCode}/${args.documentId}${DOCUMENT_ALLOWED_EXTENSION}`;
}

// Expiry-date label varies by type. The schema column comment notes that
// for National Police Check, the "expiry" is provider freshness policy
// (e.g. 12 months from issue) rather than a real expiry on the
// certificate, so we surface that distinction in the form copy.
export function expiryLabelFor(code: string): string {
  return code === "national_police_check" ? "Renewal due" : "Expires";
}
