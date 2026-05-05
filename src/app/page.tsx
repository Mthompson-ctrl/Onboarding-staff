import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <section className="flex flex-col items-center justify-center py-20 text-center">
      <p className="mb-4 text-xs font-medium uppercase tracking-widest text-teal">
        Built by NDIS providers, for NDIS providers
      </p>
      <h1 className="mb-6 text-5xl font-semibold tracking-tight text-navy md:text-6xl">
        Sentinel HR
      </h1>
      <p className="mb-10 max-w-2xl text-lg text-muted-foreground">
        HRMS for disability and community support services. Compliance-first
        onboarding for support workers — NDIS Worker Screening, WWCC, First Aid,
        and qualifications, all tracked, verified, and audit-ready from day one.
      </p>
      <Button asChild size="lg">
        <Link href="/enquire">Begin enquiry</Link>
      </Button>
    </section>
  );
}
