import { handlers } from "@/lib/auth";

// Next.js 16 requires explicit handler signatures for catch-all routes
export const GET = handlers.GET as unknown as (
  req: Request,
  context: { params: Promise<Record<string, string[]>> }
) => Promise<Response>;

export const POST = handlers.POST as unknown as (
  req: Request,
  context: { params: Promise<Record<string, string[]>> }
) => Promise<Response>;
