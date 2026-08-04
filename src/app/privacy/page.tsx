import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Privacy Policy - Symphony",
  description:
    "How Symphony collects, uses, and protects your personal information.",
};

const sections = [
  {
    heading: "1. Introduction",
    body: [
      "This Privacy Policy explains how Symphony (\"we\", \"us\", or \"our\") collects, uses, discloses, and protects your personal information when you use our social media management platform (the \"Service\").",
      "By using the Service, you consent to the practices described in this Privacy Policy. We encourage you to read this policy carefully.",
    ],
  },
  {
    heading: "2. Information We Collect",
    body: [
      "Account information: When you create an account, we collect your name, email address, and password (stored in encrypted form). If you sign in with a third-party provider such as Google or GitHub, we receive the basic profile information that provider shares with us.",
      "Connected social media accounts: When you connect a social media account (such as TikTok, YouTube, Instagram, Facebook, X, or LinkedIn), we collect the access tokens and account identifiers needed to provide the Service, along with account metadata such as your handle, profile name, and avatar.",
      "Content you create: We store the posts, drafts, captions, media files, comments, and messages you create or manage through the Service.",
      "Usage data: We automatically collect information about how you use the Service, including device type, browser, IP address, pages visited, and feature usage, to operate and improve the Service.",
    ],
  },
  {
    heading: "3. How We Use Your Information",
    body: [
      "We use your information to:",
      "Provide, operate, and maintain the Service, including scheduling and publishing your content and managing your unified inbox;",
      "Authenticate your account and keep the Service secure;",
      "Generate AI-assisted content drafts when you use AI features;",
      "Analyze and improve the Service, its features, and user experience;",
      "Send you service-related communications, such as account verification, security alerts, and billing notices;",
      "Respond to your support requests and inquiries.",
    ],
  },
  {
    heading: "4. How We Share Your Information",
    body: [
      "We do not sell your personal information. We share information only in the following circumstances:",
      "Service providers: We share data with trusted vendors that help us operate the Service, including hosting and database providers (such as Vercel and Neon), file storage providers, and AI providers that power our content-generation features. These providers process data only on our behalf.",
      "Connected platforms: Content you choose to publish or messages you choose to send are transmitted to the relevant social media platform in accordance with your actions and that platform's APIs.",
      "Legal requirements: We may disclose information when required by law, regulation, or legal process, or when we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.",
    ],
  },
  {
    heading: "5. Cookies & Similar Technologies",
    body: [
      "We use cookies and similar technologies to keep you signed in, remember your preferences, and understand how the Service is used. You can control cookies through your browser settings, but disabling them may affect the functionality of the Service.",
    ],
  },
  {
    heading: "6. Data Security",
    body: [
      "We take reasonable technical and organizational measures to protect your information, including encryption in transit and at rest, access controls, and secure credential handling. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "7. Data Retention",
    body: [
      "We retain your information for as long as your account is active and as needed to provide the Service, comply with legal obligations, resolve disputes, and enforce our agreements. When you close your account, we will delete or anonymize your data within a reasonable period, except where we are required to retain it by law.",
    ],
  },
  {
    heading: "8. Your Rights & Choices",
    body: [
      "You can access and update your account information at any time through your account settings.",
      "You can disconnect any connected social media account at any time, which stops our access to that account's data.",
      "You can request deletion of your account and personal data by contacting us; we will honor such requests subject to legal retention obligations.",
      "Depending on your jurisdiction (including the EU/UK under the GDPR and California under the CCPA), you may have additional rights, including the right to access, correct, delete, or port your personal information.",
    ],
  },
  {
    heading: "9. Children's Privacy",
    body: [
      "The Service is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, please contact us and we will delete it.",
    ],
  },
  {
    heading: "10. Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. When we make material changes, we will update the \"Last updated\" date at the top of this page and, where appropriate, notify you by email or through the Service.",
    ],
  },
  {
    heading: "11. Contact Us",
    body: [
      "If you have questions or concerns about this Privacy Policy or your personal data, please contact us at justin.swinney88@gmail.com.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/symphony-logo.jpg"
              alt="Symphony"
              width={28}
              height={28}
              className="h-7 w-7 rounded-full"
            />
            <span className="font-bold tracking-tight">Symphony</span>
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: August 4, 2026
          </p>
          <p className="mt-6 text-muted-foreground">
            Your privacy matters to us. This Privacy Policy describes how
            Symphony collects, uses, and protects your information.
          </p>

          <div className="mt-10 space-y-10">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-semibold tracking-tight">
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {section.body.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
