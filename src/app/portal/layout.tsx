import { Button } from "@/components/ui/button";

import { logout } from "./actions";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h2 className="text-sm font-medium uppercase tracking-widest text-navy">
          Onboarding portal
        </h2>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
      {children}
    </div>
  );
}
