// Standalone test of downloadTikTokSource with cookie session handling.
import { writeFileSync } from "node:fs";

const TT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function downloadTikTokSource(url, outPath) {
  const headers = { "User-Agent": TT_UA, "Accept-Language": "en-US,en;q=0.9" };
  let cookieHeader = "";
  const sessionFetch = async (u, extra = {}) => {
    const res = await fetch(u, {
      headers: { ...headers, ...(cookieHeader ? { cookie: cookieHeader } : {}), ...extra },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length) {
      cookieHeader = setCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
      console.log("captured cookies:", setCookies.length);
    }
    return res;
  };

  const resp = await sessionFetch(url);
  if (!resp.ok) throw new Error(`tiktok page fetch failed: ${resp.status}`);
  console.log("final url:", resp.url);
  if (resp.url.includes("/view/product/")) throw new Error("product link");
  const m = resp.url.match(/\/video\/(\d+)/);
  if (!m) throw new Error(`no TikTok video id found at ${resp.url.slice(0, 120)}`);
  let page = await resp.text();
  console.log("page bytes:", page.length, "| has video id:", page.includes(m[1]));
  if (!page.includes(m[1])) {
    const r2 = await sessionFetch(resp.url);
    if (!r2.ok) throw new Error(`tiktok canonical fetch failed: ${r2.status}`);
    page = await r2.text();
  }
  const match = page.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error("no rehydration data (bot-walled?)");
  const data = JSON.parse(match[1]);
  const video = data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct?.video ?? {};
  const play = video.playAddr;
  let playUrl = null;
  if (typeof play === "string") playUrl = play;
  else if (play) playUrl = (play.urlList ?? play.url_list ?? [null])[0];
  console.log("playUrl:", playUrl ? playUrl.slice(0, 90) + "..." : null);
  if (!playUrl) throw new Error("no playable video URL");
  const vr = await fetch(playUrl, {
    headers: { ...headers, ...(cookieHeader ? { cookie: cookieHeader } : {}), Referer: "https://www.tiktok.com/" },
    signal: AbortSignal.timeout(90_000),
  });
  if (!vr.ok) throw new Error(`tiktok video fetch failed: ${vr.status} ${(await vr.text()).slice(0,120)}`);
  const buf = Buffer.from(await vr.arrayBuffer());
  console.log("video bytes:", buf.length);
  const isMp4 = buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp";
  console.log("is mp4 (ftyp):", isMp4);
  if (buf.length === 0) throw new Error("empty");
  writeFileSync(outPath, buf);
  console.log("saved:", outPath);
}

await downloadTikTokSource("https://www.tiktok.com/t/ZTDvYxb6x/", "/tmp/tt-test.mp4");
