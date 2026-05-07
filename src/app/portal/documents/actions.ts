"use server";

// =============================================================================
// Document upload — server action.
//
// M4 ships this as a stub: it returns a generic "not wired up" error so the
// form can be tested for rendering, conditional-field logic, useActionState
// plumbing, useFormStatus loading state, and dialog behaviour BEFORE real
// Storage uploads go live in M5.
//
// The signature here is the contract the dialog client component depends on:
//   - reducer-shaped: (prev, formData) => Promise<UploadDocumentState>
//   - returns `{ ok: true }` on success — the dialog client reacts to `ok`
//     by calling setOpen(false) + router.refresh(). We deliberately do NOT
//     redirect() from here: redirect() throws NEXT_REDIRECT, which bypasses
//     any setOpen(false) the client queued after `await`. That's the bug we
//     decided to avoid in the close-after-success choreography (CLAUDE.md).
//   - returns `{ error }` for generic failures (e.g. infra down)
//   - returns `{ fieldErrors }` for per-field validation failures (M5 will
//     populate these via documentUploadSchema(flags).safeParse)
//
// M5 fills this in: auth → candidate lookup → flags-driven schema parse →
// Storage upload (5 MB ceiling, PDF only) → documents-table insert →
// best-effort orphan-blob cleanup on DB-insert failure → return { ok: true }.
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

export async function uploadDocument(
  _prev: UploadDocumentState,
  formData: FormData,
): Promise<UploadDocumentState> {
  // Touch formData so lint sees the param as used; replaced wholesale in M5.
  void formData;
  return {
    error: "Upload isn't wired up yet — coming shortly.",
  };
}
