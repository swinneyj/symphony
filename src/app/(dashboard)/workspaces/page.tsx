"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Users,
  Globe,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApiWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role?: string;
}

const gradients = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadWorkspaces = () => {
    fetch("/api/workspaces")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: ApiWorkspace[]) => setWorkspaces(data))
      .catch(() => toast.error("Could not load workspaces"))
      .finally(() => setLoading(false));
  };

  useEffect(loadWorkspaces, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const slug =
        newName
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "workspace";
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
          description: newDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create workspace");
      toast.success("Workspace created");
      setCreateDialogOpen(false);
      setNewName("");
      setNewDescription("");
      loadWorkspaces();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setIsCreating(false);
    }
  };

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
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading workspaces...</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace, index) => {
            const color = gradients[index % gradients.length];
            return (
              <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
                <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer h-full">
                  {/* Color accent bar */}
                  <div className={cn("h-2 w-full bg-gradient-to-r", color)} />
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white text-lg font-bold",
                        color
                      )}>
                        {workspace.name.charAt(0)}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">{workspace.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {workspace.description || "No description yet"}
                    </p>
                    <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {workspace.role === "owner" ? "Owner" : workspace.role || "Member"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-4 w-4" />
                        {workspace.slug}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}

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
      )}

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
            <Button onClick={handleCreate} disabled={!newName.trim() || isCreating}>
              {isCreating ? "Creating..." : "Create Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
