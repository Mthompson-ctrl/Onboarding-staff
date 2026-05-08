// =============================================================================
// Date formatting helpers.
//
// `formatAuDate` renders an ISO date ("YYYY-MM-DD") as a long-form
// Australian date ("10 August 1995"). Used wherever the candidate sees
// a date — read-mode profile, locked DOB block in edit mode, etc. —
// so the two views never drift apart.
//
// Input is expected to be a calendar date (no time component). Adding
// "T00:00:00" anchors it to local midnight so the toLocaleDateString
// call doesn't shift the day across the timezone boundary.
// =============================================================================

export function formatAuDate(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
