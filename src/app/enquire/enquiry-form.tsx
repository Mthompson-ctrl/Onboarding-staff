"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AU_STATES,
  PREFERRED_ROLES,
  PREFERRED_ROLE_LABELS,
  enquirySchema,
} from "@/lib/validation/enquiry";

type AuState = (typeof AU_STATES)[number];
type PreferredRole = (typeof PREFERRED_ROLES)[number];

type Fields = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  suburb: string;
  state: "" | AuState;
  preferred_role: "" | PreferredRole;
  how_heard_about_us: string;
  has_existing_screening: boolean;
  availability_summary: string;
  privacy_consent: boolean;
  // Honeypot — bots fill this; real users never see it.
  company_website: string;
};

type FieldErrors = Partial<Record<keyof Fields, string>>;

const INITIAL_FIELDS: Fields = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  suburb: "",
  state: "",
  preferred_role: "",
  how_heard_about_us: "",
  has_existing_screening: false,
  availability_summary: "",
  privacy_consent: false,
  company_website: "",
};

const NETWORK_ERROR =
  "We couldn't reach our servers. Please check your connection and try again.";
const GENERIC_ERROR =
  "We couldn't submit your enquiry. Please try again, or email us if the problem persists.";

export function EnquiryForm() {
  const [fields, setFields] = useState<Fields>(INITIAL_FIELDS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  function setField<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    // Clear field-level error as soon as the user edits the field.
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGeneralError(null);
    setErrors({});

    // Client-side validation runs the same schema the server uses. Server
    // remains authoritative; this is purely for fast UX feedback.
    const result = enquirySchema.safeParse({
      first_name: fields.first_name,
      last_name: fields.last_name,
      email: fields.email,
      phone: fields.phone,
      suburb: fields.suburb,
      state: fields.state || undefined,
      preferred_role: fields.preferred_role || undefined,
      how_heard_about_us: fields.how_heard_about_us,
      has_existing_screening: fields.has_existing_screening,
      availability_summary: fields.availability_summary,
      privacy_consent: fields.privacy_consent,
    });

    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof Fields | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...result.data,
          company_website: fields.company_website,
        }),
      });

      if (res.ok) {
        setIsSuccess(true);
        return;
      }

      const payload = (await res.json().catch(() => null)) as
        | { errors?: Record<string, string>; error?: string }
        | null;

      if (res.status === 400 && payload?.errors) {
        setErrors(payload.errors as FieldErrors);
        return;
      }

      setGeneralError(payload?.error ?? GENERIC_ERROR);
    } catch {
      setGeneralError(NETWORK_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-teal">
            Enquiry received
          </p>
          <h2 className="mb-3 text-2xl font-semibold text-navy">
            Thank you for getting in touch
          </h2>
          <p className="mx-auto mb-6 max-w-md text-muted-foreground">
            We respond to enquiries within two business days.
          </p>
          <Link
            href="/"
            className="text-sm font-medium text-teal hover:underline"
          >
            Return to home
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-8">
        <form noValidate onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="first_name" label="First name" error={errors.first_name}>
              <Input
                id="first_name"
                value={fields.first_name}
                onChange={(e) => setField("first_name", e.target.value)}
                autoComplete="given-name"
                required
                aria-invalid={!!errors.first_name}
                aria-describedby={
                  errors.first_name ? "first_name-error" : undefined
                }
              />
            </Field>
            <Field id="last_name" label="Last name" error={errors.last_name}>
              <Input
                id="last_name"
                value={fields.last_name}
                onChange={(e) => setField("last_name", e.target.value)}
                autoComplete="family-name"
                required
                aria-invalid={!!errors.last_name}
                aria-describedby={
                  errors.last_name ? "last_name-error" : undefined
                }
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="email" label="Email" error={errors.email}>
              <Input
                id="email"
                type="email"
                value={fields.email}
                onChange={(e) => setField("email", e.target.value)}
                autoComplete="email"
                required
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
            </Field>
            <Field id="phone" label="Phone" error={errors.phone}>
              <Input
                id="phone"
                type="tel"
                value={fields.phone}
                onChange={(e) => setField("phone", e.target.value)}
                autoComplete="tel"
                required
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? "phone-error" : undefined}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field id="suburb" label="Suburb" error={errors.suburb}>
              <Input
                id="suburb"
                value={fields.suburb}
                onChange={(e) => setField("suburb", e.target.value)}
                autoComplete="address-level2"
                required
                aria-invalid={!!errors.suburb}
                aria-describedby={errors.suburb ? "suburb-error" : undefined}
              />
            </Field>
            <Field id="state" label="State" error={errors.state}>
              <Select
                value={fields.state}
                onValueChange={(v) => setField("state", v as AuState)}
              >
                <SelectTrigger
                  id="state"
                  aria-invalid={!!errors.state}
                  aria-describedby={errors.state ? "state-error" : undefined}
                >
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {AU_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            id="preferred_role"
            label="What kind of role are you interested in?"
            error={errors.preferred_role}
          >
            <Select
              value={fields.preferred_role}
              onValueChange={(v) => setField("preferred_role", v as PreferredRole)}
            >
              <SelectTrigger
                id="preferred_role"
                aria-invalid={!!errors.preferred_role}
                aria-describedby={
                  errors.preferred_role ? "preferred_role-error" : undefined
                }
              >
                <SelectValue placeholder="Select an option…" />
              </SelectTrigger>
              <SelectContent>
                {PREFERRED_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {PREFERRED_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            id="how_heard_about_us"
            label="How did you hear about us?"
            error={errors.how_heard_about_us}
          >
            <Input
              id="how_heard_about_us"
              value={fields.how_heard_about_us}
              onChange={(e) => setField("how_heard_about_us", e.target.value)}
              required
              aria-invalid={!!errors.how_heard_about_us}
              aria-describedby={
                errors.how_heard_about_us
                  ? "how_heard_about_us-error"
                  : undefined
              }
            />
          </Field>

          <div className="flex items-start gap-3">
            <Checkbox
              id="has_existing_screening"
              checked={fields.has_existing_screening}
              onCheckedChange={(v) =>
                setField("has_existing_screening", v === true)
              }
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label
                htmlFor="has_existing_screening"
                className="font-normal leading-snug"
              >
                I already hold an NDIS Worker Screening Clearance.
              </Label>
              <p className="text-xs text-muted-foreground">
                If unsure, leave unticked. We&rsquo;ll guide you through the
                process.
              </p>
            </div>
          </div>

          <Field
            id="availability_summary"
            label="Availability"
            error={errors.availability_summary}
            optional
          >
            <Textarea
              id="availability_summary"
              value={fields.availability_summary}
              onChange={(e) => setField("availability_summary", e.target.value)}
              rows={3}
              placeholder="e.g. Mon–Fri days, no weekends"
              aria-invalid={!!errors.availability_summary}
              aria-describedby={
                errors.availability_summary
                  ? "availability_summary-error"
                  : undefined
              }
            />
          </Field>

          {/* Honeypot — visually hidden, kept out of tab order, screen-reader skipped. */}
          <div aria-hidden="true" className="sr-only">
            <Label htmlFor="company_website">Leave this blank</Label>
            <Input
              id="company_website"
              name="company_website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={fields.company_website}
              onChange={(e) => setField("company_website", e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="privacy_consent"
              checked={fields.privacy_consent}
              onCheckedChange={(v) => setField("privacy_consent", v === true)}
              className="mt-0.5"
              aria-invalid={!!errors.privacy_consent}
              aria-describedby={
                errors.privacy_consent ? "privacy_consent-error" : undefined
              }
            />
            <div className="space-y-1">
              <Label
                htmlFor="privacy_consent"
                className="font-normal leading-snug"
              >
                I consent to my information being collected and used in
                accordance with the{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="font-medium text-teal underline-offset-2 hover:underline"
                >
                  privacy notice
                </Link>
                .
              </Label>
              {errors.privacy_consent && (
                <p
                  id="privacy_consent-error"
                  className="text-sm text-destructive"
                >
                  {errors.privacy_consent}
                </p>
              )}
            </div>
          </div>

          {generalError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {generalError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : "Submit enquiry"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            (optional)
          </span>
        )}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
