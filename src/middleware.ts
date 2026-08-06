export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/workspaces/:path*",
    "/inbox/:path*",
    "/media/:path*",
    "/settings/:path*",
    "/ai-studio/:path*",
    "/video-studio/:path*",
    "/analytics/:path*",
    "/calendar/:path*",
    "/composer/:path*",
  ],
};
