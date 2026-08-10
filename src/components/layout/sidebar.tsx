"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Calendar,
  MessageSquare,
  PenSquare,
  BarChart3,
  Image,
  Settings,
  Users,
  ChevronDown,
  LogOut,
  Sparkles,
  Clapperboard,
  X,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Composer", href: "/composer", icon: PenSquare },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Inbox", href: "/inbox", icon: MessageSquare },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Media Library", href: "/media", icon: Image },
  { name: "AI Studio", href: "/ai-studio", icon: Sparkles },
  { name: "Video Studio", href: "/video-studio", icon: Clapperboard },
  { name: "Workspaces", href: "/workspaces", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
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
  /** Called after any navigation inside the sidebar (used to close the mobile drawer). */
  onNavigate?: () => void;
  /** When provided, renders a close button (mobile drawer only). */
  onClose?: () => void;
}

export function Sidebar({ user, workspace, workspaces, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-sidebar-background">
      {/* Logo & Brand */}
      <div className="flex items-center gap-2 px-6 py-5 border-b">
        <img
          src="/symphony-logo.jpg"
          alt="Symphony"
          width={32}
          height={32}
          className="h-8 w-8"
        />
        <span className="text-lg font-semibold">Symphony</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Workspace Switcher */}
      {workspaces && workspaces.length > 0 && (
        <div className="px-3 pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between text-sm font-normal"
              >
                <span className="truncate">
                  {workspace?.name || workspaces[0]?.name}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {workspaces.map((ws) => (
                <DropdownMenuItem key={ws.id} asChild>
                  <Link href={`/workspaces/${ws.id}`} onClick={onNavigate}>
                    {ws.name}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/workspaces" onClick={onNavigate}>Manage Workspaces</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Menu */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 px-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.image || ""} />
                <AvatarFallback className="text-xs">
                  {user.name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-sm">
                <span className="font-medium leading-tight">{user.name || "User"}</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  {user.email || ""}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                signOut({ callbackUrl: `${window.location.origin}/login` })
              }
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
