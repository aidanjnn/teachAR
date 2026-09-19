"""Reject empty/failed Unity results and missing or incorrectly targeted APKs."""
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


def verify_tests(directory):
    reports = list(directory.rglob("*.xml"))
    runs = [ET.parse(path).getroot() for path in reports]
    runs = [root for root in runs if root.tag == "test-run"]
    if not runs:
        raise ValueError("Unity did not produce NUnit test-run XML")
    for root in runs:
        total = int(root.get("total", "0"))
        if (root.get("result") != "Passed" or total <= 0
                or int(root.get("passed", "0")) != total
                or int(root.get("failed", "-1")) != 0
                or int(root.get("skipped", "0")) != 0
                or int(root.get("inconclusive", "0")) != 0):
            raise ValueError("Unity tests must all pass; empty or skipped suites are not success")
    return sum(int(root.get("total")) for root in runs)


def verify_build(directory, version_file):
    version = re.search(r"^m_EditorVersion: (\S+)$", version_file.read_text(), re.M)
    if not version:
        raise ValueError("Missing pinned editor version")
    report = json.loads((directory / "build.json").read_text())
    expected = {"result": "Succeeded", "editor": version[1], "platform": "Android",
                "architecture": "ARM64", "backend": "IL2CPP", "development": False}
    if any(report.get(key) != value for key, value in expected.items()):
        raise ValueError("Build report does not prove the pinned Android ARM64/IL2CPP build")
    apk = directory / "Trail.apk"
    if apk.stat().st_size <= 0 or report.get("bytes") != apk.stat().st_size:
        raise ValueError("Missing APK or build-report size mismatch")
    with zipfile.ZipFile(apk) as archive:
        library = archive.read("lib/arm64-v8a/libil2cpp.so")
        # ELF64, little-endian, EM_AARCH64. A filename alone is not architecture proof.
        if len(library) < 20 or library[:6] != b"\x7fELF\x02\x01" or library[18:20] != b"\xb7\x00":
            raise ValueError("APK does not contain an ARM64 IL2CPP ELF library")
    return apk.stat().st_size


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("tests", "build"):
        sys.exit("Usage: verify-native-ci.py tests|build ARTIFACT_DIRECTORY")
    directory = Path(sys.argv[2])
    if sys.argv[1] == "tests":
        print(f"Unity: {verify_tests(directory)} passing tests")
    else:
        version_file = Path(__file__).resolve().parent.parent / "apps/quest/ProjectSettings/ProjectVersion.txt"
        print(f"Verified Android ARM64/IL2CPP APK: {verify_build(directory, version_file)} bytes")
