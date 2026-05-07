// =============================================================================
// Documents — UI-side helpers for the candidate documents portal.
//
// Categories are a UI concept (visual grouping); the schema only stores
// `display_order`. The mapping is keyed on `document_types.code` so it
// survives id changes between environments.
//
// This module starts intentionally minimal. M3 will add the storage path
// builder, file-size / MIME constants, and per-type field-requirement
// helpers when the upload pipeline lands.
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
