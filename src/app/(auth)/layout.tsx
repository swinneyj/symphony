import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      {/* Decorative gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-primary/5 to-transparent" />

      {/* Symphony branding */}
      <div className="relative z-10 mb-8 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <img
            src="/symphony-logo.jpg"
            alt="Symphony"
            width={40}
            height={40}
            className="h-10 w-10"
          />
          <h1 className="text-2xl font-bold tracking-tight">Symphony</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Orchestrate your social presence
        </p>
      </div>

      {/* Auth form card */}
      <div className="relative z-10 w-full max-w-md">{children}</div>

      {/* Footer */}
      <div className="relative z-10 mt-8 flex items-center gap-4 text-xs text-muted-foreground">
        <span>&copy; {new Date().getFullYear()} Symphony. All rights reserved.</span>
        <span className="text-border">|</span>
        <Link href="/terms" className="hover:text-foreground">
          Terms of Service
        </Link>
        <span className="text-border">|</span>
        <Link href="/privacy" className="hover:text-foreground">
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
