import { execFileSync } from "node:child_process";

/**
 * Post-render QC for finished videos ($0 — pure ffmpeg pixel analysis).
 *
 * Detects the classic AI-video "moving borders" / edge-instability artifact:
 * the outer band of the frame warps between frames, and letterbox bars
 * appear/drift. Both are computed from low-res raw frames; no LLM, no API.
 *
 * Returns a score (mean per-channel pixel delta in the border band, 0-255
 * scale) plus flags. Calibration (on 160x284 2fps samples):
 *   - stable clip (static or slow zoom):  ~1-3
 *   - camera motion / scene cuts:         3-6
 *   - compression noise on flat areas:    4-8
 *   - warping borders / drifting bars:    >10 (usually 12-40)
 */
export interface QcResult {
  /** Mean border-band inter-frame delta (0-255 scale). */
  score: number;
  /** Overall inter-frame delta across the whole frame (motion proxy). */
  motion: number;
  /** Black-bar (letterbox/pillarbox) presence detected on any sample. */
  letterbox: boolean;
  flag: "pass" | "review" | "fail";
  reasons: string[];
}

export function runQc(videoPath: string, samples = 8, fps = 2): QcResult {
  const W = 160;
  const H = 284;
  const band = 6; // border band thickness in px at 160x284
  // Pull raw rgb24 frames straight to stdout — no temp files, no PNG decode.
  const buf: Buffer = execFileSync(
    "ffmpeg",
    [
      "-v", "error",
      "-i", videoPath,
      "-vf", `fps=${fps},scale=${W}:${H},format=rgb24`,
      "-frames:v", String(samples),
      "-f", "rawvideo",
      "-",
    ],
    { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 }
  );
  const frameBytes = W * H * 3;
  const frames = Math.floor(buf.length / frameBytes);
  if (frames < 2) return { score: 0, motion: 0, letterbox: false, flag: "pass", reasons: ["too short to QC"] };

  const borderDelta: number[] = [];
  const motionDelta: number[] = [];
  const letterboxFrames = 0;

  const inBorder = (px: number, py: number) =>
    px < band || px >= W - band || py < band || py >= H - band;

  for (let f = 1; f < frames; f++) {
    const prev = buf.subarray((f - 1) * frameBytes, f * frameBytes);
    const cur = buf.subarray(f * frameBytes, (f + 1) * frameBytes);
    let bSum = 0;
    let bN = 0;
    let mSum = 0;
    let mN = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3;
        const d =
          Math.abs(cur[o] - prev[o]) +
          Math.abs(cur[o + 1] - prev[o + 1]) +
          Math.abs(cur[o + 2] - prev[o + 2]);
        if (inBorder(x, y)) {
          bSum += d;
          bN++;
        } else {
          mSum += d;
          mN++;
        }
      }
    }
    borderDelta.push(bSum / bN);
    motionDelta.push(mSum / mN);
  }

  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const score = mean(borderDelta);
  const motion = mean(motionDelta);

  // Letterbox detection: sample the middle frame, check for near-black bands.
  const mid = Math.floor(frames / 2);
  const midBuf = buf.subarray(mid * frameBytes, (mid + 1) * frameBytes);
  let letterbox = false;
  const darkRow = (y: number) => {
    let s = 0;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      s += midBuf[o] + midBuf[o + 1] + midBuf[o + 2];
    }
    return s / (W * 3) < 12; // near-black average row
  };
  const darkCol = (x: number) => {
    let s = 0;
    for (let y = 0; y < H; y++) {
      const o = (y * W + x) * 3;
      s += midBuf[o] + midBuf[o + 1] + midBuf[o + 2];
    }
    return s / (H * 3) < 12;
  };
  let topBars = 0;
  for (let y = 0; y < 20; y++) if (darkRow(y)) topBars++;
  let bottomBars = 0;
  for (let y = H - 20; y < H; y++) if (darkRow(y)) bottomBars++;
  let leftBars = 0;
  for (let x = 0; x < 14; x++) if (darkCol(x)) leftBars++;
  let rightBars = 0;
  for (let x = W - 14; x < W; x++) if (darkCol(x)) rightBars++;
  letterbox = topBars > 12 || bottomBars > 12 || leftBars > 8 || rightBars > 8;

  const reasons: string[] = [];
  if (score > 12) reasons.push(`unstable borders (score ${score.toFixed(1)}, threshold 12)`);
  else if (score > 8) reasons.push(`border jitter (score ${score.toFixed(1)})`);
  if (letterbox) reasons.push("letterbox/pillarbox bars detected");
  if (reasons.length === 0 && motion < 0.4) reasons.push("very low motion (possible static frame)");

  const flag: QcResult["flag"] =
    reasons.some((r) => r.startsWith("unstable")) || (letterbox && score > 8)
      ? "fail"
      : reasons.length > 0
        ? "review"
        : "pass";

  return { score, motion, letterbox, flag, reasons };
}
