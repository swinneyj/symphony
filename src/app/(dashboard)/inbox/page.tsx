"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Filter,
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
  Inbox as InboxIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type Platform = "tiktok" | "youtube" | "instagram" | "facebook" | "x" | "linkedin";
type MessageType = "dm" | "comment" | "mention";
type MessageStatus = "unread" | "read" | "resolved";

interface Message {
  id: string;
  senderName: string;
  senderAvatar: string;
  platform: Platform;
  platformAccount: string;
  content: string;
  preview: string;
  time: string;
  type: MessageType;
  status: MessageStatus;
  thread: { sender: string; content: string; time: string }[];
}

interface AccountSource {
  id: string;
  name: string;
  handle: string;
  platform: Platform;
  unread: number;
  connected: boolean;
}

// ─── Data ───────────────────────────────────────────────────────────────────

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

const sources: AccountSource[] = [
  { id: "s1", name: "SEO Platform Official", handle: "@symphony", platform: "instagram", unread: 5, connected: true },
  { id: "s2", name: "SEO Platform", handle: "@symphonyapp", platform: "x", unread: 3, connected: true },
  { id: "s3", name: "SEO Platform", handle: "SEO Platform", platform: "youtube", unread: 1, connected: true },
  { id: "s4", name: "SEO Platform", handle: "@symphony", platform: "tiktok", unread: 2, connected: true },
  { id: "s5", name: "SEO Platform Inc.", handle: "SEO Platform Inc.", platform: "linkedin", unread: 0, connected: true },
  { id: "s6", name: "SEO Platform", handle: "SEO Platform", platform: "facebook", unread: 1, connected: true },
];

const messages: Message[] = [
  {
    id: "m1",
    senderName: "Sarah Johnson",
    senderAvatar: "",
    platform: "instagram",
    platformAccount: "@symphony",
    content: "Love this new feature! When will it be available for all users?",
    preview: "Love this new feature!",
    time: "2m ago",
    type: "comment",
    status: "unread",
    thread: [
      { sender: "Sarah Johnson", content: "Love this new feature! When will it be available for all users?", time: "2m ago" },
    ],
  },
  {
    id: "m2",
    senderName: "TechCrunch",
    senderAvatar: "",
    platform: "x",
    platformAccount: "@symphonyapp",
    content: "Hey! We'd love to feature your app in our next roundup of social media tools. Can you DM us details?",
    preview: "Hey! We'd love to feature your app...",
    time: "15m ago",
    type: "mention",
    status: "unread",
    thread: [
      { sender: "TechCrunch", content: "Hey! We'd love to feature your app in our next roundup of social media tools. Can you DM us details?", time: "15m ago" },
    ],
  },
  {
    id: "m3",
    senderName: "Mike Chen",
    senderAvatar: "",
    platform: "linkedin",
    platformAccount: "SEO Platform Inc.",
    content: "Great article on social media trends! I'd love to connect and learn more about your platform.",
    preview: "Great article on social media trends!",
    time: "1h ago",
    type: "dm",
    status: "read",
    thread: [
      { sender: "Mike Chen", content: "Great article on social media trends! I'd love to connect and learn more about your platform.", time: "1h ago" },
      { sender: "You", content: "Thanks Mike! Happy to connect. Let me know if you'd like a demo.", time: "45m ago" },
    ],
  },
  {
    id: "m4",
    senderName: "Emily Rodriguez",
    senderAvatar: "",
    platform: "tiktok",
    platformAccount: "@symphony",
    content: "This hack saved me so much time! More tips please! 🙌",
    preview: "This hack saved me so much time!",
    time: "3h ago",
    type: "comment",
    status: "read",
    thread: [
      { sender: "Emily Rodriguez", content: "This hack saved me so much time! More tips please! 🙌", time: "3h ago" },
      { sender: "You", content: "So glad it helped! We have more tips coming next week 🎉", time: "2h ago" },
      { sender: "Emily Rodriguez", content: "Can't wait! Following for more!", time: "1h ago" },
    ],
  },
  {
    id: "m5",
    senderName: "Alex Kim",
    senderAvatar: "",
    platform: "youtube",
    platformAccount: "SEO Platform",
    content: "Could you make a tutorial on the analytics dashboard? Having trouble understanding the engagement metrics.",
    preview: "Could you make a tutorial on the analytics dashboard?",
    time: "5h ago",
    type: "comment",
    status: "unread",
    thread: [
      { sender: "Alex Kim", content: "Could you make a tutorial on the analytics dashboard? Having trouble understanding the engagement metrics.", time: "5h ago" },
    ],
  },
  {
    id: "m6",
    senderName: "Jessica Williams",
    senderAvatar: "",
    platform: "facebook",
    platformAccount: "SEO Platform",
    content: "Is there a mobile app coming? Would love to manage on the go.",
    preview: "Is there a mobile app coming?",
    time: "1d ago",
    type: "dm",
    status: "resolved",
    thread: [
      { sender: "Jessica Williams", content: "Is there a mobile app coming? Would love to manage on the go.", time: "1d ago" },
      { sender: "You", content: "Yes! We're launching the mobile app next quarter. Stay tuned!", time: "20h ago" },
      { sender: "Jessica Williams", content: "Amazing, thanks!", time: "18h ago" },
    ],
  },
];

