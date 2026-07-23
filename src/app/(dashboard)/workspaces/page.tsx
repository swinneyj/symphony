"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Users,
  Globe,
  ChevronRight,
  Building2,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  memberCount: number;
  accountCount: number;
  color: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const workspaces: Workspace[] = [
  {
    id: "w1",
    name: "My Workspace",
    slug: "my-workspace",
    description: "Our main social media management workspace for daily operations.",
    memberCount: 4,
    accountCount: 6,
    color: "from-violet-500 to-purple-600",
  },
  {
    id: "w2",
    name: "Marketing Team",
    slug: "marketing-team",
    description: "Content planning and campaign management for the marketing department.",
    memberCount: 8,
    accountCount: 4,
    color: "from-blue-500 to-cyan-600",
  },
  {
    id: "w3",
    name: "Client Projects",
    slug: "client-projects",
    description: "Manage social media accounts for our enterprise clients.",
    memberCount: 6,
    accountCount: 12,
    color: "from-emerald-500 to-teal-600",
  },
  {
    id: "w4",
    name: "Personal Brand",
    slug: "personal-brand",
    description: "Alex's personal social media growth and content.",
    memberCount: 1,
    accountCount: 3,
    color: "from-amber-500 to-orange-600",
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorkspacesPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground">
            Manage your workspaces and team environments
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Create Workspace
        </Button>
      </div>

      {/* Workspace Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((workspace) => (
          <Link key={workspace.id} href={`/dashboard/workspaces/${workspace.id}`}>
            <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer h-full">
              {/* Color accent bar */}
              <div className={cn("h-2 w-full bg-gradient-to-r", workspace.color)} />
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white text-lg font-bold",
                    workspace.color
                  )}>
                    {workspace.name.charAt(0)}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{workspace.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {workspace.description}
                </p>
                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {workspace.memberCount} {workspace.memberCount === 1 ? "member" : "members"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    {workspace.accountCount} accounts
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {/* Create New Card */}
        <button
          onClick={() => setCreateDialogOpen(true)}
          className="rounded-xl border-2 border-dashed border-muted-foreground/25 p-6 text-center transition-colors hover:border-primary/50 hover:bg-accent/50 h-full flex flex-col items-center justify-center min-h-[200px]"
        >
          <Plus className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-muted-foreground">Create Workspace</p>
          <p className="text-xs text-muted-foreground mt-1">Add a new workspace for your team</p>
        </button>
      </div>

      {/* Create Workspace Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>
              Set up a new workspace for your team or project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                placeholder="e.g., Marketing Team"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-desc">Description</Label>
              <Input
                id="ws-desc"
                placeholder="Brief description of this workspace"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setCreateDialogOpen(false)} disabled={!newName}>
              Create Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
