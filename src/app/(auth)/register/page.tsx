import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { auth, signIn } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { RegisterForm } from "./register-form";

async function register(_prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  "use server";

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  // Validation
  if (!name || !email || !password || !confirmPassword) {
    return { error: "All fields are required." };
  }

  if (name.length < 2) {
    return { error: "Name must be at least 2 characters." };
  }

  if (!email.includes("@") || !email.includes(".")) {
    return { error: "Please enter a valid email address." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  // Check if user already exists
  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      return { error: "An account with this email already exists." };
    }
  } catch {
    return { error: "Something went wrong. Please try again." };
  }

  // Create user
  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const userId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      name,
      email: email.toLowerCase(),
      passwordHash,
    });
  } catch {
    return { error: "Failed to create account. Please try again." };
  }

  // Auto sign in after registration
  try {
    await signIn("credentials", {
      email: email.toLowerCase(),
      password,
      redirectTo: "/onboarding",
    });
  } catch (error) {
    // signIn throws on redirect, which is expected for success
    // AuthError would mean credentials failed somehow despite creating the user
    return { error: "Account created, but sign-in failed. Please try logging in." };
  }

  return { success: true };
}

export default function RegisterPage() {
  return <RegisterForm register={register} />;
}
