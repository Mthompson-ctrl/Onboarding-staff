import { z } from "zod";

import {
  DOCUMENT_ALLOWED_MIME,
  DOCUMENT_MAX_FILE_BYTES,
} from "../documents";

import { AU_STATES } from "./au-states";

// =============================================================================
// Document upload validation.
//
// Doc-type metadata flags drive which fields are required. Both the M4 form
// (RSC-side render hints) and the M5 server action (FormData parse) build
// their schema by passing the relevant `document_types` row's flags into
// the factory below. Both call sites query the same row, so there's no
// drift risk between the form's "show this field" decisions and the
// action's "validate this field" decisions.
//
// We deliberately use a factory rather than one fat schema with
// .superRefine — the factory shape gives each call site a Zod schema whose
// inferred type already reflects the conditional fields, instead of
// forcing every consumer to narrow a permissive base type.
// =============================================================================

export type DocumentTypeFlags = {
  capturesReferenceNumber: boolean;
  capturesState: boolean;
  hasExpiry: boolean;
};

// ---------------------------------------------------------------------------
// Field builders — each takes a `required` flag and returns the Zod node
// for that field. Empty/whitespace inputs collapse to undefined when the
// field is optional, mirroring the profile schema's idioms.
// ---------------------------------------------------------------------------

const referenceNumber = (required: boolean) => {
  const base = z.string().trim().max(120, "Reference number is too long");
  return required
    ? base.min(1, "Reference number is required")
    : base.optional().transform((v) => (v && v.length > 0 ? v : undefined));
};

const isoDate = (required: boolean, label: string) => {
  const base = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Enter a valid ${label.toLowerCase()}`);
  return required
    ? base
    : base
        .optional()
        .or(z.literal(""))
        .transform((v) =>
          typeof v === "string" && v.length > 0 ? v : undefined,
        );
};

const issuingState = (required: boolean) => {
  if (required) {
    return z.enum(AU_STATES, "Select an issuing state");
  }
  return z
    .enum(AU_STATES)
    .optional()
    .or(z.literal(""))
    .transform((v) =>
      typeof v === "string" && v.length > 0
        ? (v as (typeof AU_STATES)[number])
        : undefined,
    );
};

// File validation runs against a real `File` instance. `instanceof(File)`
// works in Node 20+ (Server Actions runtime) and in browsers. Empty
// uploads land here as a zero-byte File — the size>0 check catches them.
const documentFile = z
  .instanceof(File, { message: "Choose a PDF to upload" })
  .refine((f) => f.size > 0, "Choose a PDF to upload")
  .refine(
    (f) => f.size <= DOCUMENT_MAX_FILE_BYTES,
    `File must be ${DOCUMENT_MAX_FILE_BYTES / (1024 * 1024)} MB or smaller`,
  )
  .refine(
    (f) => f.type === DOCUMENT_ALLOWED_MIME,
    "Only PDF files are accepted",
  );

// ---------------------------------------------------------------------------
// Schema factory
//
// Pass in the `document_types` row's relevant flags. The returned schema's
// inferred type narrows correctly per call site:
//   - required fields are typed as the value type
//   - optional fields are typed as `T | undefined` (after the transforms)
// ---------------------------------------------------------------------------

export function documentUploadSchema(flags: DocumentTypeFlags) {
  return z.object({
    file: documentFile,
    reference_number: referenceNumber(flags.capturesReferenceNumber),
    issuing_state: issuingState(flags.capturesState),
    issue_date: isoDate(false, "Issue date"),
    expiry_date: isoDate(flags.hasExpiry, "Expiry date"),
  });
}

export type DocumentUploadInput = z.infer<
  ReturnType<typeof documentUploadSchema>
>;
