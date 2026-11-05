//! ISO 8601 UTC timestamps as the reference writes them from JavaScript
//! (`new Date(ms).toISOString()`, e.g. `2026-11-05T12:00:00.000Z`) and reads
//! them back (`Date.parse`). Used where a statement's bound time is computed
//! by the caller rather than by SQLite's `datetime('now')`.

/// `new Date(ms).toISOString()` for `ms` since the Unix epoch (UTC, years
/// 0000-9999).
pub fn from_millis(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let rem = ms.rem_euclid(86_400_000);
    let (y, m, d) = civil_from_days(days);
    let (h, min, s, milli) = (
        rem / 3_600_000,
        rem / 60_000 % 60,
        rem / 1000 % 60,
        rem % 1000,
    );
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{min:02}:{s:02}.{milli:03}Z")
}

/// Milliseconds since the Unix epoch for `YYYY-MM-DDTHH:MM:SS[.fff]Z`, the
/// shape [`from_millis`] writes. Anything else is `None` (where the
/// reference's `Date.parse` would give `NaN`).
pub fn to_millis(s: &str) -> Option<i64> {
    let s = s.strip_suffix('Z')?;
    let (date, time) = s.split_once('T')?;
    let mut date = date.splitn(3, '-');
    let y: i64 = num(date.next()?, 4)?;
    let mo: i64 = num(date.next()?, 2)?;
    let d: i64 = num(date.next()?, 2)?;
    let (hms, frac) = match time.split_once('.') {
        Some((hms, frac)) => (hms, Some(frac)),
        None => (time, None),
    };
    let mut hms = hms.splitn(3, ':');
    let h: i64 = num(hms.next()?, 2)?;
    let mi: i64 = num(hms.next()?, 2)?;
    let sec: i64 = num(hms.next()?, 2)?;
    let milli = match frac {
        None => 0,
        Some(f) if !f.is_empty() && f.len() <= 3 && f.bytes().all(|b| b.is_ascii_digit()) => {
            f.parse::<i64>().ok()? * 10_i64.pow(3 - f.len() as u32)
        }
        Some(_) => return None,
    };
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || sec > 59 {
        return None;
    }
    let days = days_from_civil(y, mo, d);
    Some(days * 86_400_000 + h * 3_600_000 + mi * 60_000 + sec * 1000 + milli)
}

fn num(part: &str, len: usize) -> Option<i64> {
    (part.len() == len && part.bytes().all(|b| b.is_ascii_digit()))
        .then(|| part.parse().ok())
        .flatten()
}

// Howard Hinnant's civil calendar algorithms (proleptic Gregorian).
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_like_to_iso_string() {
        assert_eq!(from_millis(0), "1970-01-01T00:00:00.000Z");
        // new Date(1793880000123).toISOString()
        assert_eq!(from_millis(1_793_880_000_123), "2026-11-05T12:00:00.123Z");
        assert_eq!(from_millis(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }

    #[test]
    fn parses_what_it_writes() {
        for ms in [0, 1_793_880_000_123, 951_782_400_000, 4_102_444_799_999] {
            assert_eq!(to_millis(&from_millis(ms)), Some(ms));
        }
        assert_eq!(to_millis("2026-11-05T12:00:00Z"), Some(1_793_880_000_000));
        assert_eq!(to_millis("2026-11-05T12:00:00.5Z"), Some(1_793_880_000_500));
        assert_eq!(to_millis("2026-11-05 12:00:00"), None);
        assert_eq!(to_millis("not a date"), None);
    }
}
