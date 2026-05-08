"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_ALLOWED_EXTENSION,
  DOCUMENT_MAX_FILE_BYTES,
  expiryLabelFor,
} from "@sentinel/shared/documents";
import { AU_STATES } from "@sentinel/shared/validation/au-states";

import { uploadDocument, type UploadDocumentState } from "./actions";

// Per-row upload dialog. The list page passes the doc-type metadata as
// props; the form renders fields conditional on the flags so it agrees
// with the same flags the M5 server action will use to build its
// validation schema (`documentUploadSchema(flags)`).
//
// Action contract: returns `{ ok: true } | { error } | { fieldErrors }`.
// On `ok`, the useEffect below closes the dialog and refreshes the list.
// `didCloseRef` guards against re-firing if the dialog re-opens with the
// same retained ok-state from useActionState — though in practice the
// list page hides the Upload button once a non-superseded doc exists for
// the type, so re-open is unreachable through normal UX. Defense in
// depth.

type UploadDialogProps = {
  code: string;
  name: string;
  description: string | null;
  capturesReferenceNumber: boolean;
  capturesState: boolean;
  hasExpiry: boolean;
};

const STATE_LABELS: Record<(typeof AU_STATES)[number], string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

const INITIAL_STATE: UploadDocumentState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className="bg-navy hover:bg-navy/90"
    >
      {pending ? "Uploading…" : "Upload"}
    </Button>
  );
}

export function UploadDialog({
  code,
  name,
  description,
  capturesReferenceNumber,
  capturesState,
  hasExpiry,
}: UploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientFileError, setClientFileError] = useState<string | null>(null);
  const [state, formAction] = useActionState<UploadDocumentState, FormData>(
    uploadDocument,
    INITIAL_STATE,
  );

  const didCloseRef = useRef(false);
  useEffect(() => {
    if (state.ok && !didCloseRef.current) {
      didCloseRef.current = true;
      setOpen(false);
      // router.replace (not refresh) so the success banner can read the
      // doc-type code from `?uploaded=<code>`. Replace (not push) keeps
      // the back-button history clean — the user was on /portal/documents
      // before, and they're still on /portal/documents after; they
      // shouldn't have to skip a "?uploaded=..." entry going back.
      //
      // Assumption: this dialog only opens from /portal/documents. If we
      // ever build deep-linkable upload URLs (e.g. an email "click to
      // upload your First Aid cert" landing somewhere else), revisit —
      // we'd want to replace to the originating route or pass an explicit
      // success-redirect target.
      router.replace(
        `/portal/documents?uploaded=${encodeURIComponent(code)}`,
        { scroll: false },
      );
    }
  }, [state.ok, router, code]);

  const fieldErrors = state.fieldErrors ?? {};
  const expiryLabel = expiryLabelFor(code);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0] ?? null;
    if (f && f.size > DOCUMENT_MAX_FILE_BYTES) {
      const sizeMb = (f.size / (1024 * 1024)).toFixed(1);
      setClientFileError(
        `File is ${sizeMb} MB — must be 5 MB or smaller.`,
      );
    } else {
      setClientFileError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-navy hover:bg-navy/90">
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-navy">Upload {name}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {/* Pinned to the doc-type code so the action knows which row's
              flags to load. Untrusted on the server — the action and the
              RPC each verify the code resolves to a system-global type. */}
          <input type="hidden" name="code" value={code} />

          {state.error ? (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {state.error}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`upload-file-${code}`}>PDF document</Label>
            <Input
              id={`upload-file-${code}`}
              type="file"
              name="file"
              accept={DOCUMENT_ALLOWED_EXTENSION}
              required
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">
              Up to 5 MB. PDF only.
            </p>
            {clientFileError ? (
              <p className="text-xs text-destructive">{clientFileError}</p>
            ) : null}
            <FieldError message={fieldErrors.file} />
          </div>

          {capturesReferenceNumber ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`upload-ref-${code}`}>Reference number</Label>
              <Input
                id={`upload-ref-${code}`}
                type="text"
                name="reference_number"
                maxLength={120}
                required
              />
              <FieldError message={fieldErrors.reference_number} />
            </div>
          ) : null}

          {capturesState ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`upload-state-${code}`}>Issuing state</Label>
              <Select name="issuing_state" required>
                <SelectTrigger id={`upload-state-${code}`}>
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
                <SelectContent>
                  {AU_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.issuing_state} />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`upload-issue-${code}`}>
              Issue date{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id={`upload-issue-${code}`}
              type="date"
              name="issue_date"
            />
            <FieldError message={fieldErrors.issue_date} />
          </div>

          {hasExpiry ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`upload-expiry-${code}`}>{expiryLabel}</Label>
              <Input
                id={`upload-expiry-${code}`}
                type="date"
                name="expiry_date"
                required
              />
              <FieldError message={fieldErrors.expiry_date} />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton disabled={clientFileError !== null} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
