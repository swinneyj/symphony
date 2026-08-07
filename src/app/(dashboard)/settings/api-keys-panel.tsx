"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Copy, Trash2, Loader2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const SCOPES = [
  { value: "accounts:read", label: "Read accounts", hint: "List connected social accounts" },
  { value: "posts:read", label: "Read posts", hint: "View posts and platform statuses" },
  { value: "posts:write", label: "Write posts", hint: "Create drafts and schedule posts" },
  { value: "posts:publish", label: "Publish to TikTok", hint: "Push videos to TikTok (draft or direct)" },
  { value: "analytics:read", label: "Read analytics", hint: "Analytics overview" },
  { value: "ai:generate", label: "AI captions", hint: "Caption, hashtag, and idea generation" },
] as const;

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export function ApiKeysPanel() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(SCOPES.map((s) => s.value));
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`/api/keys?workspaceId=${workspaceId}`);
      if (res.ok) setKeys(await res.json());
    } catch {
      /* ignore — panel shows what it has */
    }
  }, [workspaceId]);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((workspaces: Array<{ id: string }>) => {
        if (workspaces.length > 0) setWorkspaceId(workspaces[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const createKey = async () => {
    if (!workspaceId || !name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/keys?workspaceId=${workspaceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes: selectedScopes }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to create key");
        return;
      }
      setCreatedSecret(body.secret);
      setName("");
      loadKeys();
    } catch {
      setError("Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!workspaceId) return;
    setRevoking(id);
    try {
      await fetch(`/api/keys/${id}?workspaceId=${workspaceId}`, { method: "DELETE" });
      loadKeys();
    } finally {
      setRevoking(null);
    }
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    await navigator.clipboard.writeText(createdSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading API keys…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> API Keys
          </CardTitle>
          <CardDescription>
            Keys let AI agents (Claude Code, Codex, ChatGPT) drive Symphony through the MCP server at{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/mcp</code>. The secret is shown
            once at creation — store it somewhere safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-name">Key name</Label>
            <div className="flex gap-2">
              <Input
                id="key-name"
                placeholder="e.g. claude-code-publisher"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
              <Button onClick={createKey} disabled={creating || !name.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                {creating ? "Creating…" : "Create key"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Scopes</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCOPES.map((s) => (
                <label
                  key={s.value}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-2.5 cursor-pointer text-sm",
                    selectedScopes.includes(s.value)
                      ? "border-primary/50 bg-muted"
                      : "hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(s.value)}
                    onChange={() => toggleScope(s.value)}
                    className="mt-0.5"
                  />
                  <span className="space-y-0.5">
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Separator />

          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No API keys yet. Create one to connect an agent.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{k.name}</span>
                      <code className="text-xs text-muted-foreground">{k.keyPrefix}</code>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {k.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">
                          {s}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {k.lastUsedAt
                          ? `Last used ${new Date(k.lastUsedAt).toLocaleString()}`
                          : "Never used"}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => revoke(k.id)}
                    disabled={revoking === k.id}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {revoking === k.id ? "Revoking…" : "Revoke"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(createdSecret)} onOpenChange={(open) => !open && setCreatedSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Key created — copy it now</DialogTitle>
            <DialogDescription>
              This is the only time the full secret is shown. It cannot be recovered later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted p-2.5 text-xs break-all">
              {createdSecret}
            </code>
            <Button variant="outline" size="icon" onClick={copySecret}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
