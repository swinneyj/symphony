import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clapperboard,
  Clock,
  FolderOpen,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Music2,
  PenSquare,
  Send,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/marketing/site-footer";

const platforms = [
  { name: "TikTok", icon: Clapperboard },
  { name: "YouTube", icon: PlayIcon },
  { name: "Instagram", icon: InstagramIcon },
  { name: "Facebook", icon: FacebookIcon },
  { name: "X (Twitter)", icon: XIcon },
  { name: "LinkedIn", icon: LinkedinIcon },
];

const features = [
  {
    icon: PenSquare,
    title: "Composer",
    description:
      "Write, schedule, and publish posts across every platform from a single composer. Tailor each post with platform-specific formatting.",
  },
  {
    icon: Wand2,
    title: "AI Studio",
    description:
      "Generate on-brand captions, hashtags, and content ideas in seconds with built-in AI assistance.",
  },
  {
    icon: Inbox,
    title: "Unified Inbox",
    description:
      "Every comment, message, and mention from all your networks in one inbox — respond without switching tabs.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description:
      "Track followers, engagement, and performance across accounts with clear, actionable reporting.",
  },
  {
    icon: CalendarDays,
    title: "Content Calendar",
    description:
      "Plan your entire month visually. Drag, drop, and schedule to keep your content pipeline moving.",
  },
  {
    icon: FolderOpen,
    title: "Media Library",
    description:
      "Store, organize, and reuse videos and images across all your content — ready when you are.",
  },
];

const steps = [
  {
    number: "01",
    title: "Connect your accounts",
    description:
      "Securely link your TikTok, YouTube, Instagram, Facebook, X, and LinkedIn accounts in a few clicks.",
  },
  {
    number: "02",
    title: "Create & schedule",
    description:
      "Draft posts with AI assistance, schedule them across platforms, and plan your calendar.",
  },
  {
    number: "03",
    title: "Engage & measure",
    description:
      "Reply from one inbox and watch your analytics grow with reports that actually make sense.",
  },
];

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ─── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/symphony-logo.jpg"
              alt="Symphony"
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
            />
            <span className="text-lg font-bold tracking-tight">Symphony</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="/#features" className="hover:text-foreground">
              Features
            </Link>
            <Link href="/#platforms" className="hover:text-foreground">
              Platforms
            </Link>
            <Link href="/#how-it-works" className="hover:text-foreground">
              How it works
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Hero ──────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-primary/5" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-6xl px-6 py-20 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                All-in-one social media management
              </div>
              <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
                Orchestrate your{" "}
                <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                  social presence
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                Schedule posts, manage your inbox, generate AI content, and
                analyze performance across TikTok, YouTube, Instagram,
                Facebook, X, and LinkedIn — all from one beautiful dashboard.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/register">
                    Get Started Free
                    <Send className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </div>

            {/* Product preview mock */}
            <div className="mx-auto mt-16 max-w-4xl">
              <div className="overflow-hidden rounded-xl border bg-card shadow-2xl">
                <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-3 text-xs text-muted-foreground">
                    Your Symphony workspace
                  </span>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-3">
                  <div className="rounded-lg border bg-background p-4 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <LayoutDashboard className="h-4 w-4 text-primary" />
                        Dashboard
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        Live
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {[
                        { label: "Scheduled Posts", value: "24", icon: Clock },
                        { label: "Inbox Messages", value: "12", icon: MessageSquare },
                        { label: "Connected Accounts", value: "6", icon: Users },
                        { label: "Total Followers", value: "45.2K", icon: BarChart3 },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-lg bg-muted/50 p-3">
                          <stat.icon className="h-4 w-4 text-primary" />
                          <p className="mt-2 text-xl font-bold">{stat.value}</p>
                          <p className="text-xs text-muted-foreground">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <PenSquare className="h-4 w-4 text-primary" />
                      Composer
                    </div>
                    <div className="mt-3 space-y-2">
                      {[
                        "Behind the scenes of our launch 🚀",
                        "New blog: social trends for 2026",
                        "We hit 10K followers! 🙏",
                      ].map((post) => (
                        <div key={post} className="rounded-lg bg-muted/50 p-2.5 text-xs">
                          <p className="line-clamp-1">{post}</p>
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            Scheduled
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Platforms ─────────────────────────────────────── */}
        <section id="platforms" className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <p className="text-center text-sm font-medium text-muted-foreground">
              One workspace for every platform you post to
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {platforms.map((platform) => (
                <div
                  key={platform.name}
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
                >
                  <platform.icon className="h-5 w-5" />
                  {platform.name}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Features ──────────────────────────────────────── */}
        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Everything your social team needs
              </h2>
              <p className="mt-4 text-muted-foreground">
                Stop juggling tabs and logins. Symphony brings publishing,
                engagement, and analytics into one workflow.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-xl border bg-card p-6 transition-shadow hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── How it works ──────────────────────────────────── */}
        <section id="how-it-works" className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Up and running in minutes
              </h2>
              <p className="mt-4 text-muted-foreground">
                From zero to fully scheduled in three simple steps.
              </p>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="relative rounded-xl border bg-card p-6">
                  <span className="text-sm font-bold text-primary">{step.number}</span>
                  <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────────────── */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-6">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-purple-600 px-8 py-14 text-center text-white">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(255,255,255,0.2),_transparent_60%)]" />
              <div className="relative">
                <Music2 className="mx-auto h-10 w-10" />
                <h2 className="mt-4 text-3xl font-bold tracking-tight">
                  Ready to hit your rhythm?
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-white/80">
                  Join Symphony and take control of your social media — free to
                  start, no credit card required.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Button size="lg" variant="secondary" asChild>
                    <Link href="/register">Create your account</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
