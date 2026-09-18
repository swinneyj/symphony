"use client";

// OverlayComposer — shared CapCut-style text-overlay editor.
//
// Single source of truth for the OverlayBox model + the WYSIWYG canvas that
// renders 1:1 with what video-worker's drawtext burns. Used by:
//   - Formula run view (video-studio/formulas/[id])      — P1 consumer
//   - Image Studio assembly (image-studio-tab.tsx)       — P4 consumer
//
// The canvas shows the actual product footage/image under the text when one
// is available (underlayUrl), else the classic checkerboard. A timeline under
// the canvas gives each text block a start/end window with a scrubbing
// playhead. Blocks carry optional startSec/endSec (default = full clip);
// the render path ignores timing until P2 wires drawtext enable=between, so
// this ships zero-risk.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Pause,
  Play,
  Plus,
  X,
} from "lucide-react";

// ─── Shared overlay model (exported — single source of truth) ─────────────

export type OverlayFont = "tiktok" | "snapchat" | "anton" | "montserrat" | "poppins" | "bebas";
export type OverlayTreatment = "outline" | "inverse" | "box" | "box-inverse" | "plain";
export type OverlayAlignment = "left" | "center" | "right";

/** Per-line overlay box — position (canvas fractions, box center) plus the
 *  style burned into the final video (font + background color), plus the
 *  optional timeline window (seconds into the clip; default = full clip). */
export interface OverlayBox {
  x: number;
  y: number;
  fontColor?: string; // hex #RRGGBB — default white
  bgColor?: string; // hex #RRGGBB — default black
  bgOpacity?: number; // 0..1 — 0 = transparent (no box)
  fontSize?: number; // px at output resolution — undefined = global Style size
  fontFamily?: OverlayFont;
  treatment?: OverlayTreatment;
  textAlign?: OverlayAlignment;
  width?: number; // canvas fraction
  height?: number; // canvas fraction
  startSec?: number; // timeline window start (default 0)
  endSec?: number; // timeline window end (default = clip duration)
}

export const defaultOverlayBox = (y: number): OverlayBox => ({
  x: 0.5,
  y,
  fontColor: "#ffffff",
  bgColor: "#000000",
  bgOpacity: 1,
  fontFamily: "tiktok",
  treatment: "outline",
  textAlign: "center",
  width: 0.8,
  height: 0.16,
});

export const OVERLAY_PRESETS = [
  ["POV Relief Hook", "POV: you finally stop overcomplicating this."],
  ["Things I Wish I Knew", "Things I wish I knew before I wasted so much time."],
  ["Nobody Tells You", "Nobody tells you this part until you are already in it."],
  ["Lazy Version", "The lazy version that still gets the result."],
  ["Save This", "Save this before you need it later."],
  ["Quiet Upgrade", "A quiet upgrade that made everything feel easier."],
  ["Seven Day Test", "I tried this for 7 days and the difference was obvious."],
  ["Tiny Rule", "One tiny rule that changed the whole routine."],
  ["Stop Doing This", "Stop doing this if you want the process to feel lighter."],
  ["Hidden Bottleneck", "The hidden bottleneck was not motivation. It was setup."],
  ["Before You Buy", "Before you buy anything else, fix this first."],
  ["Main Character Reset", "A main character reset, but actually practical."],
] as const;

export const OVERLAY_COLORS = [
  "#ffffff",
  "#000000",
  "#3797f0",
  "#70c050",
  "#fdcb5c",
  "#fd8d32",
  "#ed4956",
  "#d10869",
  "#a307ba",
] as const;
export const OVERLAY_EMOJIS = ["🔥", "✨", "😍", "😱", "🚀", "💥", "✅", "🛍️", "🎉", "⚡", "❤️", "😂"];

