import contextlib
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from tools import native_qa_jsonl as framing


class FramingTests(unittest.TestCase):
    def assert_refused(self, payload, reason, *, line=1, offset=0, limit=1024):
        stream = io.BytesIO(payload)
        with self.assertRaises(framing.FramingError) as caught:
            framing.validate_jsonl(stream, limit)
        self.assertEqual((caught.exception.line, caught.exception.offset,
                          caught.exception.reason), (line, offset, reason))
        self.assertEqual(stream.getvalue(), payload)

    def test_malformed_middle_is_not_dropped(self):
        self.assert_refused(b'{}\n{broken\n{}\n', "invalid JSON", line=2, offset=3)

    def test_truncated_tail_is_not_dropped(self):
        self.assert_refused(b'{}\n{"event":', "unterminated final record", line=2, offset=3)

    def test_oversized_record_is_refused(self):
        self.assert_refused(b'{}\n{"long":"value"}\n', "record exceeds byte limit",
                            line=2, offset=3, limit=8)

    def test_duplicate_key_is_not_overwritten(self):
        self.assert_refused(b'{"event":1,"event":2}\n', "duplicate object key")

    def test_duplicate_nested_and_escaped_keys_are_refused(self):
        for payload in (b'{"outer":{"x":1,"x":2}}\n', b'{"a":1,"\\u0061":2}\n'):
            with self.subTest(payload=payload):
                self.assert_refused(payload, "duplicate object key")

    def test_utf8_and_crlf_offsets_are_bytes(self):
        first = '{"name":"\u00e9"}\r\n'.encode()
        self.assertEqual(framing.validate_jsonl(io.BytesIO(first + b'null\n')), 2)
        self.assert_refused(first + b'no\n', "invalid JSON", line=2, offset=len(first))

    def test_scalar_array_and_empty_capture_do_not_imply_event_schema(self):
        self.assertEqual(framing.validate_jsonl(io.BytesIO(b'42\n[]\n"text"\nnull\n')), 4)
        self.assertEqual(framing.validate_jsonl(io.BytesIO()), 0)

    def test_final_delimiter_is_required_even_for_valid_json(self):
        self.assert_refused(b'{}', "unterminated final record")

    def test_blank_lines_and_multiple_values_are_not_skipped(self):
        for payload in (b'\n', b' \r\n', b'{} {}\n'):
            with self.subTest(payload=payload):
                self.assert_refused(payload, "invalid JSON")

    def test_invalid_encoding_and_bom_are_refused(self):
        self.assert_refused(b'{"x":"\xff"}\n', "invalid UTF-8")
        self.assert_refused(b'\xef\xbb\xbf{}\n', "invalid JSON")
        self.assert_refused('{}\n'.encode('utf-16'), "invalid UTF-8")

    def test_non_json_constants_are_refused(self):
        for value in (b'NaN', b'Infinity', b'-Infinity'):
            with self.subTest(value=value):
                self.assert_refused(b'{"x":' + value + b'}\n', "non-JSON numeric constant")

    def test_nesting_failure_is_a_refusal(self):
        self.assert_refused(b'[' * 2000 + b'0' + b']' * 2000 + b'\n',
                            "JSON nesting exceeds parser limit", limit=5000)

    def test_exact_limit_includes_delimiter(self):
        self.assertEqual(framing.validate_jsonl(io.BytesIO(b'{}\n{}\n'), 3), 2)
        self.assert_refused(b'{}\n', "record exceeds byte limit", limit=2)
        self.assert_refused(b'{}\r\n', "record exceeds byte limit", limit=3)

    def test_default_one_mib_boundary(self):
        exact = b'"' + b'a' * (framing.MAX_RECORD_BYTES - 3) + b'"\n'
        self.assertEqual(framing.validate_jsonl(io.BytesIO(exact)), 1)
        self.assert_refused(b'"a' + exact[1:], "record exceeds byte limit",
                            limit=framing.MAX_RECORD_BYTES)

    def test_read_is_bounded_and_stops_at_refusal(self):
        class BoundedStream(io.BytesIO):
            def readline(self, size=-1):
                if size != 9:
                    raise AssertionError(f"unbounded or unexpected read: {size}")
                return super().readline(size)

        stream = BoundedStream(b'{}\n' + b'x' * 100000 + b'\n{}\n')
        with self.assertRaisesRegex(framing.FramingError, "record exceeds byte limit"):
            framing.validate_jsonl(stream, 8)
        self.assertEqual(stream.tell(), 3 + 9)

    def test_invalid_limit(self):
        for limit in (0, -1):
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                framing.validate_jsonl(io.BytesIO(b'{}\n'), limit)


class CommandTests(unittest.TestCase):
    def test_failures_preserve_capture_and_emit_no_partial_success_or_content(self):
        cases = [
            (b'{}\n{"secret":"CANARY",bad}\n{}\n', "invalid JSON"),
            (b'{}\n{"secret":"CANARY"', "unterminated final record"),
            (b'{"CANARY":1,"CANARY":2}\n', "duplicate object key"),
            (b'{"secret":"' + b'CANARY' * 200 + b'"}\n', "record exceeds byte limit"),
        ]
        with tempfile.TemporaryDirectory() as root:
            capture = Path(root) / "capture.jsonl"
            for payload, reason in cases:
                with self.subTest(reason=reason):
                    capture.write_bytes(payload)
                    capture.chmod(0o400)
                    stdout, stderr = io.StringIO(), io.StringIO()
                    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                        status = framing.main([str(capture), "--max-record-bytes", "1024"])
                    self.assertEqual(status, 1)
                    self.assertEqual(stdout.getvalue(), "")
                    self.assertIn(reason, stderr.getvalue())
                    self.assertNotIn("CANARY", stderr.getvalue())
                    self.assertEqual(capture.read_bytes(), payload)
                    self.assertEqual(capture.stat().st_mode & 0o777, 0o400)
                    capture.chmod(0o600)

    def test_actual_cli_success_and_failure(self):
        script = Path(framing.__file__).resolve()
        with tempfile.TemporaryDirectory() as root:
            capture = Path(root) / "capture.jsonl"
            for payload, code in ((b'{}\n[]\r\n', 0), (b'{}\n{bad\n', 1)):
                with self.subTest(code=code):
                    capture.write_bytes(payload)
                    result = subprocess.run([sys.executable, "-B", str(script), str(capture)],
                                            capture_output=True, text=True, timeout=15)
                    self.assertEqual(result.returncode, code)
                    if code == 0:
                        self.assertEqual(result.stdout, "Validated 2 JSONL records (framing only)\n")
                        self.assertEqual(result.stderr, "")
                    else:
                        self.assertEqual(result.stdout, "")
                        self.assertIn("line 2, byte 3: invalid JSON", result.stderr)
                    self.assertEqual(capture.read_bytes(), payload)

    def test_missing_capture_returns_failure(self):
        with tempfile.TemporaryDirectory() as root:
            with contextlib.redirect_stderr(io.StringIO()) as stderr:
                self.assertEqual(framing.main([str(Path(root) / "missing")]), 1)
            self.assertEqual(stderr.getvalue(), "Cannot read JSONL capture\n")


if __name__ == "__main__":
    unittest.main()
