// =============================================================================
// POST /api/enquiries — public lead intake
//
// Security model
// ──────────────
// This route is the lockdown point for public lead submissions. `leads`
// has no anonymous RLS policy by design (any such policy would either be
// permissive enough to be meaningless, or block legitimate submissions).
// Instead, we use the Supabase service-role client — which bypasses RLS
// entirely — and enforce all access control HERE:
//
//   1. Server-side input validation via the shared zod schema. The client
//      runs the same schema for UX, but server validation is authoritative.
//   2. Honeypot check before any DB call. Bots that fill the hidden
//      `company_website` field get a 200 with the standard success shape;
//      no row written, no audit trail. Triggers are logged (without PII)
//      so we can spot patterns.
//   3. Organisation is pinned via `DEFAULT_ORGANISATION_SLUG` env (default
//      `social-plus`); clients cannot target a different tenant.
//   4. Form-shape field names (`state`, `how_heard_about_us`) map to DB
//      column names (`preferred_state`, `source`) here, so changes on
//      either side don't ripple.
//
// Errors return generic messages to the client; details go to server
// logs. Don't leak whether a slug exists or which column rejected a row.
// =============================================================================

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { enquirySchema } from "@/lib/validation/enquiry";

const HONEYPOT_FIELD = "company_website";
const GENERIC_ERROR =
  "We couldn't submit your enquiry. Please try again, or email us if the problem persists.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  // Honeypot — checked before validation so bot submissions never reach
  // the DB and never produce field-error responses bots could learn from.
  const honeypot = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    console.warn("honeypot_triggered", {
      timestamp: Date.now(),
      userAgent: request.headers.get("user-agent") ?? undefined,
      honeypotValue: honeypot.slice(0, 50),
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !(key in fieldErrors)) {
        fieldErrors[key] = issue.message;
      }
    }
    return NextResponse.json({ ok: false, errors: fieldErrors }, { status: 400 });
  }
  const data = parsed.data;

  const orgSlug = process.env.DEFAULT_ORGANISATION_SLUG ?? "social-plus";
  const supabase = createAdminClient();

  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (orgError) {
    console.error("enquiry: organisation lookup failed", {
      slug: orgSlug,
      error: orgError,
    });
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }
  if (!org) {
    console.error("enquiry: organisation not found", { slug: orgSlug });
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }

  // Status defaults to 'new' at the DB level — don't set it here.
  const { error: insertError } = await supabase.from("leads").insert({
    organisation_id: org.id,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    phone: data.phone,
    suburb: data.suburb,
    preferred_state: data.state,
    preferred_role: data.preferred_role,
    source: data.how_heard_about_us,
    has_existing_screening: data.has_existing_screening,
    availability_summary: data.availability_summary ?? null,
    privacy_consent_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error("enquiry: lead insert failed", { error: insertError });
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