export const OVERLAY_FONTS: Array<{ value: OverlayFont; label: string; group: string }> = [
  { value: "tiktok", label: "TikTok Sans", group: "Batchbot" },
  { value: "snapchat", label: "Snapchat Caption (Inter)", group: "Batchbot" },
  { value: "anton", label: "Anton", group: "Sales-focused" },
  { value: "montserrat", label: "Montserrat ExtraBold", group: "Sales-focused" },
  { value: "poppins", label: "Poppins ExtraBold", group: "Sales-focused" },
  { value: "bebas", label: "Bebas Neue", group: "Sales-focused" },
];

export const FONT_STACKS: Record<OverlayFont, string> = {
  tiktok: '"TikTok Sans", "TikTok Sans Render", Arial, sans-serif',
  snapchat: '"Snap Caption Inter", Inter, Arial, sans-serif',
  anton: "Anton, Impact, sans-serif",
  montserrat: "Montserrat, Arial, sans-serif",
  poppins: "Poppins, Arial, sans-serif",
  bebas: '"Bebas Neue", Impact, sans-serif',
};

const TREATMENT_ORDER: OverlayTreatment[] = ["outline", "inverse", "box", "box-inverse"];

/** Composition grid the boxes snap to: rule-of-thirds lines + exact center. */
const SNAP_GRID = [1 / 3, 1 / 2, 2 / 3];
const SNAP_THRESHOLD = 0.04;
const snapAxis = (v: number): number => {
  for (const g of SNAP_GRID) {
    if (Math.abs(v - g) <= SNAP_THRESHOLD) return g;
  }
  return v;
};

/** "#RRGGBB" + opacity 0..1 → "rgba(r,g,b,a)" for the editor preview. */
const hexToRgba = (hex: string, opacity: number): string => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${opacity})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
};

const fmtSec = (s: number): string => `${s.toFixed(1)}s`;

// ─── Component props ───────────────────────────────────────────────────────

export interface OverlayComposerProps {
  lines: string[];
  boxes: OverlayBox[];
  selected: number;
  /** Global Style size (px at output res) — per-box fontSize wins when set. */
  fontSize: number;
  /** Clip length in seconds — timeline axis + default full-clip window. */
  durationSec: number;
  /** Underlay shown behind the text: footage video, product image, or none
   *  (checkerboard). The page owns the choice; composer renders it. */
  underlayUrl?: string | null;
  underlayKind?: "video" | "image";
  onLinesChange: (next: string[]) => void;
  onBoxesChange: (next: OverlayBox[]) => void;
  onSelectedChange: (i: number) => void;
  onFontSizeChange: (v: number) => void;
}

/** Minimal drag state shared by canvas drag + timeline handle drags. */
type DragKind = "move" | "resize" | "playhead" | "start" | "end" | null;

// ─── Component ─────────────────────────────────────────────────────────────

