"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PROFILE_PREFERRED_ROLES,
  PROFILE_PREFERRED_ROLE_LABELS,
  RTW_STATUSES,
  RTW_STATUS_LABELS,
} from "@/lib/validation/profile";
import { AU_STATES } from "@/lib/validation/enquiry";

import { updateProfile, type UpdateProfileState } from "./actions";

const initialState: UpdateProfileState = {};

export type ProfileFormInitial = {
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  pronouns: string | null;
  date_of_birth: string | null;
  email: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  rtw_status: string | null;
  visa_subclass: string | null;
  visa_expiry: string | null;
  preferred_roles: string[] | null;
  languages_spoken: string[] | null;
  has_drivers_licence: boolean | null;
  has_own_vehicle: boolean | null;
};

export type ProfileFormProps = {
  initial: ProfileFormInitial;
  dobLocked: boolean;
  rtwLocked: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
    </Label>
  );
}

function triBoolValue(v: boolean | null) {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-navy hover:bg-navy/90"
    >
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function ProfileForm({ initial, dobLocked, rtwLocked }: ProfileFormProps) {
  const [state, formAction] = useActionState(updateProfile, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);

  const handleCancel = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (dirty && !window.confirm("Discard your changes?")) {
      e.preventDefault();
    }
  };

  const errs = state.fieldErrors ?? {};

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={() => {
        if (!dirty) setDirty(true);
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Personal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              value={initial.email}
              disabled
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              This email is linked to your account. Contact your HR admin if
              you need it updated.
            </p>
          </div>

          <div>
            <FieldLabel htmlFor="first_name">First name</FieldLabel>
            <Input
              id="first_name"
              name="first_name"
              defaultValue={initial.first_name}
              required
              className="mt-1"
              aria-invalid={errs.first_name ? true : undefined}
            />
            <FieldError message={errs.first_name} />
          </div>

          <div>
            <FieldLabel htmlFor="last_name">Last name</FieldLabel>
            <Input
              id="last_name"
              name="last_name"
              defaultValue={initial.last_name}
              required
              className="mt-1"
              aria-invalid={errs.last_name ? true : undefined}
            />
            <FieldError message={errs.last_name} />
          </div>

          <div>
            <FieldLabel htmlFor="preferred_name">Preferred name</FieldLabel>
            <Input
              id="preferred_name"
              name="preferred_name"
              defaultValue={initial.preferred_name ?? ""}
              className="mt-1"
            />
            <FieldError message={errs.preferred_name} />
          </div>

          <div>
            <FieldLabel htmlFor="pronouns">Pronouns</FieldLabel>
            <Input
              id="pronouns"
              name="pronouns"
              defaultValue={initial.pronouns ?? ""}
              placeholder="e.g. she/her, they/them"
              className="mt-1"
            />
            <FieldError message={errs.pronouns} />
          </div>

          <div>
            <FieldLabel htmlFor="date_of_birth">Date of birth</FieldLabel>
            {dobLocked ? (
              <div className="mt-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Lock className="h-3 w-3" aria-hidden />
                  <span>{initial.date_of_birth}</span>
                  <span className="text-xs text-muted-foreground">Locked</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Date of birth is permanent once entered. Contact your HR
                  admin if this needs correction.
                </p>
              </div>
            ) : (
              <>
                <Input
                  id="date_of_birth"
                  name="date_of_birth"
                  type="date"
                  defaultValue={initial.date_of_birth ?? ""}
                  className="mt-1"
                  aria-invalid={errs.date_of_birth ? true : undefined}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Date of birth is permanent once entered — please double-check
                  before saving.
                </p>
                <FieldError message={errs.date_of_birth} />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">Address & phone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={initial.phone ?? ""}
              className="mt-1"
            />
            <FieldError message={errs.phone} />
          </div>

          <div>
            <FieldLabel htmlFor="address_line1">Address line 1</FieldLabel>
            <Input
              id="address_line1"
              name="address_line1"
              defaultValue={initial.address_line1 ?? ""}
              className="mt-1"
            />
            <FieldError message={errs.address_line1} />
          </div>

          <div>
            <FieldLabel htmlFor="address_line2">Address line 2</FieldLabel>
            <Input
              id="address_line2"
              name="address_line2"
              defaultValue={initial.address_line2 ?? ""}
              className="mt-1"
            />
            <FieldError message={errs.address_line2} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="suburb">Suburb</FieldLabel>
              <Input
                id="suburb"
                name="suburb"
                defaultValue={initial.suburb ?? ""}
                className="mt-1"
              />
              <FieldError message={errs.suburb} />
            </div>
            <div>
              <FieldLabel htmlFor="state">State</FieldLabel>
              <select
                id="state"
                name="state"
                defaultValue={initial.state ?? ""}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">—</option>
                {AU_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <FieldError message={errs.state} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="postcode">Postcode</FieldLabel>
              <Input
                id="postcode"
                name="postcode"
                inputMode="numeric"
                defaultValue={initial.postcode ?? ""}
                className="mt-1"
                aria-invalid={errs.postcode ? true : undefined}
              />
              <FieldError message={errs.postcode} />
            </div>
            <div>
              <FieldLabel htmlFor="country">Country</FieldLabel>
              <Input
                id="country"
                name="country"
                defaultValue={initial.country ?? "AU"}
                maxLength={2}
                className="mt-1"
              />
              <FieldError message={errs.country} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">
            Emergency contact
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <FieldLabel htmlFor="emergency_contact_name">Name</FieldLabel>
            <Input
              id="emergency_contact_name"
              name="emergency_contact_name"
              defaultValue={initial.emergency_contact_name ?? ""}
              className="mt-1"
            />
            <FieldError message={errs.emergency_contact_name} />
          </div>
          <div>
            <FieldLabel htmlFor="emergency_contact_phone">Phone</FieldLabel>
            <Input
              id="emergency_contact_phone"
              name="emergency_contact_phone"
              type="tel"
              defaultValue={initial.emergency_contact_phone ?? ""}
              className="mt-1"
            />
            <FieldError message={errs.emergency_contact_phone} />
          </div>
          <div>
            <FieldLabel htmlFor="emergency_contact_relationship">
              Relationship
            </FieldLabel>
            <Input
              id="emergency_contact_relationship"
              name="emergency_contact_relationship"
              defaultValue={initial.emergency_contact_relationship ?? ""}
              placeholder="e.g. parent, partner, friend"
              className="mt-1"
            />
            <FieldError message={errs.emergency_contact_relationship} />
          </div>
        </CardContent>
      </Card>

      {rtwLocked ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-navy">Right to work</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Right-to-work details lock once your profile is submitted. Please
              enter accurately.
            </p>

            <div>
              <FieldLabel htmlFor="rtw_status">Status</FieldLabel>
              <select
                id="rtw_status"
                name="rtw_status"
                defaultValue={initial.rtw_status ?? ""}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">—</option>
                {RTW_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {RTW_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <FieldError message={errs.rtw_status} />
            </div>

            <div>
              <FieldLabel htmlFor="visa_subclass">Visa subclass</FieldLabel>
              <Input
                id="visa_subclass"
                name="visa_subclass"
                defaultValue={initial.visa_subclass ?? ""}
                placeholder="e.g. 482, 500"
                className="mt-1"
              />
              <FieldError message={errs.visa_subclass} />
            </div>

            <div>
              <FieldLabel htmlFor="visa_expiry">Visa expiry</FieldLabel>
              <Input
                id="visa_expiry"
                name="visa_expiry"
                type="date"
                defaultValue={initial.visa_expiry ?? ""}
                className="mt-1"
              />
              <FieldError message={errs.visa_expiry} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-navy">
            Skills & availability
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <FieldLabel htmlFor="preferred_roles_first">
              Preferred roles
            </FieldLabel>
            <div className="mt-2 flex flex-col gap-2">
              {PROFILE_PREFERRED_ROLES.map((role, i) => {
                const id = i === 0 ? "preferred_roles_first" : `preferred_roles_${role}`;
                const checked = initial.preferred_roles?.includes(role) ?? false;
                return (
                  <label
                    key={role}
                    htmlFor={id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={id}
                      name="preferred_roles"
                      value={role}
                      defaultChecked={checked}
                    />
                    {PROFILE_PREFERRED_ROLE_LABELS[role]}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="languages_spoken">
              Languages spoken
            </FieldLabel>
            <Input
              id="languages_spoken"
              name="languages_spoken"
              defaultValue={(initial.languages_spoken ?? []).join(", ")}
              placeholder="Separate with commas, e.g. English, Mandarin"
              className="mt-1"
            />
            <FieldError message={errs.languages_spoken} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="has_drivers_licence">
                Driver&apos;s licence
              </FieldLabel>
              <select
                id="has_drivers_licence"
                name="has_drivers_licence"
                defaultValue={triBoolValue(initial.has_drivers_licence)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Not specified</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="has_own_vehicle">Own vehicle</FieldLabel>
              <select
                id="has_own_vehicle"
                name="has_own_vehicle"
                defaultValue={triBoolValue(initial.has_own_vehicle)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Not specified</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="availability_placeholder">
              Availability
            </FieldLabel>
            <div
              id="availability_placeholder"
              className="mt-1 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
            >
              Availability scheduling coming soon. We&apos;ll be in touch
              directly to set this up.
            </div>
          </div>
        </CardContent>
      </Card>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button asChild variant="outline">
          <Link href="/portal/profile" onClick={handleCancel}>
            Cancel
          </Link>
        </Button>
        <SaveButton />
      </div>
    </form>
  );
}
