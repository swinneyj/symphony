#!/usr/bin/env python3
"""Second-pass speaker and audio-quality classifier."""
import argparse, json, shutil, wave
from pathlib import Path
import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav

parser = argparse.ArgumentParser()
parser.add_argument("--references", required=True, type=Path)
parser.add_argument("--clips", required=True, type=Path)
parser.add_argument("--threshold", type=float, default=0.72)
parser.add_argument("--reject-threshold", type=float, default=0.55)
parser.add_argument("--quality-floor", type=float, default=0.015)
parser.add_argument("--min-seconds", type=float, default=1.0)
args = parser.parse_args()
refs = sorted(args.references.glob("*.wav")); clips = sorted(args.clips.glob("*.wav"))
if not refs: raise SystemExit("No reference WAV files found")
if not clips: raise SystemExit("No clip WAV files found")
encoder = VoiceEncoder()
reference_embeddings = [encoder.embed_utterance(preprocess_wav(str(path))) for path in refs]
reference = np.mean(reference_embeddings, axis=0); reference /= np.linalg.norm(reference)
folders = {"approved": args.clips / "approved", "reject": args.clips / "reject", "needs_review": args.clips / "needs_review"}
for folder in folders.values():
    folder.mkdir(exist_ok=True)
    for old in folder.glob("*.wav"): old.unlink()

def quality(path):
    with wave.open(str(path), "rb") as audio:
        frames, rate = audio.getnframes(), audio.getframerate()
        raw = np.frombuffer(audio.readframes(frames), dtype=np.int16).astype(np.float32) / 32768.0
    if not len(raw): return {"seconds": 0.0, "rms": 0.0, "peak": 0.0}
    return {"seconds": frames / rate, "rms": float(np.sqrt(np.mean(raw * raw))), "peak": float(np.max(np.abs(raw)))}

results = []
for clip in clips:
    embedding = encoder.embed_utterance(preprocess_wav(str(clip))); embedding /= np.linalg.norm(embedding)
    score = float(np.dot(reference, embedding))
    individual = [float(np.dot(ref, embedding) / (np.linalg.norm(ref) or 1.0)) for ref in reference_embeddings]
    audio = quality(clip)
    quality_ok = audio["seconds"] >= args.min_seconds and audio["rms"] >= args.quality_floor and audio["peak"] < 0.9999
    individual_ok = len(individual) < 2 or float(np.median(individual)) >= args.threshold - 0.015
    status = "needs_review" if not quality_ok else "approved" if score >= args.threshold or (score >= args.threshold - 0.015 and individual_ok) else "reject" if score < args.reject_threshold else "needs_review"
    shutil.copy2(clip, folders[status] / clip.name)
    results.append({"file": clip.name, "status": status, "similarity": round(score, 4), "referenceMedian": round(float(np.median(individual)), 4), "quality": {k: round(v, 4) for k, v in audio.items()}, "qualityOk": quality_ok})
    print(f"{status}\t{score:.3f}\t{clip.name}")
(args.clips / "speaker-verification.json").write_text(json.dumps({"threshold": args.threshold, "rejectThreshold": args.reject_threshold, "qualityFloor": args.quality_floor, "minSeconds": args.min_seconds, "references": [str(p) for p in refs], "results": results}, indent=2) + "\n")
print(f"Done. Approved: {sum(r['status']=='approved' for r in results)}; review: {sum(r['status']=='needs_review' for r in results)}; rejected: {sum(r['status']=='reject' for r in results)}")