export function OverlayComposer({
  lines,
  boxes,
  selected,
  fontSize,
  durationSec,
  underlayUrl,
  underlayKind = "image",
  onLinesChange,
  onBoxesChange,
  onSelectedChange,
  onFontSizeChange,
}: OverlayComposerProps) {
  const dragRef = useRef<{ kind: DragKind; index: number }>({ kind: null, index: -1 });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Playhead position in seconds; 0 = start. Pure UI in P1. */
  const [playheadSec, setPlayheadSec] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);

  // Editor canvas preview scale. The burn uses raw px font sizes; the canvas
  // is a compact approximation of the frame — a constant 1/3 keeps the default
  // boxes at BatchBot's modest start look instead of blowing up the small
  // preview (72px default → ~24px on canvas, matching Batchbot Overlay Studio).
  const canvasScale = 1 / 3;
  const activeOverlayBox = boxes[selected] ?? defaultOverlayBox(0.12);

  /** Preset whose text matches the selected line (derived — no state sync bugs). */
  const selectedPreset =
    OVERLAY_PRESETS.find((preset) => preset[1] === (lines[selected] ?? ""))?.[0] ?? "Custom";

  const updateSelectedOverlayBox = (patch: Partial<OverlayBox>) => {
    onBoxesChange(
      boxes.map((b, i) => (i === selected ? { ...(b ?? defaultOverlayBox(0.12)), ...patch } : b))
    );
  };

  const setLineAt = (i: number, text: string) => {
    onLinesChange(lines.map((l, j) => (j === i ? text : l)));
  };

  const addText = () => {
    const index = lines.length;
    onLinesChange([...lines, ""]);
    onBoxesChange([...boxes, defaultOverlayBox(Math.min(0.84, 0.12 + boxes.length * 0.14))]);
    onSelectedChange(index);
  };

  const removeText = (i: number) => {
    onLinesChange(lines.filter((_, j) => j !== i));
    onBoxesChange(boxes.filter((_, j) => j !== i));
    onSelectedChange(Math.max(0, i - 1));
  };

  // Boxes may be shorter than lines after legacy loads — never index past end.
  const boxAt = (i: number): OverlayBox => boxes[i] ?? defaultOverlayBox(0.12 + i * 0.14);

  // ── Timeline window helpers ──
  const clampTime = (t: number) => Math.min(durationSec, Math.max(0, t));
  const windowOf = (b: OverlayBox) => ({
    start: clampTime(b.startSec ?? 0),
    end: clampTime(b.endSec ?? durationSec),
  });
  const hasCustomWindow = (b: OverlayBox) =>
    b.startSec != null && b.startSec > 0.05 || b.endSec != null && b.endSec < durationSec - 0.05;
  const inWindow = (b: OverlayBox, t: number) => {
    const w = windowOf(b);
    return t >= w.start && t <= w.end;
  };

  /** Pointer → seconds on the timeline. */
  const timeFromEvent = (clientX: number): number | null => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return clampTime(((clientX - rect.left) / rect.width) * durationSec);
  };

  const onTimelinePointerDown = (e: React.PointerEvent) => {
    if (e.target instanceof Element && e.target.closest("[data-handle], [data-lane]")) return; // handles + lane buttons handle themselves
    const t = timeFromEvent(e.clientX);
    if (t == null) return;
    movePlayhead(t);
    dragRef.current = { kind: "playhead", index: -1 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onTimelinePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag.kind !== "playhead") return;
    const t = timeFromEvent(e.clientX);
    if (t != null) movePlayhead(t);
  };

  const endDrag = () => {
    dragRef.current = { kind: null, index: -1 };
  };

  /** Seek the underlay video to a time (footage underlay only). */
  const seekVideo = (t: number) => {
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration) && v.duration > 0) {
      v.currentTime = Math.min(t, v.duration);
    }
  };

  /** User scrubbed the playhead → move video + text dimming together. */
  const movePlayhead = (t: number, seek = true) => {
    setPlayheadSec(t);
    if (seek && underlayKind === "video") seekVideo(t);
  };

  // Footage underlay: keep playhead in sync with actual playback.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setPlayheadSec(v.currentTime);
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [underlayKind]);

  /** Drag a selected block's start/end handle (kind = "start" | "end"). */
  const onWindowHandlePointerDown = (e: React.PointerEvent, kind: "start" | "end", i: number) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectedChange(i);
    dragRef.current = { kind, index: i };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onWindowHandlePointerMove = (e: React.PointerEvent, kind: "start" | "end", i: number) => {
    const drag = dragRef.current;
    if (drag.kind !== kind || drag.index !== i) return;
    const t = timeFromEvent(e.clientX);
    if (t == null) return;
    const current = boxAt(i);
    const w = windowOf(current);
    const box = { ...current };
    if (kind === "start") {
      box.startSec = clampTime(Math.min(t, w.end - 0.2));
      if (box.endSec == null) box.endSec = durationSec;
    } else {
      box.endSec = clampTime(Math.max(t, w.start + 0.2));
      if (box.startSec == null) box.startSec = 0;
    }
    onBoxesChange(boxes.map((b, j) => (j === i ? box : b)));
  };

  const resetWindow = (i: number) => {
    const box = boxAt(i);
    const rest: OverlayBox = {
      x: box.x,
      y: box.y,
      fontColor: box.fontColor,
      bgColor: box.bgColor,
      bgOpacity: box.bgOpacity,
      fontSize: box.fontSize,
      fontFamily: box.fontFamily,
      treatment: box.treatment,
      textAlign: box.textAlign,
      width: box.width,
      height: box.height,
    };
    onBoxesChange(boxes.map((b, j) => (j === i ? { ...rest } : b)));
  };

  // ── Timeline lanes data ──
  const lanes = useMemo(
    () =>
      lines.map((line, i) => {
        const w = windowOf(boxAt(i));
        return { i, line, start: w.start, end: w.end, custom: hasCustomWindow(boxAt(i)) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, boxes, durationSec]
  );

  const currentTime = fmtSec(playheadSec);
  const totalTime = fmtSec(durationSec);

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
      {/* ── Left: canvas + timeline ── */}
      <div className="mx-auto w-full max-w-[15rem]">
        <div
          ref={canvasRef}
          data-testid="overlay-canvas"
          className={`relative aspect-[9/16] w-full overflow-hidden rounded-[14px] border border-slate-900/10 select-none ${
            underlayUrl ? "bg-black" : "bg-[#bcc4cd]"
          } shadow-[0_10px_32px_rgba(16,24,40,0.20)]`}
          style={
            underlayUrl
              ? undefined
              : {
                  backgroundImage:
                    "repeating-conic-gradient(#9aa4b1 0% 25%, #bcc4cd 0% 50%)",
                  backgroundSize: "16px 16px",
                }
          }
        >
          {underlayUrl &&
            (underlayKind === "video" ? (
              // Footage underlay: real product video, muted, looped. Playhead
              // scrubbing seeks it so text placement is judged on real frames.
              <video
                ref={videoRef}
                src={underlayUrl}
                muted
                loop
                playsInline
                preload="metadata"
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                data-testid="overlay-underlay-video"
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
              />
            ) : (
              // Product image underlay — closer to the final frame than a
              // checkerboard; object-contain so the whole product stays visible.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={underlayUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                data-testid="overlay-underlay-image"
              />
            ))}

          {lines.map((line, i) => {
            const b = boxAt(i);
            const treatment = b.treatment ?? "outline";
            const isSelected = selected === i;
            const isInverse = treatment === "inverse" || treatment === "box-inverse";
            const isBox = treatment === "box" || treatment === "box-inverse";
            const fill = isInverse ? "#000000" : (b.fontColor ?? "#ffffff");
            const stroke =
              treatment === "outline" ? "#000000" : treatment === "inverse" ? "#ffffff" : "transparent";
            const background =
              treatment === "box"
                ? hexToRgba(b.bgColor ?? "#000000", b.bgOpacity ?? 1)
                : treatment === "box-inverse"
                  ? hexToRgba("#ffffff", b.bgOpacity ?? 1)
                  : "transparent";
            const boxFontSize = Math.max(8, Math.round((b.fontSize ?? fontSize) * canvasScale));
            const width = b.width ?? 0.8;
            const height = b.height ?? 0.16;
            // Dim only once the playhead leaves 0 — at rest the canvas shows
            // every block at full strength (P1 still burns full-clip).
            const dimmed = playheadSec > 0.05 && !inWindow(b, playheadSec);

            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`Text ${i + 1}: ${line || "empty"}`}
                className={`absolute z-10 flex touch-none cursor-grab items-center px-2 py-1 transition-opacity active:cursor-grabbing ${
                  isSelected ? "border border-[#0d99ff] ring-2 ring-[#0d99ff]/30" : "border border-transparent"
                } ${dimmed ? "opacity-30" : ""}`}
                style={{
                  left: `${(b.x - width / 2) * 100}%`,
                  top: `${(b.y - height / 2) * 100}%`,
                  width: `${width * 100}%`,
                  height: `${height * 100}%`,
                  justifyContent:
                    b.textAlign === "left" ? "flex-start" : b.textAlign === "right" ? "flex-end" : "center",
                  textAlign: b.textAlign ?? "center",
                  fontFamily: FONT_STACKS[b.fontFamily ?? "tiktok"],
                  fontSize: boxFontSize,
                  lineHeight: b.fontFamily === "snapchat" ? 1.18 : 1.2,
                  fontWeight: b.fontFamily === "snapchat" ? 500 : 700,
                  WebkitFontSmoothing: "antialiased",
                  color: fill,
                  WebkitTextStroke: treatment === "plain" || isBox ? "0" : `1.5px ${stroke}`,
                }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  e.preventDefault();
                  onSelectedChange(i);
                  dragRef.current = { kind: "move", index: i };
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (dragRef.current.kind !== "move" || dragRef.current.index !== i) return;
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const rawX = (e.clientX - rect.left) / rect.width;
                  const rawY = (e.clientY - rect.top) / rect.height;
                  const x = Math.min(0.95, Math.max(0.05, snapAxis(rawX)));
                  const y = Math.min(0.92, Math.max(0.05, snapAxis(rawY)));
                  onBoxesChange(boxes.map((bb, j) => (j === i ? { ...bb, x, y } : bb)));
                }}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span
                  className="block max-h-full max-w-full overflow-hidden whitespace-pre-line break-words rounded px-1.5 py-0.5"
                  style={{ background }}
                >
                  {line || "Overlay text..."}
                </span>
                {lines.length > 1 && isSelected && (
                  <button
                    type="button"
                    aria-label={`Remove Text ${i + 1}`}
                    className="absolute -right-2 -top-2 rounded-full bg-slate-800 p-0.5 text-white shadow"
                    onClick={() => removeText(i)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                {isSelected && (
                  <span
                    role="slider"
                    aria-label={`Resize Text ${i + 1}`}
                    aria-valuemin={20}
                    aria-valuemax={92}
                    aria-valuenow={Math.round(width * 100)}
                    className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-se-resize rounded-full border-2 border-white bg-[#0d99ff] shadow"
                    style={{ touchAction: "none" }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dragRef.current = { kind: "resize", index: i };
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (dragRef.current.kind !== "resize" || dragRef.current.index !== i) return;
                      const rect = canvasRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const box = boxAt(i);
                      const pointerX = (e.clientX - rect.left) / rect.width;
                      const pointerY = (e.clientY - rect.top) / rect.height;
                      const nextWidth = Math.min(0.92, Math.max(0.2, Math.abs(pointerX - box.x) * 2));
                      const nextHeight = Math.min(0.5, Math.max(0.08, Math.abs(pointerY - box.y) * 2));
                      onBoxesChange(
                        boxes.map((bb, j) =>
                          j === i ? { ...bb, width: nextWidth, height: nextHeight } : bb
                        )
                      );
                    }}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex justify-center">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-full border bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            onClick={addText}
          >
            <Plus className="h-3.5 w-3.5" /> Add text
          </button>
        </div>

        {/* ── Transport (footage underlay only) ── */}
        {underlayKind === "video" && underlayUrl && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label={videoPlaying ? "Pause preview" : "Play preview"}
              data-testid="overlay-play-toggle"
              className="inline-flex h-7 items-center gap-1 rounded-full bg-slate-900 px-3 text-xs font-medium text-white transition hover:bg-slate-700"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                if (videoPlaying) {
                  v.pause();
                } else {
                  // Keep text placement honest: if the playhead sits past the
                  // end of a finished loop, restart from the playhead position.
                  if (Number.isFinite(v.duration) && v.duration > 0 && v.currentTime >= v.duration - 0.05) {
                    v.currentTime = playheadSec;
                  }
                  void v.play();
                }
              }}
            >
              {videoPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {videoPlaying ? "Pause" : "Play"}
            </button>
            <span className="text-[10px] text-slate-400">Previewing your footage</span>
          </div>
        )}

        {/* ── Timeline: per-text windows + playhead ── */}
        <div
          ref={timelineRef}
          data-testid="overlay-timeline"
          className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-2 py-2 select-none"
          onPointerDown={onTimelinePointerDown}
          onPointerMove={onTimelinePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
            <span className="font-mono">{currentTime}</span>
            <span className="font-mono">{totalTime}</span>
          </div>
          {/* Lane rows */}
          <div className="relative mt-1 space-y-1">
            {/* playhead line spans the lane stack */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-[#0d99ff]"
              style={{ left: `${(playheadSec / Math.max(durationSec, 0.1)) * 100}%` }}
            />
            {lanes.length === 0 && (
              <div className="h-5 rounded border border-dashed border-slate-300" />
            )}
            {lanes.map(({ i, line, start, end, custom }) => {
              const isSelected = selected === i;
              const leftPct = (start / Math.max(durationSec, 0.1)) * 100;
              const widthPct = Math.max(0.5, ((end - start) / Math.max(durationSec, 0.1)) * 100);
              return (
                <div key={i} className="relative h-5">
                  <button
                    type="button"
                    data-lane
                    aria-label={`Timeline window Text ${i + 1}`}
                    onClick={() => onSelectedChange(i)}
                    className={`absolute h-5 overflow-hidden rounded-md border text-left text-[9px] font-semibold leading-5 transition-colors ${
                      isSelected
                        ? "border-[#0d99ff] bg-[#0d99ff]/15 text-[#0d99ff]"
                        : "border-slate-300 bg-slate-100 text-slate-500 hover:border-slate-400"
                    }`}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  >
                    <span className="truncate px-1.5">T{i + 1} {line || ""}</span>
                  </button>

                  {/* Window handles on the selected lane */}
                  {isSelected && (
                    <>
                      <span
                        data-handle
                        role="slider"
                        aria-label={`Text ${i + 1} start time`}
                        aria-valuemin={0}
                        aria-valuemax={durationSec}
                        aria-valuenow={Math.round(start * 10) / 10}
                        className="absolute top-0 z-30 -ml-1 h-5 w-2 cursor-ew-resize rounded-sm bg-[#0d99ff]"
                        style={{ left: `${leftPct}%`, touchAction: "none" }}
                        onPointerDown={(e) => onWindowHandlePointerDown(e, "start", i)}
                        onPointerMove={(e) => onWindowHandlePointerMove(e, "start", i)}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      />
                      <span
                        data-handle
                        role="slider"
                        aria-label={`Text ${i + 1} end time`}
                        aria-valuemin={0}
                        aria-valuemax={durationSec}
                        aria-valuenow={Math.round(end * 10) / 10}
                        className="absolute top-0 z-30 -ml-1 h-5 w-2 cursor-ew-resize rounded-sm bg-[#0d99ff]"
                        style={{ left: `${Math.min(100, leftPct + widthPct)}%`, touchAction: "none" }}
                        onPointerDown={(e) => onWindowHandlePointerDown(e, "end", i)}
                        onPointerMove={(e) => onWindowHandlePointerMove(e, "end", i)}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      />
                    </>
                  )}
                  {isSelected && custom && (
                    <button
                      type="button"
                      title="Reset to full clip"
                      aria-label={`Reset Text ${i + 1} to full clip`}
                      className="absolute -right-1 -top-2 z-30 grid h-4 w-4 place-items-center rounded-full border border-slate-300 bg-white text-slate-400 hover:text-slate-700"
                      onClick={() => resetWindow(i)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {lanes.some((l) => l.custom) && (
            <p className="mt-1.5 text-[9px] leading-tight text-slate-400">
              Window set — full-clip burn until timed rendering ships.
            </p>
          )}
        </div>
      </div>

      {/* ── Right: text input + style rail ── */}
      <div className="min-w-0 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Text input</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={selectedPreset === "Custom"}
              className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
                selectedPreset === "Custom"
                  ? "border-blue-500 bg-blue-50 text-blue-600"
                  : "bg-white text-slate-500 hover:text-blue-600"
              }`}
              onClick={() => onSelectedChange(selected)}
            >
              Custom
            </button>
            {OVERLAY_PRESETS.map(([label, text]) => (
              <button
                key={label}
                type="button"
                aria-pressed={selectedPreset === label}
                title={`TikTok Text Overlays: ${label}`}
                className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
                  selectedPreset === label
                    ? "border-blue-500 bg-blue-50 text-blue-600"
                    : "bg-white text-slate-500 hover:text-blue-600"
                }`}
                onClick={() => {
                  setLineAt(selected, text);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            value={lines[selected] ?? ""}
            onChange={(e) => setLineAt(selected, e.target.value)}
            placeholder="Overlay text..."
            className="mt-1.5 min-h-24 w-full resize-y rounded-[10px] border bg-white px-3 py-3 text-sm leading-relaxed text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium text-slate-500">Emojis</span>
            {OVERLAY_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Add ${emoji}`}
                className="grid h-8 w-8 place-items-center rounded-md border bg-white text-base hover:bg-blue-50"
                onClick={() => setLineAt(selected, `${lines[selected] ?? ""}${emoji}`)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </label>

        <div className="space-y-3 rounded-xl border bg-slate-50/60 p-3">
          <span className="text-xs font-semibold text-slate-700">Style</span>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-white">
            <button
              type="button"
              aria-pressed={(activeOverlayBox.fontFamily ?? "tiktok") !== "snapchat"}
              className={`h-9 text-xs font-medium ${
                (activeOverlayBox.fontFamily ?? "tiktok") !== "snapchat"
                  ? "bg-blue-50 text-blue-600"
                  : "text-slate-500"
              }`}
              onClick={() =>
                updateSelectedOverlayBox({
                  fontFamily: "tiktok",
                  treatment: activeOverlayBox.treatment === "plain" ? "outline" : activeOverlayBox.treatment,
                })
              }
            >
              TikTok captions
            </button>
            <button
              type="button"
              aria-pressed={activeOverlayBox.fontFamily === "snapchat"}
              className={`border-l h-9 text-xs font-medium ${
                activeOverlayBox.fontFamily === "snapchat" ? "bg-blue-50 text-blue-600" : "text-slate-500"
              }`}
              onClick={() => updateSelectedOverlayBox({ fontFamily: "snapchat", treatment: "plain" })}
            >
              Snapchat caption
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">Font</span>
            <select
              aria-label="Caption font"
              value={activeOverlayBox.fontFamily ?? "tiktok"}
              onChange={(e) => {
                const fontFamily = e.target.value as OverlayFont;
                updateSelectedOverlayBox({
                  fontFamily,
                  treatment:
                    fontFamily === "snapchat"
                      ? "plain"
                      : activeOverlayBox.treatment === "plain"
                        ? "outline"
                        : activeOverlayBox.treatment,
                });
              }}
              className="h-9 w-full rounded-lg border bg-white px-3 text-xs"
            >
              {["Batchbot", "Sales-focused"].map((group) => (
                <optgroup key={group} label={group}>
                  {OVERLAY_FONTS.filter((font) => font.group === group).map((font) => (
                    <option key={font.value} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-white">
            {(
              [
                ["left", AlignLeft, "Align left"],
                ["center", AlignCenter, "Align center"],
                ["right", AlignRight, "Align right"],
              ] as const
            ).map(([alignment, Icon, label]) => (
              <button
                key={alignment}
                type="button"
                aria-label={label}
                aria-pressed={(activeOverlayBox.textAlign ?? "center") === alignment}
                className={`flex h-9 items-center justify-center border-l first:border-l-0 ${
                  (activeOverlayBox.textAlign ?? "center") === alignment
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-500"
                }`}
                onClick={() => updateSelectedOverlayBox({ textAlign: alignment })}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3rem] items-center gap-2 rounded-lg border bg-white p-3">
            <Type className="h-4 w-4 text-slate-500" />
            <input
              aria-label="Font size"
              type="range"
              min={18}
              max={120}
              value={activeOverlayBox.fontSize ?? fontSize}
              onChange={(e) => {
                const value = Number(e.target.value);
                onFontSizeChange(value);
                updateSelectedOverlayBox({ fontSize: value });
              }}
              className="w-full accent-blue-600"
            />
            <span className="text-right font-mono text-xs text-slate-500">
              {activeOverlayBox.fontSize ?? fontSize}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border bg-white p-2">
            {(activeOverlayBox.fontFamily ?? "tiktok") !== "snapchat" && (
              <button
                type="button"
                title={`Text style: ${activeOverlayBox.treatment ?? "outline"}`}
                aria-label={`Cycle text style (current: ${activeOverlayBox.treatment ?? "outline"})`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-700 text-xs font-bold text-white ring-1 ring-black/10 active:scale-95"
                onClick={() => {
                  const current =
                    activeOverlayBox.treatment === "plain"
                      ? "outline"
                      : (activeOverlayBox.treatment ?? "outline");
                  const index = TREATMENT_ORDER.indexOf(current);
                  updateSelectedOverlayBox({
                    treatment: TREATMENT_ORDER[(index + 1) % TREATMENT_ORDER.length],
                  });
                }}
              >
                Aa
              </button>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-1">
              {OVERLAY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Text color ${color}`}
                  aria-pressed={(activeOverlayBox.fontColor ?? "#ffffff").toLowerCase() === color}
                  className={`h-7 w-7 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(16,24,40,0.15)] active:scale-95 ${
                    (activeOverlayBox.fontColor ?? "#ffffff").toLowerCase() === color
                      ? "scale-110 ring-2 ring-blue-500"
                      : ""
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => updateSelectedOverlayBox({ fontColor: color })}
                />
              ))}
              <label
                className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(16,24,40,0.15)]"
                title="Custom text color"
              >
                <input
                  aria-label="Custom text color"
                  type="color"
                  value={activeOverlayBox.fontColor ?? "#ffffff"}
                  onChange={(e) => updateSelectedOverlayBox({ fontColor: e.target.value })}
                  className="absolute -inset-2 h-12 w-12 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Background box (only for box treatments) */}
          {(activeOverlayBox.treatment === "box" || activeOverlayBox.treatment === "box-inverse") && (
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border bg-white p-3">
              <span
                className="h-4 w-4 rounded-sm border border-slate-300"
                style={{
                  backgroundColor:
                    activeOverlayBox.treatment === "box-inverse"
                      ? hexToRgba("#ffffff", activeOverlayBox.bgOpacity ?? 1)
                      : hexToRgba(activeOverlayBox.bgColor ?? "#000000", activeOverlayBox.bgOpacity ?? 1),
                }}
              />
              <input
                aria-label="Background opacity"
                type="range"
                min={0}
                max={100}
                value={Math.round((activeOverlayBox.bgOpacity ?? 1) * 100)}
                onChange={(e) =>
                  updateSelectedOverlayBox({ bgOpacity: Number(e.target.value) / 100 })
                }
                className="w-full accent-blue-600"
              />
              <button
                type="button"
                aria-label="Background color"
                className="grid h-8 w-8 place-items-center rounded-md border text-xs font-semibold text-slate-500 hover:bg-slate-50"
                onClick={() =>
                  updateSelectedOverlayBox({
                    bgColor: activeOverlayBox.treatment === "box-inverse" ? "#000000" : "#ffffff",
                  })
                }
              >
                <span
                  className="h-4 w-4 rounded-sm border border-slate-300"
                  style={{ backgroundColor: activeOverlayBox.bgColor ?? "#000000" }}
                />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
