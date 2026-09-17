#!/usr/bin/env python3
import json
import shutil
from pathlib import Path

clips = Path(__file__).resolve().parents[1] / "symphony-speech-clips"
report = clips / "speaker-verification.json"
data = json.loads(report.read_text())
approved = 0
for result in data["results"]:
    if (result["status"] == "needs_review" and result.get("qualityOk") is True
            and result["similarity"] >= 0.65
            and result["referenceMedian"] >= 0.635):
        src = clips / "needs_review" / result["file"]
        dst = clips / "approved" / result["file"]
        if src.exists():
            shutil.move(str(src), str(dst))
        result["status"] = "approved"
        result["autoApprovedBy"] = "second-pass-review"
        approved += 1
data["secondPass"] = {"similarityThreshold": 0.65, "referenceMedianThreshold": 0.635, "requiresQualityOk": True, "approvedCount": approved}
report.write_text(json.dumps(data, indent=2) + "\n")
print(f"Second pass approved: {approved}")
