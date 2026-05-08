import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ProfileForm, type ProfileFormInitial } from "./profile-form";

export const metadata = {
  title: "Edit profile — Sentinel HR",
};

const RTW_EDITABLE_STATUSES = new Set(["invited", "profile_in_progress"]);

export default async function ProfileEditPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("profile/edit: candidate lookup failed", { error });
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-navy">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load your profile to edit. Please try refreshing.
        </p>
      </section>
    );
  }

  if (!candidate) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-navy">
          Account not yet linked
        </h1>
        <p className="text-sm text-muted-foreground">
          Your account isn&apos;t linked to a candidate profile yet. Please
          contact your HR administrator.
        </p>
      </section>
    );
  }

  const dobLocked = candidate.date_of_birth !== null;
  const rtwLocked = !RTW_EDITABLE_STATUSES.has(candidate.status);

  const initial: ProfileFormInitial = {
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    preferred_name: candidate.preferred_name,
    pronouns: candidate.pronouns,
    date_of_birth: candidate.date_of_birth,
    email: candidate.email,
    phone: candidate.phone,
    address_line1: candidate.address_line1,
    address_line2: candidate.address_line2,
    suburb: candidate.suburb,
    state: candidate.state,
    postcode: candidate.postcode,
    country: candidate.country,
    emergency_contact_name: candidate.emergency_contact_name,
    emergency_contact_phone: candidate.emergency_contact_phone,
    emergency_contact_relationship: candidate.emergency_contact_relationship,
    rtw_status: candidate.rtw_status,
    visa_subclass: candidate.visa_subclass,
    visa_expiry: candidate.visa_expiry,
    preferred_roles: candidate.preferred_roles,
    languages_spoken: candidate.languages_spoken,
    has_drivers_licence: candidate.has_drivers_licence,
    has_own_vehicle: candidate.has_own_vehicle,
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Edit profile</h1>
        <p className="text-sm text-muted-foreground">
          Update your details below. Required fields are marked.
        </p>
      </div>
      <ProfileForm
        initial={initial}
        dobLocked={dobLocked}
        rtwLocked={rtwLocked}
      />
    </section>
  );
}
