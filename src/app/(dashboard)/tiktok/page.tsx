"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
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
type PublishStatus = {
  status: string;
  fail_reason?: string;
  uploaded_bytes?: number;
  publicaly_available_post_id?: string[];
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
  const [contentDisclosure, setContentDisclosure] = useState(false);
  const [ownBrand, setOwnBrand] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const videoPreviewUrlRef = useRef<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [status, setStatus] = useState<PublishStatus | null>(null);
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
        const active = resolveActiveWorkspace(workspaces);
        if (!active) return;
        setWorkspace(active);
        const connected = await loadAccount(active.id);
        if (connected.account) await loadCreator(active.id);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load TikTok integration");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAccount, loadCreator]);

  useEffect(() => () => {
    if (videoPreviewUrlRef.current) URL.revokeObjectURL(videoPreviewUrlRef.current);
  }, []);

  useEffect(() => {
    if (!workspace || !result || result.mode !== "direct") return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const poll = async () => {
      if (!active) return;
      setCheckingStatus(true);
      try {
        const response = await fetch("/api/tiktok/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: workspace.id, publishId: result.publishId }),
        });
        const data = (await response.json()) as PublishStatus & { error?: string };
        if (!response.ok) throw new Error(data.error || "Status lookup failed");
        if (!active) return;
        setStatus(data);
        const terminal = data.status === "PUBLISH_COMPLETE" || data.status === "FAILED";
        attempts += 1;
        if (!terminal && attempts < 30) timer = setTimeout(poll, 4_000);
      } catch (statusError) {
        if (active) setError(statusError instanceof Error ? statusError.message : "Status lookup failed");
      } finally {
        if (active) setCheckingStatus(false);
      }
    };

    timer = setTimeout(poll, 1_500);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [result, workspace]);

  const handleVideoChange = (file: File | null) => {
    if (videoPreviewUrlRef.current) URL.revokeObjectURL(videoPreviewUrlRef.current);
    const objectUrl = file ? URL.createObjectURL(file) : null;
    videoPreviewUrlRef.current = objectUrl;
    setVideo(file);
    setVideoPreviewUrl(objectUrl);
    setVideoDuration(null);
    setError(null);
  };

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
      formData.set("contentDisclosure", String(contentDisclosure));
      formData.set("brandOrganic", String(contentDisclosure && ownBrand));
      formData.set("brandedContent", String(contentDisclosure && brandedContent));
      formData.set("consent", String(consent));
      formData.set("videoDurationSec", String(videoDuration || 0));
      formData.set("video", video);

      const response = await fetch("/api/tiktok/publish", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "TikTok publishing failed");
      setResult(data);
      setStatus({ status: mode === "direct" ? "PROCESSING" : "UPLOAD_COMPLETE" });
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
      setStatus(data);
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
  const disclosureReady = !contentDisclosure || ownBrand || brandedContent;
  const brandedPrivacyReady = !brandedContent || privacyLevel !== "SELF_ONLY";
  const durationReady = mode === "draft" || (
    !!creator && videoDuration !== null && videoDuration > 0 && videoDuration <= creator.max_video_post_duration_sec
  );
  const directReady = mode === "draft" || (
    !!creator && !!privacyLevel && consent && disclosureReady && brandedPrivacyReady && durationReady
  );
  const disclosureLabel = brandedContent ? "Paid partnership" : ownBrand ? "Promotional content" : null;
  const durationTooLong = mode === "direct" && !!creator && videoDuration !== null && videoDuration > creator.max_video_post_duration_sec;

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
              The draft flow delivers media to the TikTok inbox. Direct Post publishes with the privacy and disclosure settings you choose.
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
                  <Input id="tiktok-video" type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(event) => handleVideoChange(event.target.files?.[0] || null)} />
                  <p className="text-xs text-muted-foreground">MP4, MOV, or WebM · up to 4 MB for this web review demo</p>
                  {video && videoPreviewUrl && (
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                      <div className="mx-auto aspect-[9/16] max-h-[420px] overflow-hidden rounded-md bg-black">
                        <video
                          className="h-full w-full object-contain"
                          src={videoPreviewUrl}
                          controls
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={(event) => setVideoDuration(event.currentTarget.duration)}
                          onError={() => {
                            setVideoDuration(null);
                            setError("Could not read this video's duration. Choose a valid MP4, MOV, or WebM file.");
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="max-w-full truncate font-medium">{video.name}</span>
                        <span className="text-muted-foreground">
                          {(video.size / 1024 / 1024).toFixed(2)} MB
                          {videoDuration !== null ? ` · ${videoDuration.toFixed(1)} seconds` : " · Reading duration…"}
                        </span>
                      </div>
                    </div>
                  )}
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
                            {creator.privacy_level_options.map((option) => (
                              <option key={option} value={option} disabled={option === "SELF_ONLY" && brandedContent}>
                                {privacyLabels[option] || option}
                              </option>
                            ))}
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
                        <div className="space-y-3 rounded-md border p-3">
                          <label className="flex items-start gap-3 text-sm">
                            <input
                              className="mt-1"
                              type="checkbox"
                              checked={contentDisclosure}
                              onChange={(event) => {
                                const enabled = event.target.checked;
                                setContentDisclosure(enabled);
                                if (!enabled) {
                                  setOwnBrand(false);
                                  setBrandedContent(false);
                                }
                              }}
                            />
                            <span>
                              <span className="block font-medium">Content disclosure</span>
                              <span className="block text-xs text-muted-foreground">This content promotes a brand, product, or service.</span>
                            </span>
                          </label>
                          {contentDisclosure && (
                            <div className="space-y-2 border-t pt-3">
                              <p className="text-xs font-medium">Who does this content promote? Select at least one.</p>
                              <label className="flex items-start gap-2 rounded-md border p-3 text-xs">
                                <input className="mt-0.5" type="checkbox" checked={ownBrand} onChange={(event) => setOwnBrand(event.target.checked)} />
                                <span><span className="block font-medium">Your brand</span>Promotes you or your own business.</span>
                              </label>
                              <label className={`flex items-start gap-2 rounded-md border p-3 text-xs ${privacyLevel === "SELF_ONLY" ? "opacity-50" : ""}`}>
                                <input
                                  className="mt-0.5"
                                  type="checkbox"
                                  checked={brandedContent}
                                  disabled={privacyLevel === "SELF_ONLY"}
                                  onChange={(event) => setBrandedContent(event.target.checked)}
                                />
                                <span><span className="block font-medium">Branded content</span>Promotes another brand or a third party.</span>
                              </label>
                              {!disclosureReady && <p className="text-xs font-medium text-destructive">Indicate whether the content promotes your brand, a third party, or both.</p>}
                              {privacyLevel === "SELF_ONLY" && <p className="text-xs text-muted-foreground">Branded content visibility cannot be set to private.</p>}
                              {disclosureLabel && <p className="rounded-md bg-muted p-2 text-xs font-medium">Your video will be labeled as “{disclosureLabel}”.</p>}
                            </div>
                          )}
                        </div>
                        {durationTooLong && (
                          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                            This video is {videoDuration?.toFixed(1)} seconds. @{creator.creator_username} currently allows videos up to {creator.max_video_post_duration_sec} seconds.
                          </p>
                        )}
                        <label className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs">
                          <input className="mt-0.5" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                          <span>
                            By posting, I agree to TikTok&apos;s {brandedContent && (
                              <><a className="underline" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a> and </>
                            )}
                            <a className="underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.
                          </span>
                        </label>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Your selected privacy and disclosure settings will be sent to TikTok with this post.</p>
                      </>
                    )}
                  </div>
                )}

                {mode === "direct" && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
                    After you publish, TikTok may take a few minutes to process the video and make it visible on the creator&apos;s profile. Symphony will automatically check and display the latest status below.
                  </div>
                )}

                <Button className="w-full" disabled={!video || !directReady || publishing} onClick={publish}>
                  {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "draft" ? <Upload className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                  {publishing ? "Sending to TikTok..." : mode === "draft" ? "Upload Draft to TikTok" : "Post to TikTok"}
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
                      {status && (
                        <span className={`text-xs font-medium ${status.status === "FAILED" ? "text-destructive" : ""}`}>
                          {status.status}
                          {status.uploaded_bytes ? ` · ${status.uploaded_bytes.toLocaleString()} bytes received` : ""}
                        </span>
                      )}
                    </div>
                    {checkingStatus && <p className="text-xs text-muted-foreground">TikTok is still processing this post. Symphony will check again automatically.</p>}
                    {status?.fail_reason && <p className="text-xs text-destructive">TikTok reported: {status.fail_reason}</p>}
                    {!!status?.publicaly_available_post_id?.length && (
                      <p className="text-xs"><span className="text-muted-foreground">TikTok post ID:</span> <span className="font-mono">{status.publicaly_available_post_id.join(", ")}</span></p>
                    )}
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
