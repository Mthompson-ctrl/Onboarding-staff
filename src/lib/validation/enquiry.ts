import { z } from "zod";

import { AU_STATES } from "@sentinel/shared/validation/au-states";

// Free-text role buckets shown in the enquiry dropdown. `leads.preferred_role`
// is a plain `text` column (not an enum) so HR can extend without a migration;
// we constrain at the form layer for triage consistency.
export const PREFERRED_ROLES = [
  "support_worker",
  "community_access",
  "sil",
  "multiple",
  "unsure",
] as const;

export const PREFERRED_ROLE_LABELS: Record<(typeof PREFERRED_ROLES)[number], string> = {
  support_worker: "Support worker",
  community_access: "Community access",
  sil: "Supported Independent Living (SIL)",
  multiple: "Multiple of the above",
  unsure: "Not sure yet",
};

const requiredString = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const enquirySchema = z.object({
  first_name: requiredString(100, "First name"),
  last_name: requiredString(100, "Last name"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .max(320, "Email is too long")
    .email("Enter a valid email address"),
  phone: requiredString(30, "Phone"),
  suburb: requiredString(100, "Suburb"),
  state: z.enum(AU_STATES),
  preferred_role: z.enum(PREFERRED_ROLES),
  how_heard_about_us: requiredString(500, "How you heard about us"),
  has_existing_screening: z.boolean(),
  availability_summary: z
    .string()
    .trim()
    .max(1000, "Availability must be 1000 characters or fewer")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  privacy_consent: z.boolean().refine((v) => v === true, {
    message: "You must accept the privacy notice to continue",
  }),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;
