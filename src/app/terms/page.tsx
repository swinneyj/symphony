import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Terms of Service - Symphony",
  description:
    "The terms and conditions governing your use of the Symphony social media management platform.",
};

const sections = [
  {
    heading: "1. Acceptance of Terms",
    body: [
      "By accessing or using Symphony (the \"Service\"), you agree to be bound by these Terms of Service (\"Terms\") and our Privacy Policy. If you do not agree to these Terms, you may not access or use the Service.",
      "We may update these Terms from time to time. When we make material changes, we will notify you by email or through the Service. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.",
    ],
  },
  {
    heading: "2. The Service",
    body: [
      "Symphony is a social media management platform that allows you to connect your social media accounts, schedule and publish content, manage messages and comments, generate content with AI assistance, and review analytics across supported platforms, including TikTok, YouTube, Instagram, Facebook, X (Twitter), and LinkedIn.",
      "The Service is provided on a subscription basis. Features available to you depend on the plan you select and the connected accounts you authorize.",
    ],
  },
  {
    heading: "3. Accounts & Registration",
    body: [
      "To use the Service you must create an account with accurate, current, and complete information. You are responsible for safeguarding your password and for all activity that occurs under your account.",
      "You must be at least 13 years old to use the Service. If you use the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.",
      "You may connect third-party social media accounts to the Service. You are responsible for maintaining the permissions and authorizations for each connected account and for complying with the terms of service of each third-party platform.",
    ],
  },
  {
    heading: "4. Subscriptions & Payments",
    body: [
      "Certain features of the Service require a paid subscription. Subscription fees, billing cycles, and renewal terms will be presented to you before you purchase.",
      "Unless otherwise stated, subscriptions renew automatically at the end of each billing period until canceled. You may cancel at any time through your account settings; cancellation takes effect at the end of the current billing period and does not entitle you to a refund for the remainder of that period, except where required by law.",
      "All fees are non-refundable except as expressly stated in these Terms or required by applicable law.",
    ],
  },
  {
    heading: "5. Acceptable Use",
    body: [
      "You agree not to misuse the Service, including by:",
      "Using the Service to publish or distribute unlawful, infringing, defamatory, harassing, or otherwise objectionable content;",
      "Attempting to gain unauthorized access to the Service, other users' accounts, or connected third-party systems;",
      "Uploading malicious code, viruses, or other harmful materials;",
      "Using the Service to violate the terms of service of any connected third-party platform;",
      "Reselling, sublicensing, or providing the Service to third parties without our written consent;",
      "Interfering with or disrupting the integrity, performance, or availability of the Service.",
    ],
  },
  {
    heading: "6. Your Content",
    body: [
      "You retain all rights to the content you create, upload, or publish through the Service (\"Your Content\").",
      "You grant Symphony a limited, non-exclusive license to host, store, transmit, and display Your Content solely to operate and improve the Service.",
      "You represent that you own or have the necessary rights to Your Content and that Your Content does not infringe the rights of any third party.",
    ],
  },
  {
    heading: "7. AI-Generated Content",
    body: [
      "The Service may include AI-assisted features that generate or suggest content. AI-generated output is provided as a draft for your review and may be inaccurate, incomplete, or unsuitable for your purposes.",
      "You are solely responsible for reviewing, editing, and publishing any content generated with AI assistance, and for ensuring it complies with applicable law and platform policies.",
    ],
  },
  {
    heading: "8. Intellectual Property",
    body: [
      "The Service, including its software, design, trademarks, and branding, is owned by Symphony or its licensors and is protected by intellectual property laws.",
      "Subject to these Terms, we grant you a limited, non-exclusive, non-transferable license to use the Service for your personal or internal business purposes. You may not copy, modify, distribute, sell, or reverse engineer the Service except as permitted by law.",
    ],
  },
  {
    heading: "9. Third-Party Services",
    body: [
      "The Service integrates with third-party platforms (such as TikTok, YouTube, Instagram, Facebook, X, and LinkedIn) and may rely on third-party infrastructure providers (such as hosting, database, storage, and AI providers).",
      "We do not control these third-party services and are not responsible for their availability, terms, or practices. Your use of each connected platform remains subject to that platform's own terms and policies.",
    ],
  },
  {
    heading: "10. Termination",
    body: [
      "You may stop using the Service and close your account at any time from your account settings.",
      "We may suspend or terminate your access to the Service if you violate these Terms, if required by law, or to protect the security or integrity of the Service. Where reasonably possible, we will notify you in advance.",
      "Upon termination, your right to use the Service ends, and we may delete your data in accordance with our Privacy Policy.",
    ],
  },
  {
    heading: "11. Disclaimers",
    body: [
      "The Service is provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.",
      "We do not warrant that the Service will be uninterrupted, error-free, or secure, or that content published through the Service will perform as expected on third-party platforms.",
    ],
  },
  {
    heading: "12. Limitation of Liability",
    body: [
      "To the maximum extent permitted by law, Symphony and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill, arising out of or relating to your use of the Service.",
      "Our total aggregate liability arising out of or relating to these Terms or the Service shall not exceed the amounts you paid to us for the Service during the twelve (12) months preceding the claim.",
    ],
  },
  {
    heading: "13. Governing Law",
    body: [
      "These Terms are governed by the laws of the State of Nevada, United States, without regard to conflict of law principles. Any disputes arising under these Terms shall be resolved in the state or federal courts located in Clark County, Nevada.",
    ],
  },
  {
    heading: "14. Contact Us",
    body: [
      "If you have questions about these Terms, please contact us at justin.swinney88@gmail.com.",
    ],
  },
];

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: August 4, 2026
          </p>
          <p className="mt-6 text-muted-foreground">
            Welcome to Symphony. These Terms of Service govern your access to
            and use of the Symphony social media management platform.
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
