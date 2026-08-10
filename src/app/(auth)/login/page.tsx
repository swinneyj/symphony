import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export async function authenticate(_prevState: string | undefined, formData: FormData) {
  "use server";

  try {
    // redirect:false + relative redirect() so the post-login bounce stays on
    // the CURRENT origin (preview) instead of resolving against AUTH_URL (prod).
    await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirect: false,
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
  redirect("/dashboard");
}

export async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirect: false });
  redirect("/dashboard");
}

export async function signInWithGithub() {
  "use server";
  await signIn("github", { redirect: false });
  redirect("/dashboard");
}

export default function LoginPage() {
  return <LoginForm authenticate={authenticate} googleAction={signInWithGoogle} githubAction={signInWithGithub} />;
}
