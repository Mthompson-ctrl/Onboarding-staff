// Australian state/territory codes — must match the `au_state` Postgres
// domain in `supabase/migrations/20260505000001_initial_schema.sql`. Mirror
// any change to the domain here.
//
// Lives in @sentinel/shared because it is consumed by both the candidate
// profile (web + mobile) and the public enquiry form (web only). The
// per-state human labels (e.g. "New South Wales") stay in their respective
// app(s) since the lead form and the candidate profile have phrased them
// differently in the past.
export const AU_STATES = [
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
] as const;

export type AuState = (typeof AU_STATES)[number];
