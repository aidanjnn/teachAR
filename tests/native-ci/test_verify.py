import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("native_ci", Path(__file__).resolve().parents[2] / "scripts/verify-native-ci.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class NativeEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_requires_real_nonempty_test_report(self):
        with self.assertRaises(ValueError):
            verify.verify_tests(self.root)
        result = self.root / "results.xml"
        result.write_text('<test-run result="Passed" total="2" passed="2" failed="0"/>')
        self.assertEqual(verify.verify_tests(self.root), 2)
        for attributes in (
            'result="Passed" total="0" passed="0" failed="0"',
            'result="Failed" total="2" passed="1" failed="1"',
            'result="Passed" total="2" passed="1" failed="0" skipped="1"',
            'result="Passed" total="2" passed="1" failed="0" inconclusive="1"',
        ):
            with self.subTest(attributes=attributes):
                result.write_text(f'<test-run {attributes}/>')
                with self.assertRaises(ValueError):
                    verify.verify_tests(self.root)

    def test_a_passing_report_cannot_hide_another_failure(self):
        (self.root / "pass.xml").write_text('<test-run result="Passed" total="1" passed="1" failed="0"/>')
        (self.root / "fail.xml").write_text('<test-run result="Failed" total="1" passed="0" failed="1"/>')
        with self.assertRaises(ValueError):
            verify.verify_tests(self.root)

    def make_build(self, machine=b"\xb7\x00"):
        apk = self.root / "Trail.apk"
        with zipfile.ZipFile(apk, "w") as archive:
            archive.writestr("lib/arm64-v8a/libil2cpp.so", b"\x7fELF\x02\x01" + bytes(12) + machine)
        report = {"result": "Succeeded", "editor": "6000.3.24f1", "platform": "Android",
                  "architecture": "ARM64", "backend": "IL2CPP", "development": False,
                  "bytes": apk.stat().st_size}
        (self.root / "build.json").write_text(json.dumps(report))
        version = self.root / "ProjectVersion.txt"
        version.write_text("m_EditorVersion: 6000.3.24f1\n")
        return report, version

    def test_requires_matching_build_configuration_and_apk(self):
        report, version = self.make_build()
        self.assertEqual(verify.verify_build(self.root, version), report["bytes"])
        for key, value in (("editor", "wrong"), ("backend", "Mono"), ("architecture", "ARMv7"),
                           ("development", True), ("bytes", 0), ("result", "Failed")):
            with self.subTest(key=key):
                (self.root / "build.json").write_text(json.dumps({**report, key: value}))
                with self.assertRaises(ValueError):
                    verify.verify_build(self.root, version)

    def test_a_filename_cannot_disguise_wrong_architecture(self):
        _, version = self.make_build(machine=b"\x3e\x00")
        with self.assertRaises(ValueError):
            verify.verify_build(self.root, version)


if __name__ == "__main__":
    unittest.main()
