"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  ExternalLink,
  Loader2,
  Music2,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Workspace = { id: string; name: string };
type TikTokAccount = {
  accountName: string;
  accountUsername?: string | null;
  avatarUrl?: string | null;
  status: string;
};
type AccountResponse = {
  environment: string;
  products: string[];
  scopes: string[];
  account: TikTokAccount | null;
};
type CreatorInfo = {
  creator_avatar_url?: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
};
type PublishResult = {
  mode: "draft" | "direct";
  publishId: string;
  uploadedBytes: number;
  capability: string;
  nextStep: string;
};

const privacyLabels: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me (private)",
};

export default function TikTokPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [accountData, setAccountData] = useState<AccountResponse | null>(null);
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [mode, setMode] = useState<"draft" | "direct">("draft");
  const [video, setVideo] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [consent, setConsent] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async (workspaceId: string) => {
    const response = await fetch(`/api/tiktok/account?workspaceId=${encodeURIComponent(workspaceId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load TikTok account");
    setAccountData(data);
    return data as AccountResponse;
  }, []);

  const loadCreator = useCallback(async (workspaceId: string) => {
    setCreatorLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tiktok/creator?workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load TikTok posting settings");
      setCreator(data);
      setPrivacyLevel("");
    } catch (creatorError) {
      setError(creatorError instanceof Error ? creatorError.message : "Creator lookup failed");
    } finally {
      setCreatorLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const workspaceResponse = await fetch("/api/workspaces");
        const workspaces = (await workspaceResponse.json()) as Workspace[];
        if (!workspaceResponse.ok || !workspaces.length) throw new Error("No workspace is available");
        setWorkspace(workspaces[0]);
        const connected = await loadAccount(workspaces[0].id);
        if (connected.account) await loadCreator(workspaces[0].id);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load TikTok integration");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAccount, loadCreator]);

  const publish = async () => {
    if (!workspace || !video) return;
    setPublishing(true);
    setError(null);
    setResult(null);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.set("workspaceId", workspace.id);
      formData.set("mode", mode);
      formData.set("caption", caption);
      formData.set("privacyLevel", privacyLevel);
      formData.set("allowComment", String(allowComment));
      formData.set("allowDuet", String(allowDuet));
      formData.set("allowStitch", String(allowStitch));
      formData.set("consent", String(consent));
      formData.set("video", video);

      const response = await fetch("/api/tiktok/publish", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "TikTok publishing failed");
      setResult(data);
      setStatus("Upload complete — ready for TikTok processing");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "TikTok publishing failed");
    } finally {
      setPublishing(false);
    }
  };

  const checkStatus = async () => {
    if (!workspace || !result) return;
    setCheckingStatus(true);
    setError(null);
    try {
      const response = await fetch("/api/tiktok/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, publishId: result.publishId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Status lookup failed");
      setStatus(`${data.status}${data.uploaded_bytes ? ` · ${data.uploaded_bytes.toLocaleString()} bytes received` : ""}`);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Status lookup failed");
    } finally {
      setCheckingStatus(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  const account = accountData?.account;
  const directReady = mode === "draft" || (!!creator && !!privacyLevel && consent);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge className="bg-black text-white hover:bg-black">Production</Badge>
            <Badge variant="outline">Live</Badge>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Music2 className="h-6 w-6" /> TikTok Integration
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a creator with Login Kit, then upload a draft or publish a test video.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {accountData?.scopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)}
        </div>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Login Kit
                <Badge variant={account ? "default" : "outline"}>{account ? "Connected" : "Not connected"}</Badge>
              </CardTitle>
              <CardDescription>OAuth 2.0 authorization with `user.info.basic`.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {account ? (
                <>
                  <div className="flex items-center gap-3 rounded-lg border p-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={account.avatarUrl || ""} />
                      <AvatarFallback><Music2 className="h-5 w-5" /></AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{account.accountName}</p>
                      <p className="text-xs text-muted-foreground">Profile loaded from TikTok via `user.info.basic`</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={!workspace}
                    asChild
                  >
                    <a href={workspace ? `/api/tiktok/connect?workspaceId=${workspace.id}` : "#"}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Reauthorize TikTok
                    </a>
                  </Button>
                </>
              ) : (
                <Button className="w-full bg-black text-white hover:bg-black/90" disabled={!workspace} asChild>
                  <a href={workspace ? `/api/tiktok/connect?workspaceId=${workspace.id}` : "#"}>
                    <Music2 className="mr-2 h-4 w-4" /> Connect TikTok Account
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Capabilities in this review</CardTitle>
              <CardDescription>Every selected TikTok product and scope is visible in the working UI.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                ["Login Kit", "user.info.basic", !!account],
                ["Upload to TikTok", "video.upload", result?.capability === "video.upload"],
                ["Direct Post", "video.publish", result?.capability === "video.publish"],
              ].map(([product, scope, complete]) => (
                <div key={String(scope)} className="flex items-center gap-3 rounded-lg border p-3">
                  {complete ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <CircleDot className="h-5 w-5 text-muted-foreground" />}
                  <div><p className="font-medium">{String(product)}</p><p className="text-xs text-muted-foreground">{String(scope)}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Content Posting API</CardTitle>
            <CardDescription>
              The draft flow delivers media to the TikTok inbox. Direct Post publishes a test video as private.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!account ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Connect a TikTok account to enable posting.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setMode("draft")}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "draft" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    Upload as Draft
                    <span className="mt-0.5 block text-xs font-normal">video.upload</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("direct")}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "direct" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    Direct Post
                    <span className="mt-0.5 block text-xs font-normal">video.publish</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tiktok-video">Video file</Label>
                  <Input id="tiktok-video" type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => setVideo(event.target.files?.[0] || null)} />
                  <p className="text-xs text-muted-foreground">MP4, MOV, or WebM · up to 4 MB for this web review demo</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tiktok-caption">Caption</Label>
                  <Textarea id="tiktok-caption" value={caption} maxLength={2200} onChange={(event) => setCaption(event.target.value)} />
                  <p className="text-right text-xs text-muted-foreground">{caption.length} / 2,200</p>
                </div>

                {mode === "direct" && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Live creator settings</p>
                        <p className="text-xs text-muted-foreground">Required by TikTok before every Direct Post.</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={creatorLoading || !workspace} onClick={() => workspace && loadCreator(workspace.id)}>
                        {creatorLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    </div>
                    {creator && (
                      <>
                        <div className="flex items-center gap-3">
                          <Avatar><AvatarImage src={creator.creator_avatar_url || ""} /><AvatarFallback>TT</AvatarFallback></Avatar>
                          <div><p className="text-sm font-medium">{creator.creator_nickname}</p><p className="text-xs text-muted-foreground">@{creator.creator_username}</p></div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="privacy-level">Who can view this video?</Label>
                          <select
                            id="privacy-level"
                            value={privacyLevel}
                            onChange={(event) => setPrivacyLevel(event.target.value)}
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          >
                            <option value="">Select privacy</option>
                            {creator.privacy_level_options.map((option) => <option key={option} value={option}>{privacyLabels[option] || option}</option>)}
                          </select>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {[
                            ["Allow comments", allowComment, setAllowComment, creator.comment_disabled],
                            ["Allow Duet", allowDuet, setAllowDuet, creator.duet_disabled],
                            ["Allow Stitch", allowStitch, setAllowStitch, creator.stitch_disabled],
                          ].map(([label, checked, setter, disabled]) => (
                            <label key={String(label)} className={`flex items-center gap-2 rounded-md border p-3 text-xs ${disabled ? "opacity-50" : ""}`}>
                              <input type="checkbox" checked={Boolean(checked)} disabled={Boolean(disabled)} onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)} />
                              {String(label)}
                            </label>
                          ))}
                        </div>
                        <label className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs">
                          <input className="mt-0.5" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                          <span>By posting, I agree to TikTok&apos;s Music Usage Confirmation.</span>
                        </label>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Private visibility keeps test posts off your public profile.</p>
                      </>
                    )}
                  </div>
                )}

                <Button className="w-full" disabled={!video || !directReady || publishing} onClick={publish}>
                  {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "draft" ? <Upload className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                  {publishing ? "Sending to TikTok..." : mode === "draft" ? "Upload Draft to TikTok" : "Post Privately to TikTok"}
                </Button>

                {result && (
                  <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                      <div>
                        <p className="font-medium">TikTok accepted the video</p>
                        <p className="mt-1 text-sm text-muted-foreground">{result.nextStep}</p>
                      </div>
                    </div>
                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div><dt className="text-muted-foreground">Capability</dt><dd className="font-mono">{result.capability}</dd></div>
                      <div><dt className="text-muted-foreground">Bytes transferred</dt><dd>{result.uploadedBytes.toLocaleString()}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-muted-foreground">Publish ID</dt><dd className="break-all font-mono">{result.publishId}</dd></div>
                    </dl>
                    <div className="flex items-center gap-3">
                      <Button size="sm" variant="outline" onClick={checkStatus} disabled={checkingStatus}>
                        {checkingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Check TikTok Status
                      </Button>
                      {status && <span className="text-xs font-medium">{status}</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <ExternalLink className="h-3 w-3" /> TikTok Integration · live API responses only
      </p>
    </div>
  );
}
