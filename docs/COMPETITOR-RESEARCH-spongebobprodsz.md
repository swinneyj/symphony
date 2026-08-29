# Competitor Research — @spongebobprodsz (Finds4dayz)

Research date: 2026-08-29 · Source: EchoTik site API (echotik.live) · Data: /opt/data/spongebob_products.json, /opt/data/spongebob_videos.json

## Profile

| Field | Value |
|---|---|
| handle | @spongebobprodsz |
| display | Finds4dayz |
| followers | 26,966 (26.97K) |
| likes | 127,350 |
| videos | 972 |
| total GMV | $487.56K |
| engagement rate | 0.00% — **flagged in EchoTik data** (likely bot/farm pattern) |
| verified | No (certificate_type 0, no cert) |
| MCN | — (none) |
| category | Other |
| own shop | **None** — seller search for both names returns zero. Pure AFFILIATE. |

## Catalog

809 products promoted (huge "finds" account — mass product affiliate). Top 10 by 30-day sales:

1. sacheu Lip Liner STAY-N — $14, 2.15M sales/30d, comm 20% (shop: SACHEU Beauty)
2. medicube PDRN Collagen Balm — $75, 1.09M, comm n/a (shop: medicube US Store)
3. tarte CC undereye corrector — $32, 777K, comm 15% (shop: Tarte Cosmetics)
4. MISSHA BB Cream — $14.90, 722K, comm 10%
5. ViXi Feminine Balance Gummies — $40, comm 30%
6. GOPURE Neck Cream — $50, comm 20%
7. Wellah Creatine — $18.50, comm 15%
8. Be Bodywise Hair Density Serum — $90, comm 30%
9. LeeFar Cutting Drink — $20.62, comm 25%
10. Remineralizing Gum — $45, comm 17%

## Per-video breakdown (product-level, top videos driving each product)

- sacheu Lip Liner: 25.38K views→$2.01M GMV (AAryN.MJ); 12.31M views→$888K (Zee, promote); 3.82M→$885K (International Betty); 13.46M→$875K (Zee, promote); 23.89M→$716K (nixairis)
- medicube PDRN Balm: 23.18M→$1.92M (NurseHaus); 12.19M→$989K (Chels, promote); 38.84M→$987K (NurseHaus, promote); 3.14M→$868K (Laura, promote); 10.11M→$898K (NurseHaus, promote)
- tarte CC corrector: 12.6M→$1.04M (Kellie Marie, promote); 15.75M→$893K (Michelle, promote); 19.27M→$633K (theraysfinds, promote); 31.73M→$545K (colleen); 13.53M→$520K (Jordan, promote)
- MISSHA BB: 21.15M→$502K (Jeselle, promote); 17.31M→$388K (kaylapdigital); 17.67M→$230K (GiniGlow); 6.23M→$180K (Gia Fey); 11.43M→$155K (gia)
- ViXi gummies: 1.1K→$783K (user38738589336); 3.48M→$307K (itskenlye.altum); 2.31K→$254K (Haley); 6.93M→$254K (Kayla); 14.17M→$205K (Shan)
- GOPURE Neck Cream: 22.51K→$1.78M (AAryN.MJ); 9.52M→$377K (Angela, promote); 8.34M→$313K (Beatriz)
- Wellah Creatine: 232K→$1.42M (Traveller); 833K→$1.04M (Callherrdaddy, promote); 431K→$308K (BUN BUN)
- Be Bodywise serum: 46.33K→$2.45M (user60558895464); 26.59M→$347K (Patrick, promote); 2.78M→$218K (Orlando)
- LeeFar Cutting: 3.39M→$134K (digital.ai.universe); 1.86M→$84K (brantdealz); 3.29M→$82K (turbo)
- Remineralizing Gum: 5.15M→$7.16M (ethansteethtips); 4.43M→$6.16M (ethansteethtips); 3.96M→$5.5M (ethansteethtips)

## Their OWN videos (vs. product-wide)

- Their own recent videos are tiny: top by sales = Dr.ville 8X Niacinamide (23 sales, $394 GMV, 3,150 views); Ulike Air 10 IPL ($296, 16K views); Dr.Althea 345 Relief Cream (3 sales, $156, 19K views). Nothing above ~$400 GMV per video.
- The huge per-product numbers above come from OTHER creators — they just ride trending products with low-effort posts.
- Note: influencer /videos endpoint ignores order_by — always sorts publish-date desc. To rank by views/sales must fetch pages and sort client-side, or use product-level /products/{id}/videos (which has no such quirk).

## Commission data — the real picture (verified live 2026-08-29, round 2)

- Leaderboard rows carry commission on **30–36%** of products.
- **Detail endpoint confirmed NOT a fix**: `/products/{id}` returns `commission: ""`
  for the same missing products — the data genuinely does not exist in EchoTik
  (their own site shows N/A). Hydrating the feed from detail = +11.7s latency and
  quota burn for 0 filled cells. **Do not retry this.**
- The **only** endpoint with near-full coverage is `/influencers/{id}/products`
  (**19/20 = 95%**), because commission lives on *affiliate/promotable* products,
  not on every best-seller. Feasible follow-up: when an influencer drill-down is
  open, use its rows to fill commission for those products. Out of scope for now.

## What's worth replicating (for Symphony)

1. **Catalog breadth**: 809 products — the "finds" model is mass affiliate on trending products. Not a replicable *earnings* model (their own GMV is small), but the *data* model is: product→videos→influencers drill-down is exactly what Market tab now ships.
2. **Commission data availability**: product lists DO carry commission (10–30%) for most of these — only some (medicube) show n/a. EchoTik web shows "—" for ~64% of top products, but the influencer-product endpoint has richer commission coverage. Worth re-checking if Market's commission column could hydrate from this endpoint.
3. **Promote (affiliate) videos dominate top-GMV per product** — is_promote=true shows up on most of the $500K+ videos. Promote badge already shipped in Market tab.
4. **Mid-tier creators drive the product's GMV** (NurseHaus 48K-ish, ethansteethtips) — not just mega-influencers. Good validation for the product drill-down feature: the top videos list is genuinely useful for choosing affiliate partners.
5. **0.00% engagement + no own shop + mass posts = automated/bot pattern**. Watch flagging: engagement_rate=0 is a spam signal we could surface in Market tab influencer view (small win, cheap).

## API notes (for future research)

- GET /influencers/{id}/products?page=&per_page= — catalog (meta.total = full count)
- GET /influencers/{id}/videos — publish-date desc only; order_by ignored; per-video sales/gmv in same units as product rows
- GET /products/{id}/videos?page=&per_page= — per-product creator videos w/ is_promote + is_ai_video
- GET /products/{id} — seller/shop object: { seller_id, seller_name }
- GET /search/sellers?keyword=&region=US — shop existence check
- Values are formatted strings ("2.15M", "$1.26M") — parse via existing parseNum in echotik-site.ts
