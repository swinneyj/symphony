"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Globe,
  Settings,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  Music2,
  Clapperboard,
  Camera,
  MessageCircle,
  Briefcase,
  Image as ImageIcon,
  AlertTriangle,
  Mail,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type Platform = "tiktok" | "youtube" | "instagram" | "facebook" | "x" | "linkedin";
type MemberRole = "owner" | "admin" | "member" | "viewer";

interface ConnectedAccount {
  id: string;
  platform: Platform;
  name: string;
  handle: string;
  status: "connected" | "error";
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  avatar?: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const platformIcons: Record<Platform, React.ElementType> = {
  tiktok: Music2,
  youtube: Clapperboard,
  instagram: Camera,
  facebook: MessageCircle,
  x: Globe,
  linkedin: Briefcase,
};

const platformColors: Record<Platform, string> = {
  tiktok: "bg-black dark:bg-white",
  youtube: "bg-red-600",
  instagram: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600",
  facebook: "bg-blue-600",
  x: "bg-neutral-900 dark:bg-neutral-100",
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

const workspaceData = {
  id: "w1",
  name: "My Workspace",
  slug: "my-workspace",
  description: "Our main social media management workspace for daily operations.",
  memberCount: 4,
  accountCount: 6,
  color: "from-violet-500 to-purple-600",
};

const connectedAccounts: ConnectedAccount[] = [
  { id: "a1", platform: "instagram", name: "SEO Platform Official", handle: "@symphony", status: "connected" },
  { id: "a2", platform: "x", name: "SEO Platform", handle: "@symphonyapp", status: "connected" },
  { id: "a3", platform: "youtube", name: "SEO Platform", handle: "SEO Platform", status: "connected" },
  { id: "a4", platform: "tiktok", name: "SEO Platform", handle: "@symphony", status: "connected" },
  { id: "a5", platform: "linkedin", name: "SEO Platform Inc.", handle: "SEO Platform Inc.", status: "connected" },
  { id: "a6", platform: "facebook", name: "SEO Platform", handle: "SEO Platform", status: "error" },
];

const teamMembers: TeamMember[] = [
  { id: "t1", name: "Alex Morgan", email: "alex@symphony.app", role: "owner" },
  { id: "t2", name: "Jordan Lee", email: "jordan@symphony.app", role: "admin" },
  { id: "t3", name: "Taylor Smith", email: "taylor@symphony.app", role: "member" },
  { id: "t4", name: "Casey Brown", email: "casey@symphony.app", role: "viewer" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Back Navigation */}
      <Link
        href="/dashboard/workspaces"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Workspaces
      </Link>

      {/* Workspace Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white text-2xl font-bold shadow-lg",
            workspaceData.color
          )}>
            {workspaceData.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{workspaceData.name}</h1>
            <p className="text-sm text-muted-foreground">
              /{workspaceData.slug} &middot; {workspaceData.memberCount} members &middot; {workspaceData.accountCount} connected accounts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-1" />
            Edit Workspace
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
          <p className="text-sm text-muted-foreground">{workspaceData.description}</p>
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
            {connectedAccounts.map((account) => {
              const Icon = platformIcons[account.platform];
              return (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", platformColors[account.platform])}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {account.handle} &middot; {platformNames[account.platform]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      account.status === "connected" ? "bg-emerald-500" : "bg-destructive"
                    )} />
                    <span className="text-xs text-muted-foreground capitalize">
                      {account.status}
                    </span>
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="w-full mt-2">
              <Globe className="h-4 w-4 mr-1" />
              Connect More Accounts
            </Button>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Members</CardTitle>
            <CardDescription>People with access to this workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
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
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full mt-2">
              <Mail className="h-4 w-4 mr-1" />
              Invite Member
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Workspace Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace Settings</CardTitle>
          <CardDescription>Edit workspace details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br text-white text-xl font-bold",
              workspaceData.color
            )}>
              {workspaceData.name.charAt(0)}
            </div>
            <Button variant="outline" size="sm">
              <ImageIcon className="h-4 w-4 mr-1" />
              Change Logo
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Workspace Name</Label>
              <Input id="edit-name" defaultValue={workspaceData.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input id="edit-slug" defaultValue={workspaceData.slug} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea id="edit-desc" defaultValue={workspaceData.description} />
          </div>
          <Button>Save Changes</Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions for this workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
            <div>
              <p className="text-sm font-medium">Delete this workspace</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this workspace and all its data. This action cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete Workspace
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Workspace
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{workspaceData.name}</strong>? This action cannot be undone. All posts, analytics, and settings will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <Label htmlFor="confirm-delete" className="text-sm">
              Type <strong>delete</strong> to confirm
            </Label>
            <Input id="confirm-delete" placeholder="delete" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => setDeleteDialogOpen(false)}>
              <Trash2 className="h-4 w-4 mr-1" />
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
