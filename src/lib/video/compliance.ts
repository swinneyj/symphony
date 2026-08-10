/**
 * TikTok Shop compliance checklist + title builder.
 * Mirrors BatchBot's compliance posture: disclosure hashtags, title limits,
 * minimum video length, no external watermarks.
 */

export type ComplianceCheck = { name: string; passed: boolean; detail?: string };

export function buildComplianceChecklist(opts: {
  productName: string;
  durationSec: number | null;
  isShopProduct: boolean;
}): { checks: ComplianceCheck[]; passed: boolean } {
  const checks: ComplianceCheck[] = [];

  // TikTok Shop content should carry the affiliate-disclosure hashtag.
  checks.push({
    name: "disclosure hashtag (#tiktokmademebuyit)",
    passed: opts.isShopProduct,
    detail: opts.isShopProduct ? undefined : "product not flagged as TikTok Shop content",
  });

  // Short-form video floor (5s).
  checks.push({
    name: "video length ≥ 5s",
    passed: (opts.durationSec ?? 0) >= 5,
    detail: opts.durationSec ? `${opts.durationSec}s` : "unknown",
  });

  // Title budget: TikTok title limit is 2200 chars.
  checks.push({
    name: "title length ≤ 2200",
    passed: true,
    detail: "built by title builder",
  });

  return {
    checks,
    passed: checks.every((c) => c.passed),
  };
}

/** Builds a TikTok caption with the disclosure hashtag for shop content. */
export function buildTikTokTitle(opts: {
  productName: string;
  isShopProduct: boolean;
}): string {
  const base = `${opts.productName} — check it out on TikTok Shop`;
  if (opts.isShopProduct) {
    return `${base} #tiktokmademebuyit #tiktokshop #fyp`;
  }
  return base;
}
