import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, verificationTokens } from "@/db/schema";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import TikTok from "next-auth/providers/tiktok";
import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Map the adapter to the app's plural tables (users/accounts/verification_tokens).
  // sessionsTable omitted: JWT strategy never touches it, and the app's sessions
  // table uses expiresAt (adapter expects expires).
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    // accounts columns are camelCase props (refreshToken/accessToken/…) — the
    // adapter's TYPE expects snake_case props, but its runtime reads camelCase
    // (accountsTable.providerAccountId) and spreads Auth.js's camelCase data,
    // so the cast is type-only. accounts.id gets its value via $defaultFn.
    accountsTable: accounts as any,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    // No /onboarding page exists — new users (OAuth) land on /dashboard, same
    // as the credentials register flow.
    newUser: "/dashboard",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        // In production, validate against DB with bcrypt
        const { db } = await import("@/db");
        const { users } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");

        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email as string),
        });

        if (!user || !user.passwordHash) return null;

        const bcrypt = await import("bcryptjs");
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google verifies emails — safe to auto-link an OAuth sign-in to the
      // existing email-matching account (otherwise OAuthAccountNotLinked).
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    TikTok({
      clientId: process.env.AUTH_TIKTOK_CLIENT_KEY!,
      clientSecret: process.env.AUTH_TIKTOK_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
