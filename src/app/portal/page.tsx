import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Portal — Sentinel HR",
};

export default async function PortalIndexPage() {
  const supabase = await createClient();

  // Middleware will already have redirected unauthenticated requests, but
  // re-check so this page never renders for a null user (defence in depth
  // and keeps TypeScript happy when narrowing user.id below).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS on `candidates` allows self-read via is_candidate_self(user_id), so
  // this query returns at most one row — the logged-in candidate's. HR-admin
  // auth users without a candidates row will hit the unlinked branch below.
  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("first_name")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("portal: candidate lookup failed", { error });
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
        <p className="text-xs text-muted-foreground">
          Signed in as {user.email}.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-navy">
        Hello, {candidate.first_name}
      </h1>
      <p className="text-sm text-muted-foreground">
        You&apos;re signed in as {user.email}.
      </p>
    </section>
  );
}
