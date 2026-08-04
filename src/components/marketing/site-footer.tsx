import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <img
                src="/symphony-logo.jpg"
                alt="Symphony"
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
              />
              <span className="text-lg font-bold tracking-tight">Symphony</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Orchestrate your social presence. Schedule posts, manage your
              inbox, generate AI content, and analyze performance across every
              major platform — all in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold">Product</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/#features" className="hover:text-foreground">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/#platforms" className="hover:text-foreground">
                    Platforms
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="hover:text-foreground">
                    Get Started
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Account</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/login" className="hover:text-foreground">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="hover:text-foreground">
                    Create account
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Legal</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/terms" className="hover:text-foreground">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t pt-6 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Symphony. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
