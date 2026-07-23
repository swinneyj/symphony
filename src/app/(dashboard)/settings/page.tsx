"use client";

import { useState } from "react";
import {
  User,
  Building2,
  Globe,
  Users,
  Bell,
  Cable,
  Camera,
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

// ─── Types ──────────────────────────────────────────────────────────────────

type Platform = "tiktok" | "youtube" | "instagram" | "facebook" | "x" | "linkedin";

interface ConnectedAccount {
  id: string;
  platform: Platform;
  name: string;
  handle: string;
  connected: boolean;
  avatar?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  avatar?: string;
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

const initialAccounts: ConnectedAccount[] = [
  { id: "a1", platform: "instagram", name: "SEO Platform Official", handle: "@symphony", connected: true },
  { id: "a2", platform: "x", name: "SEO Platform", handle: "@symphonyapp", connected: true },
  { id: "a3", platform: "youtube", name: "SEO Platform", handle: "SEO Platform", connected: true },
  { id: "a4", platform: "tiktok", name: "SEO Platform", handle: "@symphony", connected: true },
  { id: "a5", platform: "linkedin", name: "SEO Platform Inc.", handle: "SEO Platform Inc.", connected: true },
  { id: "a6", platform: "facebook", name: "SEO Platform", handle: "SEO Platform", connected: true },
];

const teamMembers: TeamMember[] = [
  { id: "t1", name: "Alex Morgan", email: "alex@symphony.app", role: "owner" },
  { id: "t2", name: "Jordan Lee", email: "jordan@symphony.app", role: "admin" },
  { id: "t3", name: "Taylor Smith", email: "taylor@symphony.app", role: "member" },
  { id: "t4", name: "Casey Brown", email: "casey@symphony.app", role: "viewer" },
];

const apiConnections = [
  { platform: "Instagram Graph API", status: "connected", lastSync: "2 min ago" },
  { platform: "X API v2", status: "connected", lastSync: "5 min ago" },
  { platform: "YouTube Data API", status: "connected", lastSync: "1 hour ago" },
  { platform: "TikTok Business API", status: "connected", lastSync: "3 min ago" },
  { platform: "LinkedIn API", status: "error", lastSync: "Failed - 2 hours ago" },
  { platform: "Facebook Graph API", status: "connected", lastSync: "10 min ago" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, workspace, and connections
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
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
        </TabsList>

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
                  <AvatarImage src="" />
                  <AvatarFallback className="text-lg">AM</AvatarFallback>
                </Avatar>
                <Button variant="outline" size="sm">
                  <Camera className="h-4 w-4 mr-1" />
                  Change Avatar
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" defaultValue="Alex Morgan" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue="alex@symphony.app" />
                </div>
              </div>
              <Button>Save Changes</Button>
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
                  S
                </div>
                <Button variant="outline" size="sm">
                  <ImageIcon className="h-4 w-4 mr-1" />
                  Change Logo
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ws-name">Workspace Name</Label>
                  <Input id="ws-name" defaultValue="My Workspace" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-slug">Slug</Label>
                  <Input id="ws-slug" defaultValue="my-workspace" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-desc">Description</Label>
                <Textarea id="ws-desc" defaultValue="Our main social media management workspace." />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connected Accounts Tab */}
        <TabsContent value="accounts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connected Social Accounts</CardTitle>
              <CardDescription>Connect or disconnect your social media accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {accounts.map((account) => {
                const Icon = platformIcons[account.platform];
                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", platformColors[account.platform])}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{account.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.handle} &middot; {platformNames[account.platform]}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          account.connected ? "bg-emerald-500" : "bg-destructive"
                        )} />
                        <span className="text-xs text-muted-foreground">
                          {account.connected ? "Connected" : "Disconnected"}
                        </span>
                      </div>
                      <Button
                        variant={account.connected ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => {
                          setAccounts(accounts.map(a =>
                            a.id === account.id ? { ...a, connected: !a.connected } : a
                          ));
                        }}
                      >
                        {account.connected ? (
                          <>
                            <Unlink className="h-3.5 w-3.5 mr-1" />
                            Disconnect
                          </>
                        ) : (
                          <>
                            <Link className="h-3.5 w-3.5 mr-1" />
                            Connect
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
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
              <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Invite Member
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback className="text-xs">
                          {member.name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
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
                      {member.role !== "owner" && (
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
                <Button onClick={() => setInviteDialogOpen(false)}>
                  Send Invitation
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
              {[
                { id: "mentions", label: "Mentions & Tags", desc: "When someone mentions your account" },
                { id: "comments", label: "New Comments", desc: "When you receive new comments on posts" },
                { id: "dms", label: "Direct Messages", desc: "When you receive a direct message" },
                { id: "scheduled", label: "Scheduled Posts", desc: "When a scheduled post goes live" },
                { id: "analytics", label: "Weekly Analytics", desc: "Weekly performance summary" },
                { id: "team", label: "Team Activity", desc: "When team members make changes" },
              ].map((notif) => (
                <div key={notif.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">{notif.label}</p>
                    <p className="text-xs text-muted-foreground">{notif.desc}</p>
                  </div>
                  <div className={cn(
                    "h-6 w-10 rounded-full transition-colors cursor-pointer relative",
                    true ? "bg-primary" : "bg-muted"
                  )}>
                    <div className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                      true ? "translate-x-[18px]" : "translate-x-0.5"
                    )} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Connections Tab */}
        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">API Connection Status</CardTitle>
              <CardDescription>Status of your platform API connections</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {apiConnections.map((api) => (
                <div
                  key={api.platform}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full",
                      api.status === "connected" ? "bg-emerald-500/10" : "bg-destructive/10"
                    )}>
                      {api.status === "connected" ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{api.platform}</p>
                      <p className="text-xs text-muted-foreground">
                        Last synced: {api.lastSync}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={api.status === "connected" ? "secondary" : "destructive"}
                    className="capitalize"
                  >
                    {api.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
