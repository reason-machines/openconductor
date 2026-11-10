#!/usr/bin/env python3
"""Validate retained JSONL framing offline without changing the capture."""
import argparse
import json
import sys
from typing import BinaryIO

MAX_RECORD_BYTES = 1024 * 1024


class FramingError(ValueError):
    def __init__(self, line: int, offset: int, reason: str):
        self.line = line
        self.offset = offset
        self.reason = reason
        super().__init__(f"line {line}, byte {offset}: {reason}")


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate object key")
        result[key] = value
    return result


def _reject_constant(_value):
    raise ValueError("non-JSON numeric constant")


def validate_jsonl(stream: BinaryIO, max_record_bytes: int = MAX_RECORD_BYTES) -> int:
    """Count complete UTF-8 JSON records or refuse at the first bad frame.

    The byte limit includes LF (and CR for CRLF). Error offsets are zero-based
    frame starts; line numbers are one-based. No event schema is assumed.
    """
    if max_record_bytes < 1:
        raise ValueError("max_record_bytes must be positive")
    count = offset = 0
    while raw := stream.readline(max_record_bytes + 1):
        line = count + 1
        if len(raw) > max_record_bytes:
            raise FramingError(line, offset, "record exceeds byte limit")
        if not raw.endswith(b"\n"):
            raise FramingError(line, offset, "unterminated final record")
        try:
            json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object,
                       parse_constant=_reject_constant)
        except UnicodeDecodeError:
            raise FramingError(line, offset, "invalid UTF-8") from None
        except json.JSONDecodeError:
            raise FramingError(line, offset, "invalid JSON") from None
        except RecursionError:
            raise FramingError(line, offset, "JSON nesting exceeds parser limit") from None
        except ValueError as error:
            reason = str(error) if str(error) in {
                "duplicate object key", "non-JSON numeric constant"
            } else "JSON value exceeds parser limit"
            raise FramingError(line, offset, reason) from None
        offset += len(raw)
        count += 1
    return count


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", help="retained capture to open read-only")
    parser.add_argument("--max-record-bytes", type=int, default=MAX_RECORD_BYTES)
    args = parser.parse_args(argv)
    if args.max_record_bytes < 1:
        parser.error("--max-record-bytes must be positive")
    try:
        with open(args.capture, "rb") as stream:
            count = validate_jsonl(stream, args.max_record_bytes)
    except FramingError as error:
        print(f"JSONL refused at {error}", file=sys.stderr)
        return 1
    except OSError:
        print("Cannot read JSONL capture", file=sys.stderr)
        return 1
    print(f"Validated {count} JSONL records (framing only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
