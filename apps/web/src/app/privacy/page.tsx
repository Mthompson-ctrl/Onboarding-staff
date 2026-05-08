import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy notice — Sentinel HR",
  description:
    "How Social Plus Support Work collects, holds, and uses information submitted via the enquiry form.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl">
      <header className="mb-8">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-teal">
          Draft — placeholder
        </p>
        <h1 className="mb-4 text-4xl font-semibold tracking-tight text-navy">
          Privacy notice
        </h1>
        <p className="text-base text-muted-foreground">
          This page is being prepared.
        </p>
      </header>

      <div className="space-y-4 text-base leading-relaxed text-foreground">
        <p>
          In the meantime, your information is collected and held by Social
          Plus Support Work and used only for the purpose of recruitment. We
          do not share your data with third parties without your consent.
        </p>
        <p>
          For questions, contact{" "}
          <a
            href="mailto:admin@socialplus.com.au"
            className="font-medium text-teal underline-offset-2 hover:underline"
          >
            admin@socialplus.com.au
          </a>
          .
        </p>
      </div>
    </article>
  );
}
