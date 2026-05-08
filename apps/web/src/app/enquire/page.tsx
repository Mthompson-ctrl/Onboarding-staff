import type { Metadata } from "next";

import { EnquiryForm } from "./enquiry-form";

export const metadata: Metadata = {
  title: "Begin enquiry — Sentinel HR",
  description:
    "A few details to get the conversation started about support work opportunities.",
};

export default function EnquirePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-10">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-teal">
          Support worker enquiry
        </p>
        <h1 className="mb-4 text-4xl font-semibold tracking-tight text-navy">
          Tell us about yourself
        </h1>
        <p className="text-base text-muted-foreground">
          A few details to get the conversation started. We respond to enquiries
          within two business days.
        </p>
      </header>
      <EnquiryForm />
    </div>
  );
}
