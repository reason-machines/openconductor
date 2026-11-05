//! ISO 8601 timestamps as JavaScript's `Date#toISOString` writes them
//! (`2026-11-05T15:11:05.228Z`) and a parser for the forms the stores read.

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `Date#toISOString` of a millisecond timestamp.
pub fn iso(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let rem = ms.rem_euclid(86_400_000);
    let (y, m, d) = civil_from_days(days);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3_600_000,
        rem / 60_000 % 60,
        rem / 1000 % 60,
        rem % 1000
    )
}

/// Parses `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM[:SS[.fff]]` with `Z` or `±HH:MM`
/// (the ISO forms `Date.parse` reads). `None` where `Date.parse` gives NaN
/// for these forms.
pub fn parse_iso(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    let num = |from: usize, len: usize| -> Option<i64> {
        let part = s.get(from..from + len)?;
        part.bytes()
            .all(|c| c.is_ascii_digit())
            .then(|| part.parse().ok())?
    };
    if b.len() < 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let (y, mo, d) = (num(0, 4)?, num(5, 2)?, num(8, 2)?);
    if !(1..=12).contains(&mo) || d < 1 || d > days_in_month(y, mo) {
        return None;
    }
    let mut ms = days_from_civil(y, mo, d) * 86_400_000;
    if b.len() == 10 {
        return Some(ms);
    }
    if b[10] != b'T' || b.len() < 16 || b[13] != b':' {
        return None;
    }
    let (h, mi) = (num(11, 2)?, num(14, 2)?);
    if h > 23 || mi > 59 {
        return None;
    }
    ms += h * 3_600_000 + mi * 60_000;
    let mut i = 16;
    if b.get(i) == Some(&b':') {
        let sec = num(i + 1, 2)?;
        if sec > 59 {
            return None;
        }
        ms += sec * 1000;
        i += 3;
        if b.get(i) == Some(&b'.') {
            let start = i + 1;
            let mut end = start;
            while end < b.len() && b[end].is_ascii_digit() {
                end += 1;
            }
            if end == start {
                return None;
            }
            let frac = &s[start..end.min(start + 3)];
            ms += frac.parse::<i64>().ok()? * 10_i64.pow(3 - frac.len() as u32);
            i = end;
        }
    }
    match b.get(i) {
        Some(b'Z') if i + 1 == b.len() => Some(ms),
        Some(&sign @ (b'+' | b'-')) if b.len() == i + 6 && b[i + 3] == b':' => {
            let off = num(i + 1, 2)? * 3_600_000 + num(i + 4, 2)? * 60_000;
            Some(if sign == b'+' { ms - off } else { ms + off })
        }
        // Without an offset `Date.parse` reads local time; the stores only
        // write `Z` times, so treat it as UTC.
        None => Some(ms),
        _ => None,
    }
}

fn days_in_month(y: i64, m: i64) -> i64 {
    match m {
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

// Howard Hinnant's days_from_civil / civil_from_days.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_round_trips() {
        // 2026-11-05T15:11:05.228Z, the REA capture's start time.
        let ms = 1_793_891_465_228;
        assert_eq!(iso(ms), "2026-11-05T15:11:05.228Z");
        assert_eq!(parse_iso("2026-11-05T15:11:05.228Z"), Some(ms));
        assert_eq!(iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(parse_iso("2024-02-29"), Some(1_709_164_800_000));
    }

    #[test]
    fn parses_offsets_and_rejects_garbage() {
        assert_eq!(
            parse_iso("2026-11-05T16:11:05.228+01:00"),
            parse_iso("2026-11-05T15:11:05.228Z")
        );
        for bad in [
            "",
            "not a date",
            "2026-13-01",
            "2026-02-30",
            "2026-11-05T25:00Z",
            "2026-11-05T10:00:00.Z",
        ] {
            assert_eq!(parse_iso(bad), None, "{bad}");
        }
    }
}
