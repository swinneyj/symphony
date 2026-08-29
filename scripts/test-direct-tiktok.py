import sys, json, tempfile, shutil
sys.path.insert(0, "/app")
from worker import download_tiktok_direct, detect_platform

url = "https://www.tiktok.com/t/ZT9kYYAeTDq34-bbXZ4/"
print("platform:", detect_platform(url))
wd = tempfile.mkdtemp(prefix="dl-test-")
try:
    path, title, author = download_tiktok_direct(url, wd)
    import os
    print("OK size:", os.path.getsize(path), "title:", (title or "")[:60], "author:", author)
except Exception as e:
    print("DIRECT FAILED:", type(e).__name__, str(e)[:500])
finally:
    shutil.rmtree(wd, ignore_errors=True)
