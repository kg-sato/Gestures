"""Download Google's versioned Hand Landmarker bundle for entirely local inference."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
SHA256 = "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1"


def main():
    target = ROOT / "models/hand_landmarker.task"
    target.parent.mkdir(exist_ok=True)
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == SHA256:
        print("Verified local Hand Landmarker model; no download needed")
        return
    with urlopen(URL, timeout=60) as response:
        content = response.read(20000001)
    if not 1000000 < len(content) <= 20000000 or b"PK" not in content[:8]:
        raise RuntimeError("Unexpected model response; existing model was preserved")
    digest = hashlib.sha256(content).hexdigest()
    if digest != SHA256:
        raise RuntimeError("Model checksum changed; existing model was preserved")
    temporary = target.with_suffix(".part")
    temporary.write_bytes(content)
    temporary.replace(target)
    (ROOT / "models/manifest.json").write_text(json.dumps({
        "url": URL, "sha256": digest, "bytes": len(content),
        "source": "https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/index",
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Hand model ready: {len(content):,} bytes, SHA-256 {digest}")


if __name__ == "__main__":
    main()
