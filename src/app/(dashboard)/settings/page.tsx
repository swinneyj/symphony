"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import {
  User,
  Building2,
  Globe,
  Users,
  Bell,
  Cable,
  KeyRound,
  CheckCircle2,
  XCircle,
  Link,
  Unlink,
  Plus,
  Trash2,
  Music2,
  Clapperboard,
  MessageCircle,
  Briefcase,
  Image as ImageIcon,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ApiKeysPanel } from "./api-keys-panel";

// ─── Types ──────────────────────────────────────────────────────────────────

type Platform = "tiktok" | "youtube" | "instagram" | "facebook" | "x" | "linkedin";

interface RealAccount {
  id: string;
  platform: string; // social_accounts platform value (may be "twitter")
  accountName: string;
  accountUsername: string | null;
  avatarUrl: string | null;
  status: string;
}

const ACCOUNT_PLATFORMS: Platform[] = ["facebook", "instagram", "tiktok", "youtube", "x", "linkedin"];

function platformKey(p: string): Platform {
  return (p === "twitter" ? "x" : p) as Platform;
}

/** OAuth entry point per platform: TikTok has its own flow, FB/IG share Meta. */
function connectHref(p: Platform): string {
  return p === "tiktok" ? "/api/auth/tiktok/connect" : "/api/auth/meta/connect";
}

const META_ERRORS: Record<string, string> = {
  meta_denied: "Access to Facebook/Instagram was denied.",
  state_mismatch: "Security check failed — please try again.",
  session_mismatch: "Session changed — please log in and try again.",
  no_pages: "No Facebook Pages found on this account.",
  meta_not_configured: "Meta connection is not configured on this deployment yet.",
  meta_failed: "Meta connection failed. Please try again.",
};

interface TeamMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

// ─── Data ───────────────────────────────────────────────────────────────────

const platformIcons: Record<Platform, React.ElementType> = {
  tiktok: Music2,
  youtube: Clapperboard,
  instagram: ImageIcon,
  facebook: MessageCircle,
  x: Globe,
  linkedin: Briefcase,
};

const platformNames: Record<Platform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
};

const platformColors: Record<Platform, string> = {
  tiktok: "bg-black dark:bg-white",
  youtube: "bg-red-600",
  instagram: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600",
  facebook: "bg-blue-600",
  x: "bg-neutral-900 dark:bg-neutral-100",
  linkedin: "bg-blue-700",
};

