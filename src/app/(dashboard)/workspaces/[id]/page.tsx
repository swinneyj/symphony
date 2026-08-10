"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Globe,
  Trash2,
  CheckCircle2,
  XCircle,
  Music2,
  Clapperboard,
  Camera,
  MessageCircle,
  Briefcase,
  Image as ImageIcon,
  Mail,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type Platform = "tiktok" | "youtube" | "instagram" | "facebook" | "x" | "linkedin";
type MemberRole = "owner" | "admin" | "member" | "viewer";

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  socialAccountCount: number;
}

interface RealAccount {
  id: string;
  platform: string;
  accountName: string;
  accountUsername: string | null;
  avatarUrl: string | null;
  status: string;
}

interface TeamMember {
  id: string;
  name: string | null;
  email: string | null;
  role: MemberRole;
  image: string | null;
}

const platformIcons: Record<Platform, React.ElementType> = {
  tiktok: Music2,
  youtube: Clapperboard,
  instagram: Camera,
  facebook: MessageCircle,
  x: Globe,
  linkedin: Briefcase,
};

const platformColors: Record<Platform, string> = {
  tiktok: "bg-black",
  youtube: "bg-red-600",
  instagram: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600",
  facebook: "bg-blue-600",
  x: "bg-neutral-900",
  linkedin: "bg-blue-700",
};

const platformNames: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
};

function toPlatform(p: string): Platform {
  return (p === "twitter" ? "x" : p) as Platform;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [accounts, setAccounts] = useState<RealAccount[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [wsRes, accountsRes, membersRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}`),
        fetch(`/api/accounts?workspaceId=${workspaceId}`),
        fetch(`/api/workspaces/${workspaceId}/members`),
      ]);
      if (wsRes.ok) setWorkspace(await wsRes.json());
      if (accountsRes.ok) setAccounts(await accountsRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const deleteWorkspace = async () => {
    setDeleting(true);
    const res = await fetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/workspaces";
    } else {
      const data = await res.json().catch(() => ({}));
      setNotice({ type: "error", text: data.error || "Failed to delete workspace" });
      setDeleting(false);
    }
  };

  const removeMember = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.name ?? member.email} from this workspace?`)) return;
    setRemovingId(member.id);
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, { method: "DELETE" });
    if (res.ok) {
      setMembers(members.filter((m) => m.id !== member.id));
      setNotice({ type: "success", text: `Removed ${member.name ?? member.email}` });
    } else {
      const data = await res.json().catch(() => ({}));
      setNotice({ type: "error", text: data.error || "Failed to remove member" });
    }
    setRemovingId(null);
  };

  if (loading && !workspace) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading workspace…</div>;
  }

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Back Navigation */}
      <Link
        href="/workspaces"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Workspaces
      </Link>

      {notice && (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            notice.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {notice.text}
        </div>
      )}

      {/* Workspace Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white text-2xl font-bold shadow-lg">
            {(workspace?.name ?? "W").charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{workspace?.name ?? "Workspace"}</h1>
            <p className="text-sm text-muted-foreground">
              /{workspace?.slug ?? "…"} &middot; {workspace?.memberCount ?? 0} members &middot; {workspace?.socialAccountCount ?? 0} connected accounts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings?tab=workspace">
              <Shield className="h-4 w-4 mr-1" />
              Manage in Settings
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {workspace?.description || "No description yet — edit it in Settings → Workspace."}
          </p>
        </CardContent>
      </Card>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Connected Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connected Accounts</CardTitle>
            <CardDescription>Social media accounts linked to this workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {accounts.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No accounts connected yet — connect one in Settings → Connected Accounts.
              </p>
            ) : (
              accounts.map((account) => {
                const platform = toPlatform(account.platform);
                const Icon = platformIcons[platform];
                return (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", platformColors[platform])}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{account.accountName}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.accountUsername ? `@${account.accountUsername}` : ""} &middot; {platformNames[platform]}
                      </p>
                    </div>
                    {account.status === "connected" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Team Members</CardTitle>
              <CardDescription>People with access to this workspace</CardDescription>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link href="/settings?tab=team">
                <Users className="h-4 w-4 mr-1" />
                Manage Team
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {members.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No members yet.
              </p>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={member.image ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {(member.name ?? member.email ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{member.name ?? member.email}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={member.role === "owner" ? "default" : member.role === "admin" ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {member.role}
                    </Badge>
                    {member.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={removingId === member.id}
                        onClick={() => removeMember(member)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              This permanently deletes &quot;{workspace?.name}&quot; and all of its data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteWorkspace} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