const messageTypes: { id: MessageType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dm", label: "DMs" },
  { id: "comment", label: "Comments" },
  { id: "mention", label: "Mentions" },
];

const statusFilters: { id: MessageStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
  { id: "resolved", label: "Resolved" },
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
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MessageType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MessageStatus | "all">("all");
  const [showSavedReplies, setShowSavedReplies] = useState(false);

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (selectedSource !== "all" && msg.platformAccount !== sources.find(s => s.id === selectedSource)?.handle) return false;
      if (typeFilter !== "all" && msg.type !== typeFilter) return false;
      if (statusFilter !== "all" && msg.status !== statusFilter) return false;
      if (searchQuery && !msg.content.toLowerCase().includes(searchQuery.toLowerCase()) && !msg.senderName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [selectedSource, typeFilter, statusFilter, searchQuery]);

  const totalUnread = useMemo(() => messages.filter(m => m.status === "unread").length, []);

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
                onClick={() => setTypeFilter(t.id)}
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
                onClick={() => setStatusFilter(s.id)}
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
        <div className="w-64 shrink-0 border-r overflow-y-auto p-3">
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
                    <p className="truncate text-[10px] text-muted-foreground">{source.handle}</p>
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
        <div className="w-96 shrink-0 border-r overflow-y-auto">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2" />
              <p className="text-sm">No messages found</p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const Icon = platformIcons[msg.platform];
              return (
                <button
                  key={msg.id}
                  onClick={() => setSelectedMessage(msg)}
                  className={cn(
                    "w-full border-b px-4 py-3 text-left transition-colors hover:bg-accent/50",
                    selectedMessage?.id === msg.id && "bg-accent",
                    msg.status === "unread" && "bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={msg.senderAvatar} />
                      <AvatarFallback className="text-xs">
                        {msg.senderName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className={cn("text-sm", msg.status === "unread" && "font-semibold")}>
                          {msg.senderName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{msg.preview}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium", platformBadgeColors[msg.platform])}>
                          <Icon className="inline h-2.5 w-2.5 mr-0.5" />
                          {msg.platform}
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize">
                          {msg.type}
                        </Badge>
                        {msg.status === "unread" && (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        )}
                        {msg.status === "resolved" && (
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
        <div className="flex-1 flex flex-col">
          {!selectedMessage ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-3" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs">Choose a message from the list to view and reply</p>
            </div>
          ) : (
            <>
              {/* Conversation Header */}
              <div className="flex items-center justify-between border-b px-6 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedMessage.senderAvatar} />
                    <AvatarFallback>{selectedMessage.senderName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{selectedMessage.senderName}</p>
                    <p className="text-xs text-muted-foreground">
                      via {selectedMessage.platform} ({selectedMessage.platformAccount})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon">
                    <Tag className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Thread */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {selectedMessage.thread.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      msg.sender === "You" && "flex-row-reverse"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-4 py-2",
                        msg.sender === "You"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <p className="text-xs font-medium mb-1">
                        {msg.sender === "You" ? "You" : msg.sender}
                      </p>
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-[10px] mt-1 opacity-70">{msg.time}</p>
                    </div>
                  </div>
                ))}
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
                  <Button size="icon" disabled={!replyText}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
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
                  <Button variant="ghost" size="sm">
                    <UserPlus className="h-3.5 w-3.5 mr-1" />
                    Assign
                  </Button>
                  <Button variant="ghost" size="sm">
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
