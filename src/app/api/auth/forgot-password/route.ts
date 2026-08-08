import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createResetToken, isDemoAccount } from "@/lib/reset-token";

const APP_URL = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = (body?.email as string | undefined)?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Always respond the same way whether or not the account exists,
    // to avoid leaking which emails are registered.
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return NextResponse.json({
        message: "If an account exists for that email, a reset link has been sent.",
      });
    }

    const token = createResetToken(user.id);
    const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

    // 1) Email delivery (Resend) when configured
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "Symphony <no-reply@symphonyapp.company>",
          to: email,
          subject: "Reset your Symphony password",
          html: `<p>Hi ${user.name || "there"},</p><p>We received a request to reset your Symphony password. Click the link below to choose a new one (valid for 1 hour):</p><p><a href="${resetUrl}">Reset my password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
        });
      } catch (err) {
        console.error("[forgot-password] Resend failed:", err);
      }
    } else {
      // 2) No mailer configured — log the link so it's recoverable in server logs
      console.log(`[forgot-password] RESET LINK for ${email}: ${resetUrl}`);
    }

    // 3) Demo accounts have no real mailbox — return the link directly so the
    //    flow remains fully testable without email infrastructure.
    if (isDemoAccount(email)) {
      return NextResponse.json({
        message: "Demo account reset link (no mailbox configured for @symphony.app accounts):",
        resetUrl,
      });
    }

    return NextResponse.json({
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Error in forgot-password:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
