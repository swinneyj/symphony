"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./sidebar";

interface DashboardShellProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  workspace?: {
    name: string;
  } | null;
  workspaces?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  children: React.ReactNode;
}

/**
 * Responsive app shell: fixed sidebar on md+ screens, hamburger + overlay
 * drawer on mobile. The drawer closes on navigation, backdrop click, or Escape.
 */
export function DashboardShell({
  user,
  workspace,
  workspaces,
  children,
}: DashboardShellProps) {
  const [open, setOpen] = useState(false);

  // Close the drawer on Escape (mobile focus-friendly).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex h-dvh">
      {/* Desktop sidebar (md+) */}
      <div className="hidden md:block">
        <Sidebar user={user} workspace={workspace} workspaces={workspaces} />
      </div>

      {/* Mobile drawer overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar
            user={user}
            workspace={workspace}
            workspaces={workspaces}
            onClose={() => setOpen(false)}
          />
        </div>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-sidebar-background px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/symphony-logo.jpg"
            alt="Symphony"
            className="h-7 w-7"
          />
          <span className="text-base font-semibold">Symphony</span>
        </header>
        <main className="min-w-0 flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
