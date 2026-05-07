import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-navy">
          Hello, {candidate.first_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as {user.email}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-navy">Your profile</CardTitle>
            <CardDescription className="text-xs">
              Personal details, contact information, and right-to-work status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="bg-navy hover:bg-navy/90">
              <Link href="/portal/profile">Open profile</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-navy">Your documents</CardTitle>
            <CardDescription className="text-xs">
              Upload the clearances, certificates, and qualifications your
              provider needs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="bg-navy hover:bg-navy/90">
              <Link href="/portal/documents">Open documents</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
