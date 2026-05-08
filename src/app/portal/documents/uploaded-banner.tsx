"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

// =============================================================================
// Uploaded-banner — post-upload confirmation surface.
//
// Rendered by `/portal/documents/page.tsx` when the URL carries
// `?uploaded=<code>` AND the code resolves to one of the candidate's
// active doc types (page does the lookup; we just take the human name).
//
// Behaviour: stays put until dismissed or the user navigates away. No
// auto-fade — compliance flow benefits from explicit acknowledgement.
// Dismiss → router.replace('/portal/documents', { scroll: false }) drops
// the param without polluting back-button history.
//
// Accessibility: role="status" so screen readers pick up the banner when
// it appears post-navigation (not aria-live="assertive" — this isn't an
// alert, it's a confirmation).
// =============================================================================

type UploadedBannerProps = {
  docTypeName: string;
};

export function UploadedBanner({ docTypeName }: UploadedBannerProps) {
  const router = useRouter();

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-teal/30 bg-teal/5 p-3 text-sm text-navy"
    >
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
      <div className="flex-1">
        <span className="font-medium">{docTypeName}</span> uploaded — pending
        review.
      </div>
      <button
        type="button"
        onClick={() =>
          router.replace("/portal/documents", { scroll: false })
        }
        className="rounded p-0.5 text-muted-foreground hover:bg-teal/10 hover:text-navy"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
