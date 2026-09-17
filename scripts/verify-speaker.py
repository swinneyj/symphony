#!/usr/bin/env python3
"""Classify exported WAV clips against authorized speaker reference WAVs.

Install once: python3 -m pip install resemblyzer numpy
Usage: python3 scripts/verify-speaker.py --references /path/to/josh-references --clips /path/to/symphony-speech-clips
"""
import argparse, json, shutil
from pathlib import Path
import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav

parser = argparse.ArgumentParser()
parser.add_argument("--references", required=True, type=Path)
parser.add_argument("--clips", required=True, type=Path)
parser.add_argument("--threshold", type=float, default=0.72)
parser.add_argument("--reject-threshold", type=float, default=0.55)
args = parser.parse_args()
refs = sorted(args.references.glob("*.wav"))
clips = sorted(args.clips.glob("*.wav"))
if not refs: raise SystemExit("No reference WAV files found")
if not clips: raise SystemExit("No clip WAV files found")
encoder = VoiceEncoder()
reference = np.mean([encoder.embed_utterance(preprocess_wav(str(path))) for path in refs], axis=0)
reference /= np.linalg.norm(reference)
folders = {"approved": args.clips / "approved", "reject": args.clips / "reject", "needs_review": args.clips / "needs_review"}
for folder in folders.values(): folder.mkdir(exist_ok=True)
results = []
for clip in clips:
    embedding = encoder.embed_utterance(preprocess_wav(str(clip)))
    embedding /= np.linalg.norm(embedding)
    score = float(np.dot(reference, embedding))
    status = "approved" if score >= args.threshold else "reject" if score < args.reject_threshold else "needs_review"
    shutil.copy2(clip, folders[status] / clip.name)
    results.append({"file": clip.name, "status": status, "similarity": round(score, 4)})
    print(f"{status}\t{score:.3f}\t{clip.name}")
(args.clips / "speaker-verification.json").write_text(json.dumps({"threshold": args.threshold, "rejectThreshold": args.reject_threshold, "references": [str(p) for p in refs], "results": results}, indent=2) + "\n")
print(f"Done. Approved: {sum(r['status']=='approved' for r in results)}; review: {sum(r['status']=='needs_review' for r in results)}; rejected: {sum(r['status']=='reject' for r in results)}")
