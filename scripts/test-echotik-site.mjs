/* Quick live test of echotik-site adapter — run with the decoded web token. */
import { fetchWinningProducts, searchProducts, fetchProductAnalytics, fetchProductVideos, fetchProductCreators, fetchSellerProducts } from "../src/lib/market/echotik-site";

process.env.ECHOTIK_WEB_TOKEN = process.env.TEST_TOKEN ?? "";

async function main() {
  if (!process.env.ECHOTIK_WEB_TOKEN) {
    console.error("Set TEST_TOKEN=<decoded echotik web token>");
    process.exit(1);
  }

  console.log("== 1. winners feed (week) ==");
  const winners = await fetchWinningProducts({ period: "week", region: "US", limit: 5 });
  for (const w of winners) {
    console.log(`  #${w.rank} ${w.name.slice(0, 40)} | $${w.priceMin} | sales30d=${w.sales30d} | gmv30d=${w.gmv30d} | vids=${w.videoCount} | ifl=${w.creatorCount} | comm=${w.commissionRate}`);
  }

  console.log("\n== 2. keyword search 'perfume' ==");
  const found = await searchProducts({ period: "day", region: "US", keyword: "perfume", limit: 5 });
  for (const f of found.slice(0, 3)) {
    console.log(`  ${f.name.slice(0, 50)} | $${f.priceMin} | sales30d=${f.sales30d}`);
  }

  const pid = winners[0]?.sourceProductId;
  if (!pid) { console.log("no product id — aborting detail tests"); return; }
  console.log(`\n== 3. detail for ${pid} ==`);
  const detail = await fetchProductAnalytics(pid);
  console.log(`  ${detail.name?.slice(0, 50)} | comm=${detail.commissionRate} | rating=${detail.rating} | reviews=${detail.reviewCount} | totalSales=${detail.totalSales} | totalGmv=${detail.totalGmv} | seller=${detail.sellerId}`);
  console.log(`  panorama periods: ${detail.panorama.map((p) => `${p.period}d(s=${p.sales},g=${p.gmv},v=${p.videoCnt},i=${p.influencers})`).join(" ")}`);

  console.log(`\n== 4. videos for ${pid} (Promote badges) ==`);
  const videos = await fetchProductVideos(pid, 10);
  for (const v of videos.slice(0, 5)) {
    console.log(`  ${v.creatorName ?? "?"} | ${v.description?.slice(0, 35) ?? "no-title"} | views=${v.views} | sales=${v.sales} | gmv=${v.gmv} | Promote=${v.isAd ? "✅" : "—"} | AI=${v.isAi ? "🤖" : "—"}`);
  }
  console.log(`  promoteCount=${videos.filter((v) => v.isAd).length}/${videos.length}`);

  console.log(`\n== 5. creators for ${pid} ==`);
  const creators = await fetchProductCreators(pid, 5);
  for (const c of creators.slice(0, 3)) {
    console.log(`  ${c.name} | followers=${c.followers} | eng=${c.engagementRate} | videos=${c.videoCount} | salesForProduct=${c.salesForProduct}`);
  }

  console.log(`\n== 6. seller products (brand drill-down) ==`);
  if (detail.sellerId) {
    const sellerProducts = await fetchSellerProducts(detail.sellerId, 5);
    for (const s of sellerProducts.slice(0, 3)) {
      console.log(`  ${s.name.slice(0, 45)} | $${s.priceMin} | sales30d=${s.sales30d} | gmv30d=${s.gmv30d}`);
    }
  }

  console.log("\nALL TESTS PASSED");
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message);
  process.exit(1);
});
