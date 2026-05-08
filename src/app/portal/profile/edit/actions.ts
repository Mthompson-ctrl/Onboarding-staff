"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  profileEditSchema,
  type ProfileEditInput,
} from "@sentinel/shared/validation/profile";

export type UpdateProfileState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof ProfileEditInput, string>>;
};

const GENERIC_SAVE_ERROR =
  "We couldn't save those changes. Please refresh and try again.";
const GENERIC_SERVER_ERROR =
  "Something went wrong. Please try again in a moment.";

const RTW_EDITABLE_STATUSES = new Set(["invited", "profile_in_progress"]);

// Convert the trimmed-string-or-undefined the schema produces into the
// payload value Supabase expects: empty/undefined → null (clear), present
// → value. The candidate_self_updatable view writes whatever we send.
function toNullable<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: candidate, error: fetchError } = await supabase
    .from("candidates")
    .select("id, status, date_of_birth")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) {
    console.error("updateProfile: candidate fetch failed", { error: fetchError });
    return { error: GENERIC_SERVER_ERROR };
  }
  if (!candidate) {
    return { error: GENERIC_SERVER_ERROR };
  }

  const dobLocked = candidate.date_of_birth !== null;
  const rtwLocked = !RTW_EDITABLE_STATUSES.has(candidate.status);

  const get = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };

  const rawLanguages = get("languages_spoken");
  const languages_spoken = rawLanguages
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const preferred_roles = formData
    .getAll("preferred_roles")
    .filter((v): v is string => typeof v === "string");

  // Build the parse payload, gating locked fields server-side. If a field
  // is locked we omit it entirely so an attempt to POST a value is silently
  // ignored (the trigger would also reject, this is belt-and-braces).
  const payload: Record<string, unknown> = {
    first_name: get("first_name"),
    last_name: get("last_name"),
    preferred_name: get("preferred_name"),
    pronouns: get("pronouns"),
    phone: get("phone"),
    address_line1: get("address_line1"),
    address_line2: get("address_line2"),
    suburb: get("suburb"),
    state: get("state"),
    postcode: get("postcode"),
    country: get("country"),
    emergency_contact_name: get("emergency_contact_name"),
    emergency_contact_phone: get("emergency_contact_phone"),
    emergency_contact_relationship: get("emergency_contact_relationship"),
    visa_subclass: rtwLocked ? undefined : get("visa_subclass"),
    visa_expiry: rtwLocked ? undefined : get("visa_expiry"),
    rtw_status: rtwLocked ? undefined : get("rtw_status"),
    date_of_birth: dobLocked ? undefined : get("date_of_birth"),
    preferred_roles,
    languages_spoken,
    has_drivers_licence: get("has_drivers_licence"),
    has_own_vehicle: get("has_own_vehicle"),
  };

  const parsed = profileEditSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: UpdateProfileState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ProfileEditInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const data = parsed.data;

  // Build the DB payload. Required strings stay strings; optional fields
  // map undefined → null (clears the value); arrays become null when empty
  // for consistency with how empty text is handled.
  const dbPayload: Record<string, unknown> = {
    first_name: data.first_name,
    last_name: data.last_name,
    preferred_name: toNullable(data.preferred_name),
    pronouns: toNullable(data.pronouns),
    phone: toNullable(data.phone),
    address_line1: toNullable(data.address_line1),
    address_line2: toNullable(data.address_line2),
    suburb: toNullable(data.suburb),
    state: toNullable(data.state),
    postcode: toNullable(data.postcode),
    country: toNullable(data.country),
    emergency_contact_name: toNullable(data.emergency_contact_name),
    emergency_contact_phone: toNullable(data.emergency_contact_phone),
    emergency_contact_relationship: toNullable(data.emergency_contact_relationship),
    preferred_roles:
      data.preferred_roles && data.preferred_roles.length > 0
        ? data.preferred_roles
        : null,
    languages_spoken:
      data.languages_spoken && data.languages_spoken.length > 0
        ? data.languages_spoken
        : null,
    has_drivers_licence: toNullable(data.has_drivers_licence),
    has_own_vehicle: toNullable(data.has_own_vehicle),
  };

  if (!dobLocked) {
    dbPayload.date_of_birth = toNullable(data.date_of_birth);
  }
  if (!rtwLocked) {
    dbPayload.rtw_status = toNullable(data.rtw_status);
    dbPayload.visa_subclass = toNullable(data.visa_subclass);
    dbPayload.visa_expiry = toNullable(data.visa_expiry);
  }

  const { error: updateError } = await supabase
    .from("candidate_self_updatable")
    .update(dbPayload)
    .eq("id", candidate.id);

  if (updateError) {
    console.error("updateProfile: update failed", {
      candidateId: candidate.id,
      error: updateError,
    });
    return { error: GENERIC_SAVE_ERROR };
  }

  // redirect() throws NEXT_REDIRECT — must be outside any try/catch.
  redirect("/portal/profile");
}
