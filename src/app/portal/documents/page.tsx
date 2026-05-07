import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_ORDER,
  DOCUMENT_STATUS_LABELS,
  categoryForCode,
  type DocumentCategory,
  type DocumentStatus,
} from "@/lib/documents";

import { UploadDialog } from "./upload-dialog";

export const metadata = {
  title: "Your documents — Sentinel HR",
};

type DocumentTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  required_by_default: boolean;
  has_expiry: boolean;
  display_order: number;
};

type CurrentDocumentRow = {
  id: string;
  document_type_id: string;
  status: DocumentStatus;
  uploaded_at: string;
};

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-navy">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </section>
  );
}

function RequiredBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-navy/10 px-2 py-0.5 text-xs font-medium text-navy">
      Required
    </span>
  );
}

const STATUS_PILL_CLASSES: Record<DocumentStatus, string> = {
  pending_review: "bg-amber-100 text-amber-900",
  verified: "bg-teal/10 text-teal",
  rejected: "bg-red-100 text-red-900",
  superseded: "bg-muted text-muted-foreground",
};

function StatusPill({ status }: { status: DocumentStatus | null }) {
  if (status === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Not uploaded
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASSES[status]}`}
    >
      {DOCUMENT_STATUS_LABELS[status]}
    </span>
  );
}

function formatUploadedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function DocumentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (candidateError) {
    console.error("documents: candidate lookup failed", { error: candidateError });
    return <ErrorPanel>We couldn&apos;t load your documents. Please try refreshing the page.</ErrorPanel>;
  }

  if (!candidate) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-navy">Account not yet linked</h1>
        <p className="text-sm text-muted-foreground">
          Your account isn&apos;t linked to a candidate profile yet. Please
          contact your HR administrator.
        </p>
      </section>
    );
  }

  // System-global types only for v1. Per-org custom types are deferred.
  // RLS policy already filters to deleted_at IS NULL AND is_active = true,
  // but we restate here so it's obvious in the query (and a no-op).
  const { data: docTypes, error: docTypesError } = await supabase
    .from("document_types")
    .select(
      "id, code, name, description, required_by_default, has_expiry, display_order",
    )
    .is("organisation_id", null)
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .returns<DocumentTypeRow[]>();

  if (docTypesError || !docTypes) {
    console.error("documents: doc types lookup failed", { error: docTypesError });
    return <ErrorPanel>We couldn&apos;t load your documents. Please try refreshing the page.</ErrorPanel>;
  }

  // Candidate's current (non-superseded) documents. The unique partial index
  // `documents_one_current_per_type` guarantees at most one row per type.
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, document_type_id, status, uploaded_at")
    .eq("candidate_id", candidate.id)
    .is("deleted_at", null)
    .neq("status", "superseded")
    .returns<CurrentDocumentRow[]>();

  if (docsError || !docs) {
    console.error("documents: docs lookup failed", { error: docsError });
    return <ErrorPanel>We couldn&apos;t load your documents. Please try refreshing the page.</ErrorPanel>;
  }

  const docByType = new Map<string, CurrentDocumentRow>();
  for (const d of docs) docByType.set(d.document_type_id, d);

  // % complete = verified required ÷ total required. Optional types don't
  // contribute. Pending / rejected required types count as not-yet-complete.
  const requiredTypes = docTypes.filter((t) => t.required_by_default);
  const totalRequired = requiredTypes.length;
  const verifiedRequired = requiredTypes.filter(
    (t) => docByType.get(t.id)?.status === "verified",
  ).length;
  const pctComplete =
    totalRequired === 0 ? 0 : Math.round((verifiedRequired / totalRequired) * 100);

  const grouped = new Map<DocumentCategory, DocumentTypeRow[]>();
  for (const t of docTypes) {
    const cat = categoryForCode(t.code);
    const list = grouped.get(cat) ?? [];
    list.push(t);
    grouped.set(cat, list);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Your documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload the documents your provider needs to clear you for work.
            We&apos;ll verify each one and let you know if anything needs
            adjusting.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Required documents verified
          </span>
          <span className="text-xl font-semibold text-navy">
            {verifiedRequired}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              of {totalRequired} ({pctComplete}%)
            </span>
          </span>
        </div>
      </div>

      {DOCUMENT_CATEGORY_ORDER.map((cat) => {
        const types = grouped.get(cat) ?? [];
        if (types.length === 0) return null;
        return (
          <Card key={cat}>
            <CardHeader>
              <CardTitle className="text-base text-navy">
                {DOCUMENT_CATEGORY_LABELS[cat]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {types.map((t) => {
                  const d = docByType.get(t.id) ?? null;
                  return (
                    <li
                      key={t.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex flex-col gap-1 sm:max-w-[60ch]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{t.name}</span>
                          {t.required_by_default ? <RequiredBadge /> : null}
                          <StatusPill status={d?.status ?? null} />
                        </div>
                        {t.description ? (
                          <p className="text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0">
                        {d ? (
                          <span className="text-xs text-muted-foreground">
                            Uploaded {formatUploadedDate(d.uploaded_at)}
                          </span>
                        ) : (
                          <UploadDialog code={t.code} name={t.name} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
