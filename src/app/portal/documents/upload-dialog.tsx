"use client";

import { useState } from "react";

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

// Stub upload dialog — M2 wires up the open/close shell only. The real form
// (file input, conditional fields, server-action submit) lands in M3–M5.
// Keeping this component intentionally small until then so the diff in M4
// stays focused on the form itself.
//
// Open/close state is local. Once the action exists, the close-after-success
// choreography (action returns ok → setOpen(false) + router.refresh) gets
// designed in M3 — see Phase 3 notes.

type UploadDialogProps = {
  code: string;
  name: string;
};

export function UploadDialog({ code, name }: UploadDialogProps) {
  const [open, setOpen] = useState(false);

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
          <DialogDescription>
            The upload form for{" "}
            <span className="font-mono text-foreground">{code}</span> isn&apos;t
            wired up yet. We&apos;ll switch it on shortly.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