const NOTIFICATION_DEFS = [
  { id: "mentions", label: "Mentions & Tags", desc: "When someone mentions your account" },
  { id: "comments", label: "New Comments", desc: "When you receive new comments on posts" },
  { id: "dms", label: "Direct Messages", desc: "When you receive a direct message" },
  { id: "scheduled", label: "Scheduled Posts", desc: "When a scheduled post goes live" },
  { id: "analytics", label: "Weekly Analytics", desc: "Weekly performance summary" },
  { id: "team", label: "Team Activity", desc: "When team members make changes" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [realAccounts, setRealAccounts] = useState<RealAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [myRole, setMyRole] = useState<TeamMember["role"] | null>(null);
  const [me, setMe] = useState<{ id: string; name: string | null; email: string | null; image: string | null } | null>(null);
  const [workspace, setWorkspace] = useState<{ id: string; name: string; slug: string; description: string | null } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const stored = localStorage.getItem("symphony-notification-prefs");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "profile";
    return new URLSearchParams(window.location.search).get("tab") || "profile";
  });

  const loadAccounts = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/accounts?workspaceId=${wsId}`);
    if (res.ok) setRealAccounts(await res.json());
    setLoadingAccounts(false);
  }, []);

  const loadMembers = useCallback(async (wsId: string) => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/workspaces/${wsId}/members`);
      if (res.ok) {
        const members = (await res.json()) as TeamMember[];
        setTeamMembers(members);
        // Determine the current user's role from the session
        const sessionRes = await fetch("/api/auth/session");
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const me = members.find((m) => m.userId === session?.user?.id);
          setMyRole(me?.role ?? null);
        }
      }
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const tiktokErr = params.get("tiktok_error");
    const connected = params.get("connected");
    if (tiktokErr) setNotice({ type: "error", text: tiktokErr });
    else if (err) setNotice({ type: "error", text: META_ERRORS[err] || `Meta connection failed (${err})` });
    else if (connected === "tiktok") setNotice({ type: "success", text: "TikTok account connected" });
    else if (connected) setNotice({ type: "success", text: "Facebook / Instagram connected" });

    (async () => {
      // Load session user for the Profile tab
      const sessionRes = await fetch("/api/auth/session");
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        if (session?.user) setMe(session.user);
      }

      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const workspaces = await res.json();
      if (workspaces.length > 0) {
        const active = resolveActiveWorkspace(workspaces);
        if (active) {
          setWorkspaceId(active.id);
          setWorkspace({
            id: active.id,
            name: active.name ?? "",
            slug: active.slug ?? "",
            description: active.description ?? null,
          });
          loadAccounts(active.id);
          loadMembers(active.id);
        }
      } else {
        setLoadingAccounts(false);
      }
    })();
  }, [loadAccounts, loadMembers]);

  const disconnect = async (account: RealAccount) => {
    const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    if (res.ok) {
      setRealAccounts(realAccounts.filter((a) => a.id !== account.id));
    } else {
      window.alert("Disconnect failed");
    }
  };

  const canManageTeam = myRole === "owner" || myRole === "admin";

  const sendInvite = async () => {
    if (!workspaceId || !inviteEmail.trim()) return;
    setInviting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), invitedRole: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ type: "success", text: `Invited ${inviteEmail.trim()} as ${inviteRole}` });
        setInviteDialogOpen(false);
        setInviteEmail("");
        setInviteRole("member");
        loadMembers(workspaceId);
      } else {
        setNotice({ type: "error", text: data.error || "Invite failed" });
      }
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (member: TeamMember, role: TeamMember["role"]) => {
    if (!workspaceId || role === member.role) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (res.ok) {
      setTeamMembers(teamMembers.map((m) => (m.id === member.id ? { ...m, role } : m)));
      setNotice({ type: "success", text: `${member.name ?? member.email} is now ${role}` });
    } else {
      setNotice({ type: "error", text: data.error || "Failed to update role" });
    }
  };

  const removeMember = async (member: TeamMember) => {
    if (!workspaceId) return;
    if (!window.confirm(`Remove ${member.name ?? member.email} from this workspace?`)) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setTeamMembers(teamMembers.filter((m) => m.id !== member.id));
      setNotice({ type: "success", text: `Removed ${member.name ?? member.email}` });
    } else {
      const data = await res.json().catch(() => ({}));
      setNotice({ type: "error", text: data.error || "Failed to remove member" });
    }
  };

  const toggleNotification = (id: string) => {
    setNotificationPrefs((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem("symphony-notification-prefs", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const saveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingProfile(true);
    setNotice(null);
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        setMe((m) => (m ? { ...m, name: data.name } : m));
        setNotice({ type: "success", text: "Profile updated" });
      } else {
        setNotice({ type: "error", text: data.error || "Failed to update profile" });
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const saveWorkspace = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!workspaceId) return;
    setSavingWorkspace(true);
    setNotice(null);
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const slug = String(form.get("slug") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description }),
      });
      const data = await res.json();
      if (res.ok) {
        setWorkspace({ id: workspaceId, name: data.name, slug: data.slug, description: data.description ?? null });
        setNotice({ type: "success", text: "Workspace updated" });
      } else {
        setNotice({ type: "error", text: data.error || "Failed to update workspace" });
      }
    } finally {
      setSavingWorkspace(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, workspace, and connections
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full flex-wrap h-auto justify-start">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="workspace" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            Workspace
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5">
            <Globe className="h-4 w-4" />
            Connected Accounts
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-4 w-4" />
            Team
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5">
            <Cable className="h-4 w-4" />
            API Connections
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-1.5">
            <KeyRound className="h-4 w-4" />
            API Keys
          </TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="space-y-6">
          <ApiKeysPanel />
        </TabsContent>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={me?.image ?? undefined} />
                  <AvatarFallback className="text-lg">
                    {(me?.name ?? me?.email ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="text-sm text-muted-foreground">
                  {me?.email ?? "Signed in"}
                </div>
              </div>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" name="name" defaultValue={me?.name ?? ""} placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={me?.email ?? ""} disabled />
                  </div>
                </div>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? "Saving…" : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workspace Tab */}
        <TabsContent value="workspace" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace Settings</CardTitle>
              <CardDescription>Manage your workspace details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl font-bold">
                  {(workspace?.name ?? "W").charAt(0).toUpperCase()}
                </div>
                <div className="text-sm text-muted-foreground">
                  /{workspace?.slug ?? "…"}
                </div>
              </div>
              <form onSubmit={saveWorkspace} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ws-name">Workspace Name</Label>
                    <Input id="ws-name" name="name" defaultValue={workspace?.name ?? ""} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ws-slug">Slug</Label>
                    <Input id="ws-slug" name="slug" defaultValue={workspace?.slug ?? ""} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-desc">Description</Label>
                  <Textarea id="ws-desc" name="description" defaultValue={workspace?.description ?? ""} />
                </div>
                <Button type="submit" disabled={savingWorkspace}>
                  {savingWorkspace ? "Saving…" : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connected Accounts Tab */}
        <TabsContent value="accounts" className="space-y-6">
          {notice && (
            <div
              className={cn(
                "rounded-lg border p-3 text-sm",
                notice.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}
            >
              {notice.text}
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connected Social Accounts</CardTitle>
              <CardDescription>Connect or disconnect your social media accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingAccounts ? (
                <p className="text-sm text-muted-foreground">Loading accounts…</p>
              ) : (
                ACCOUNT_PLATFORMS.map((platform) => {
                  const Icon = platformIcons[platform];
                  const color = platformColors[platform];
                  const display = platformNames[platform];
                  const matches = realAccounts.filter(
                    (a) => platformKey(a.platform) === platform
                  );

                  if (matches.length === 0) {
                    return (
                      <div
                        key={platform}
                        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", color)}>
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{display}</p>
                            <p className="text-xs text-muted-foreground">Not connected</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <div className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-destructive" />
                            <span className="text-xs text-muted-foreground">Disconnected</span>
                          </div>
                          {platform === "facebook" || platform === "instagram" || platform === "tiktok" ? (
                            <Button size="sm" asChild>
                              <a href={connectHref(platform)}>
                                <Link className="h-3.5 w-3.5 mr-1" />
                                Connect
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled title="Coming soon">
                              <Link className="h-3.5 w-3.5 mr-1" />
                              Soon
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={platform} className="space-y-3">
                      {matches.map((account) => (
                        <div
                          key={account.id}
                          className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", color)}>
                              <Icon className="h-5 w-5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{account.accountName}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {account.accountUsername ? `@${account.accountUsername} · ` : ""}
                                {display}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <div className="flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-emerald-500" />
                              <span className="text-xs text-muted-foreground">Connected</span>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => disconnect(account)}
                            >
                              <Unlink className="h-3.5 w-3.5 mr-1" />
                              Disconnect
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(platform === "facebook" || platform === "instagram" || platform === "tiktok") && (
                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" asChild>
                            <a href={connectHref(platform)}>
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add another {display}
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Team Members</CardTitle>
                <CardDescription>Manage who has access to this workspace</CardDescription>
              </div>
              {canManageTeam && (
                <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Invite Member
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loadingMembers ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading team members…</div>
              ) : teamMembers.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No members yet{canManageTeam ? " — invite someone to join this workspace" : ""}.
                </div>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member) => (
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
                        {canManageTeam && member.role !== "owner" ? (
                          <select
                            value={member.role}
                            onChange={(e) => changeRole(member, e.target.value as TeamMember["role"])}
                            className="h-8 rounded-md border bg-background px-2 text-xs font-medium capitalize"
                          >
                            {(["admin", "member", "viewer"] as const).map((r) => (
                              <option key={r} value={r} className="capitalize">{r}</option>
                            ))}
                          </select>
                        ) : (
                          <Badge
                            variant={
                              member.role === "owner" ? "default" :
                              member.role === "admin" ? "secondary" :
                              "outline"
                            }
                            className="capitalize"
                          >
                            {member.role}
                          </Badge>
                        )}
                        {canManageTeam && member.role !== "owner" && (
                          <Button variant="ghost" size="icon" onClick={() => removeMember(member)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invite Dialog */}
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an invitation to join this workspace
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="flex gap-2">
                    {(["member", "admin", "viewer"] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setInviteRole(role)}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors",
                          inviteRole === role
                            ? "border-primary bg-primary/5 text-primary"
                            : "text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? "Sending…" : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {NOTIFICATION_DEFS.map((notif) => (
                <div key={notif.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">{notif.label}</p>
                    <p className="text-xs text-muted-foreground">{notif.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!notificationPrefs[notif.id]}
                    aria-label={notif.label}
                    onClick={() => toggleNotification(notif.id)}
                    className={cn(
                      "h-6 w-10 rounded-full transition-colors cursor-pointer relative",
                      notificationPrefs[notif.id] ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                      notificationPrefs[notif.id] ? "translate-x-[18px]" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Preferences are saved to this browser. Account-wide notification delivery is coming soon.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Connections Tab */}
        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connected Platform APIs</CardTitle>
              <CardDescription>Platforms currently linked to this workspace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingAccounts ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading connections…</div>
              ) : realAccounts.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No platform accounts connected yet — connect one from the Connected Accounts tab.
                </div>
              ) : (
                realAccounts.map((account) => {
                  const p = platformKey(account.platform);
                  const Icon = platformIcons[p];
                  return (
                    <div
                      key={account.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full",
                          account.status === "connected" ? "bg-emerald-500/10" : "bg-destructive/10"
                        )}>
                          {account.status === "connected" ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-destructive" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{account.accountName}</p>
                          <p className="text-xs text-muted-foreground">
                            {account.accountUsername ? `@${account.accountUsername} · ` : ""}{platformNames[p]}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={account.status === "connected" ? "secondary" : "destructive"}
                        className="capitalize"
                      >
                        {account.status}
                      </Badge>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
