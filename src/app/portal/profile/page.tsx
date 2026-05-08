import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAuDate } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_PREFERRED_ROLE_LABELS,
  RTW_STATUS_LABELS,
} from "@/lib/validation/profile";

export const metadata = {
  title: "Your profile — Sentinel HR",
};

const RTW_LOCKED_STATUSES = new Set([
  "documents_in_progress",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
]);

const STATE_LABELS: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

function NotProvided() {
  return (
    <span className="italic text-muted-foreground">Not yet provided</span>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function textOrEmpty(v: string | null | undefined) {
  return v && v.length > 0 ? v : <NotProvided />;
}

function booleanDisplay(v: boolean | null | undefined) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return <NotProvided />;
}

function dateDisplay(v: string | null | undefined) {
  if (!v) return <NotProvided />;
  return formatAuDate(v);
}

function arrayDisplay(
  v: string[] | null | undefined,
  labelLookup?: Record<string, string>,
) {
  if (!v || v.length === 0) return <NotProvided />;
  const labelled = labelLookup ? v.map((x) => labelLookup[x] ?? x) : v;
  return labelled.join(", ");
}

function LockedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Lock className="h-3 w-3" aria-hidden />
      Locked
    </span>
  );
}

export default async function ProfilePage() {
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
    console.error("profile: candidate lookup failed", { error });
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-navy">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load your profile. Please try refreshing the page.
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

  const rtwLocked = RTW_LOCKED_STATUSES.has(candidate.status);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Your profile</h1>
          <p className="text-sm text-muted-foreground">
            Review the details we have for you. You can edit most fields below.
          </p>
        </div>
        <Button asChild className="bg-navy hover:bg-navy/90">
          <Link href="/portal/profile/edit">Edit profile</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Personal</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Email">
              <div className="flex flex-col gap-0.5">
                <span>{candidate.email}</span>
                <span className="text-xs text-muted-foreground">
                  This email is linked to your account. Contact your HR admin
                  if you need it updated.
                </span>
              </div>
            </FieldRow>
            <FieldRow label="First name">
              {textOrEmpty(candidate.first_name)}
            </FieldRow>
            <FieldRow label="Last name">
              {textOrEmpty(candidate.last_name)}
            </FieldRow>
            <FieldRow label="Preferred name">
              {textOrEmpty(candidate.preferred_name)}
            </FieldRow>
            <FieldRow label="Pronouns">
              {textOrEmpty(candidate.pronouns)}
            </FieldRow>
            <FieldRow label="Date of birth">
              <div className="flex flex-col gap-0.5">
                <span>{dateDisplay(candidate.date_of_birth)}</span>
                {candidate.date_of_birth ? (
                  <span className="text-xs text-muted-foreground">
                    Date of birth is permanent once entered. Contact your HR
                    admin if this needs correction.
                  </span>
                ) : null}
              </div>
            </FieldRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Address & phone</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Phone">{textOrEmpty(candidate.phone)}</FieldRow>
            <FieldRow label="Address line 1">
              {textOrEmpty(candidate.address_line1)}
            </FieldRow>
            <FieldRow label="Address line 2">
              {textOrEmpty(candidate.address_line2)}
            </FieldRow>
            <FieldRow label="Suburb">
              {textOrEmpty(candidate.suburb)}
            </FieldRow>
            <FieldRow label="State">
              {candidate.state
                ? (STATE_LABELS[candidate.state] ?? candidate.state)
                : <NotProvided />}
            </FieldRow>
            <FieldRow label="Postcode">
              {textOrEmpty(candidate.postcode)}
            </FieldRow>
            <FieldRow label="Country">
              {textOrEmpty(candidate.country)}
            </FieldRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Emergency contact</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Name">
              {textOrEmpty(candidate.emergency_contact_name)}
            </FieldRow>
            <FieldRow label="Phone">
              {textOrEmpty(candidate.emergency_contact_phone)}
            </FieldRow>
            <FieldRow label="Relationship">
              {textOrEmpty(candidate.emergency_contact_relationship)}
            </FieldRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base text-navy">Right to work</CardTitle>
          {rtwLocked ? <LockedPill /> : null}
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Status">
              {candidate.rtw_status
                ? RTW_STATUS_LABELS[
                    candidate.rtw_status as keyof typeof RTW_STATUS_LABELS
                  ]
                : <NotProvided />}
            </FieldRow>
            {candidate.visa_subclass ? (
              <FieldRow label="Visa subclass">
                {candidate.visa_subclass}
              </FieldRow>
            ) : null}
            {candidate.visa_expiry ? (
              <FieldRow label="Visa expiry">
                {dateDisplay(candidate.visa_expiry)}
              </FieldRow>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">
            Skills & availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <FieldRow label="Preferred roles">
              {arrayDisplay(
                candidate.preferred_roles,
                PROFILE_PREFERRED_ROLE_LABELS,
              )}
            </FieldRow>
            <FieldRow label="Languages spoken">
              {arrayDisplay(candidate.languages_spoken)}
            </FieldRow>
            <FieldRow label="Driver's licence">
              {booleanDisplay(candidate.has_drivers_licence)}
            </FieldRow>
            <FieldRow label="Own vehicle">
              {booleanDisplay(candidate.has_own_vehicle)}
            </FieldRow>
            <FieldRow label="Availability">
              <span className="italic text-muted-foreground">Not yet set up</span>
            </FieldRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription className="text-xs">
            Some fields are managed by your HR team and aren&apos;t shown here.
            If something looks wrong, get in touch.
          </CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}
