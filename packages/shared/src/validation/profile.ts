import { z } from "zod";

import { AU_STATES } from "./au-states";

// v1 ships a single role intentionally — `support_worker` is the dominant
// role for our pilot. The schema stays `text[]` at the DB level so future
// expansion is non-breaking: appending values to this const lights up new
// checkboxes in the profile UI without a migration. Rationale documented
// in CLAUDE.md.
export const PROFILE_PREFERRED_ROLES = ["support_worker"] as const;

export const PROFILE_PREFERRED_ROLE_LABELS: Record<
  (typeof PROFILE_PREFERRED_ROLES)[number],
  string
> = {
  support_worker: "Support worker",
};

// Mirrors the `rtw_status` Postgres enum in
// supabase/migrations/20260505000001_initial_schema.sql.
export const RTW_STATUSES = [
  "citizen",
  "permanent_resident",
  "temporary_visa",
  "other",
] as const;

export const RTW_STATUS_LABELS: Record<(typeof RTW_STATUSES)[number], string> = {
  citizen: "Australian citizen",
  permanent_resident: "Permanent resident",
  temporary_visa: "Temporary visa holder",
  other: "Other",
};

const requiredString = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

// HTML <input type="date"> emits "YYYY-MM-DD"; treat empty as cleared.
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .optional()
  .or(z.literal(""))
  .transform((v) => (typeof v === "string" && v.length > 0 ? v : undefined));

// Tri-state boolean: "yes" → true, "no" → false, "" → undefined (means
// "not specified", which the server action maps to NULL in the DB).
const triBoolean = z
  .enum(["yes", "no", ""])
  .optional()
  .transform((v): boolean | undefined => {
    if (v === "yes") return true;
    if (v === "no") return false;
    return undefined;
  });

// AU postcode — 4 digits, kept as text to preserve leading zeros.
const postcode = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Enter a valid 4-digit postcode")
  .optional()
  .or(z.literal(""))
  .transform((v) => (typeof v === "string" && v.length > 0 ? v : undefined));

// `date_of_birth` and the RTW fields appear in this schema as optional
// because the server action gates them by lock state BEFORE parsing. If a
// field is locked, the action strips it from the payload entirely; if it's
// unlocked, the action preserves it and zod validates it.
export const profileEditSchema = z.object({
  first_name: requiredString(100, "First name"),
  last_name: requiredString(100, "Last name"),
  preferred_name: optionalText(100, "Preferred name"),
  pronouns: optionalText(50, "Pronouns"),

  date_of_birth: isoDate,

  phone: optionalText(30, "Phone"),

  address_line1: optionalText(200, "Address line 1"),
  address_line2: optionalText(200, "Address line 2"),
  suburb: optionalText(100, "Suburb"),
  state: z.enum(AU_STATES).optional().or(z.literal("")).transform((v) =>
    typeof v === "string" && v.length > 0 ? (v as (typeof AU_STATES)[number]) : undefined,
  ),
  postcode: postcode,
  country: optionalText(2, "Country code"),

  emergency_contact_name: optionalText(100, "Emergency contact name"),
  emergency_contact_phone: optionalText(30, "Emergency contact phone"),
  emergency_contact_relationship: optionalText(50, "Emergency contact relationship"),

  rtw_status: z
    .enum(RTW_STATUSES)
    .optional()
    .or(z.literal(""))
    .transform((v) =>
      typeof v === "string" && v.length > 0
        ? (v as (typeof RTW_STATUSES)[number])
        : undefined,
    ),
  visa_subclass: optionalText(20, "Visa subclass"),
  visa_expiry: isoDate,

  // The action passes an already-split array here, NOT the raw form value.
  preferred_roles: z.array(z.enum(PROFILE_PREFERRED_ROLES)).optional(),

  // Same — action splits the comma-separated input before this sees it.
  languages_spoken: z.array(z.string().trim().min(1)).max(20).optional(),

  has_drivers_licence: triBoolean,
  has_own_vehicle: triBoolean,
});

export type ProfileEditInput = z.infer<typeof profileEditSchema>;
