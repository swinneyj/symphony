"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import {
  Search,
  MessageSquare,
  Send,
  CheckCircle2,
  Tag,
  UserPlus,
  MoreHorizontal,
  CheckCheck,
  Music2,
  Clapperboard,
  Camera,
  MessageCircle,
  Globe,
  Briefcase,
  ChevronDown,
  ArrowLeft,
  Inbox as InboxIcon,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type Platform = "tiktok" | "youtube" | "instagram" | "facebook" | "x" | "linkedin";
type DbPlatform = "tiktok" | "youtube" | "instagram" | "facebook" | "twitter" | "linkedin";

interface InboxMessage {
  id: string;
  workspaceId: string;
  socialAccountId: string | null;
  platform: DbPlatform;
  messageType: "comment" | "direct_message" | "mention" | "reply";
  status: "unread" | "read" | "replied" | "archived" | "spam";
  senderId: string | null;
  senderName: string | null;
  senderAvatar: string | null;
  senderUsername: string | null;
  content: string;
  mediaUrls: string[] | null;
  assignedToId: string | null;
  tags: string[] | null;
  receivedAt: string;
  createdAt: string;
  socialAccountName: string | null;
  socialAccountPlatform: DbPlatform | null;
}

interface Reply {
  id: string;
  messageId: string;
  repliedById: string | null;
  content: string;
  sentAt: string;
  repliedByName: string | null;
}

interface MessageDetail extends InboxMessage {
  replies: Reply[];
}

interface Source {
  id: string;
  name: string;
  platform: Platform;
  unread: number;
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
  tiktok: "bg-black dark:bg-white",
  youtube: "bg-red-600",
  instagram: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600",
  facebook: "bg-blue-600",
  x: "bg-neutral-900 dark:bg-neutral-100",
  linkedin: "bg-blue-700",
};

const platformBadgeColors: Record<Platform, string> = {
  tiktok: "border-black dark:border-white text-black dark:text-white",
  youtube: "border-red-600 text-red-600",
  instagram: "border-pink-500 text-pink-500",
  facebook: "border-blue-600 text-blue-600",
  x: "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100",
  linkedin: "border-blue-700 text-blue-700",
};

