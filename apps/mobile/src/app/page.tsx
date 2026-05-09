"use client";

import { useEffect, useState } from "react";
import { formatAuDate } from "@sentinel/shared/date";

// Phase Mobile M2.3 — Hello-candidate placeholder.
//
// Deliberately a client component: in the static export the HTML is just
// a shell that Capacitor copies into the native WebView; the actual
// Sentinel HR runtime is the JavaScript bundle that hydrates inside the
// WebView. Computing the date in a Server Component would bake a
// build-time string into the HTML and prove nothing about whether the
// shipped JS bundle resolved @sentinel/shared. By calling formatAuDate
// in useEffect we exercise the bundled client code — a wiring break
// would surface as the date never appearing.
//
// Replace with the real candidate landing page in a later phase.
export default function Home() {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    const iso = new Date().toISOString().slice(0, 10);
    setToday(formatAuDate(iso));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 text-center text-white">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal">
        Sentinel HR
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Welcome, candidate
      </h1>
      <p className="mt-6 text-sm text-white/70">
        {today ? `Today is ${today}.` : "Loading…"}
      </p>
    </main>
  );
}
