import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { LoginForm } from "./login-form";

export async function authenticate(_prevState: string | undefined, formData: FormData) {
  "use server";

  try {
    await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid email or password.";
        default:
          return "Something went wrong. Please try again.";
      }
    }
    throw error;
  }
}

export async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function signInWithGithub() {
  "use server";
  await signIn("github", { redirectTo: "/dashboard" });
}

export default function LoginPage() {
  return <LoginForm authenticate={authenticate} googleAction={signInWithGoogle} githubAction={signInWithGithub} />;
}