function toPlatform(p: DbPlatform): Platform {
  return p === "twitter" ? "x" : p;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const messageTypes: { id: string; label: string; db: string }[] = [
  { id: "all", label: "All", db: "" },
  { id: "dm", label: "DMs", db: "direct_message" },
  { id: "comment", label: "Comments", db: "comment" },
  { id: "mention", label: "Mentions", db: "mention" },
];

const statusFilters: { id: string; label: string; db: string }[] = [
  { id: "all", label: "All", db: "" },
  { id: "unread", label: "Unread", db: "unread" },
  { id: "read", label: "Read", db: "read" },
  { id: "resolved", label: "Resolved", db: "replied" },
];

const savedReplies = [
  "Thanks for reaching out! We'll get back to you shortly.",
  "We appreciate your feedback! We've shared this with our team.",
  "Great question! You can find more info in our help center.",
  "We're glad you love it! Stay tuned for more updates.",
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [selectedSource, setSelectedSource] = useState<string | null>("all");
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showSavedReplies, setShowSavedReplies] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMessages = useCallback(async (wsId: string, status = "", type = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspaceId: wsId });
      if (status) params.set("status", status);
      if (type) params.set("messageType", type);
      const res = await fetch(`/api/inbox?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const workspaces = await res.json();
      if (workspaces.length > 0) {
        const active = resolveActiveWorkspace(workspaces);
        if (active) {
          setWorkspaceId(active.id);
          loadMessages(active.id);
        }
      } else {
        setLoading(false);
      }
    })();
  }, [loadMessages]);

  const openMessage = async (msg: InboxMessage) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/inbox/messages/${msg.id}`);
      if (res.ok) {
        const detail = (await res.json()) as MessageDetail;
        setSelectedMessage(detail);
        // Mark as read when opened
        if (detail.status === "unread") {
          await fetch(`/api/inbox/messages/${detail.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "read" }),
          });
          if (workspaceId) loadMessages(workspaceId);
          setSelectedMessage({ ...detail, status: "read" });
        }
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const sendReply = async () => {
    if (!selectedMessage || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: selectedMessage.id, content: replyText.trim() }),
      });
      if (res.ok) {
        setReplyText("");
        setNotice("Reply sent");
        // Refresh detail + list
        const detailRes = await fetch(`/api/inbox/messages/${selectedMessage.id}`);
        if (detailRes.ok) setSelectedMessage(await detailRes.json());
        if (workspaceId) loadMessages(workspaceId);
      } else {
        const data = await res.json().catch(() => ({}));
        setNotice(data.error || "Reply failed");
      }
    } finally {
      setSendingReply(false);
    }
  };

  const markResolved = async () => {
    if (!selectedMessage) return;
    const res = await fetch(`/api/inbox/messages/${selectedMessage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "replied" }),
    });
    if (res.ok) {
      setSelectedMessage({ ...selectedMessage, status: "replied" });
      if (workspaceId) loadMessages(workspaceId);
      setNotice("Marked as resolved");
    }
  };

  const sources = useMemo<Source[]>(() => {
    const byAccount = new Map<string, Source>();
    for (const msg of messages) {
      const key = msg.socialAccountId ?? "all";
      if (!byAccount.has(key)) {
        byAccount.set(key, {
          id: key,
          name: msg.socialAccountName ?? "Unknown",
          platform: toPlatform(msg.socialAccountPlatform ?? msg.platform),
          unread: 0,
        });
      }
      if (msg.status === "unread") byAccount.get(key)!.unread += 1;
    }
    return Array.from(byAccount.values());
  }, [messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (selectedSource !== "all" && msg.socialAccountId !== selectedSource) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "resolved") {
          if (msg.status !== "replied" && msg.status !== "archived") return false;
        } else if (msg.status !== statusFilter) return false;
      }
      if (searchQuery &&
        !msg.content.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !(msg.senderName ?? "").toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [messages, selectedSource, statusFilter, searchQuery]);

  const totalUnread = useMemo(() => messages.filter((m) => m.status === "unread").length, [messages]);

  const currentTypeDb = messageTypes.find((t) => t.id === typeFilter)?.db ?? "";

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top Toolbar */}
      <div className="flex flex-col gap-3 border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Unified Inbox</h1>
            <p className="text-sm text-muted-foreground">
              Manage all your social conversations in one place
            </p>
          </div>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
            <InboxIcon className="h-4 w-4" />
            {totalUnread} unread
          </Badge>
        </div>
        {notice && <p className="text-xs text-emerald-600">{notice}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-1 rounded-lg border p-0.5">
            {messageTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTypeFilter(t.id);
                  if (workspaceId) loadMessages(workspaceId, currentTypeDb, t.db);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  typeFilter === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg border p-0.5">
            {statusFilters.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setStatusFilter(s.id);
                  if (workspaceId) loadMessages(workspaceId, s.db, currentTypeDb);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === s.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Three-column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Sources */}
        <div className="hidden md:block md:w-64 shrink-0 border-r overflow-y-auto p-3">
          <div className="mb-3">
            <button
              onClick={() => setSelectedSource("all")}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                selectedSource === "all"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              <InboxIcon className="h-4 w-4" />
              All Sources
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {totalUnread}
              </Badge>
            </button>
          </div>
          <div className="space-y-1">
            {sources.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No connected sources</p>
            )}
            {sources.map((source) => {
              const Icon = platformIcons[source.platform];
              return (
                <button
                  key={source.id}
                  onClick={() => setSelectedSource(source.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    selectedSource === source.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", platformColors[source.platform])}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-xs font-medium">{source.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground capitalize">{source.platform}</p>
                  </div>
                  {source.unread > 0 && (
                    <Badge className="h-5 min-w-5 rounded-full p-0 text-[10px] flex items-center justify-center">
                      {source.unread}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Message List */}
        <div
          className={cn(
            "w-full md:w-96 shrink-0 border-r overflow-y-auto",
            selectedMessage && "hidden md:block"
          )}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p className="text-sm">Loading messages…</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2" />
              <p className="text-sm">
                {messages.length === 0 ? "No messages yet — they'll appear when your accounts receive comments or DMs" : "No messages found"}
              </p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const p = toPlatform(msg.platform);
              const Icon = platformIcons[p];
              return (
                <button
                  key={msg.id}
                  onClick={() => openMessage(msg)}
                  className={cn(
                    "w-full border-b px-4 py-3 text-left transition-colors hover:bg-accent/50",
                    selectedMessage?.id === msg.id && "bg-accent",
                    msg.status === "unread" && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={msg.senderAvatar ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {(msg.senderName ?? "?").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className={cn("text-sm truncate", msg.status === "unread" && "font-semibold")}>
                          {msg.senderName ?? msg.senderUsername ?? "Unknown"}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{timeAgo(msg.receivedAt)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{msg.content}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize", platformBadgeColors[p])}>
                          <Icon className="inline h-2.5 w-2.5 mr-0.5" />
                          {p}
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize">
                          {msg.messageType === "direct_message" ? "dm" : msg.messageType}
                        </Badge>
                        {msg.status === "unread" && (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        )}
                        {(msg.status === "replied" || msg.status === "archived") && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Conversation Detail */}
        <div
          className={cn(
            "flex-1 flex flex-col",
            !selectedMessage && "hidden md:flex"
          )}
        >
          {!selectedMessage ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-3" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs">Choose a message from the list to view and reply</p>
            </div>
          ) : (
            <>
              {/* Conversation Header */}
              <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setSelectedMessage(null)}
                    aria-label="Back to messages"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedMessage.senderAvatar ?? undefined} />
                    <AvatarFallback>{(selectedMessage.senderName ?? "?").charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {selectedMessage.senderName ?? selectedMessage.senderUsername ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      via {toPlatform(selectedMessage.platform)} ({selectedMessage.socialAccountName ?? "workspace account"})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={markResolved} aria-label="Mark resolved">
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Thread */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {loadingDetail ? (
                  <div className="flex justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Original message */}
                    <div className="flex gap-3">
                      <div className="max-w-[75%] rounded-lg px-4 py-2 bg-muted">
                        <p className="text-xs font-medium mb-1">{selectedMessage.senderName ?? "Unknown"}</p>
                        <p className="text-sm">{selectedMessage.content}</p>
                        <p className="text-[10px] mt-1 opacity-70">{timeAgo(selectedMessage.receivedAt)}</p>
                      </div>
                    </div>
                    {/* Replies */}
                    {selectedMessage.replies?.map((reply) => (
                      <div key={reply.id} className="flex gap-3">
                        <div className="max-w-[75%] rounded-lg px-4 py-2 bg-primary text-primary-foreground">
                          <p className="text-xs font-medium mb-1">{reply.repliedByName ?? "You"}</p>
                          <p className="text-sm">{reply.content}</p>
                          <p className="text-[10px] mt-1 opacity-70">{timeAgo(reply.sentAt)}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Reply Area */}
              <div className="border-t p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Textarea
                      placeholder="Type your reply..."
                      className="min-h-[60px] resize-none pr-10"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                  </div>
                  <Button size="icon" disabled={!replyText.trim() || sendingReply} onClick={sendReply}>
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSavedReplies(!showSavedReplies)}
                    >
                      <CheckCheck className="h-3.5 w-3.5 mr-1" />
                      Saved Replies
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                    {showSavedReplies && (
                      <Card className="absolute bottom-full left-0 mb-1 w-72 z-10">
                        <CardContent className="p-2 space-y-1">
                          {savedReplies.map((reply, i) => (
                            <button
                              key={i}
                              className="w-full rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
                              onClick={() => {
                                setReplyText(reply);
                                setShowSavedReplies(false);
                              }}
                            >
                              {reply}
                            </button>
                          ))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                  <Separator orientation="vertical" className="h-5" />
                  <Button variant="ghost" size="sm" onClick={markResolved}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Mark Resolved
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
