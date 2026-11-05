//! An app's own icon, as a PNG, from its bundle: `Contents/Info.plist`
//! names the .icns (`CFBundleIconFile`, ".icns" optional, as Conductor's
//! `gLr` reads it), and the .icns holds PNG images at several sizes.

use std::path::{Path, PathBuf};

use base64::Engine as _;

/// The smallest PNG at least this wide is used: the menu draws icons at
/// 14 px and the button at 12 px, so 64 px covers 2x and 3x screens.
pub const MIN_WIDTH: u32 = 64;

const PNG_MAGIC: &[u8] = b"\x89PNG\r\n\x1a\n";

/// Width of a PNG from its IHDR chunk.
fn png_width(png: &[u8]) -> Option<u32> {
    (png.len() >= 24 && png.starts_with(PNG_MAGIC) && &png[12..16] == b"IHDR")
        .then(|| u32::from_be_bytes(png[16..20].try_into().unwrap()))
}

/// The PNG images in an .icns file with their widths, in file order.
/// Other entries (ARGB/RLE bitmaps, JPEG 2000, `info`, `TOC `) are skipped.
pub fn icns_pngs(icns: &[u8]) -> Vec<(u32, &[u8])> {
    let mut out = Vec::new();
    if icns.len() < 8 || &icns[..4] != b"icns" {
        return out;
    }
    let total = (u32::from_be_bytes(icns[4..8].try_into().unwrap()) as usize).min(icns.len());
    let mut at = 8;
    while at + 8 <= total {
        let len = u32::from_be_bytes(icns[at + 4..at + 8].try_into().unwrap()) as usize;
        if len < 8 || at + len > total {
            break;
        }
        let data = &icns[at + 8..at + len];
        if let Some(w) = png_width(data) {
            out.push((w, data));
        }
        at += len;
    }
    out
}

/// The PNG to show: the smallest at least [`MIN_WIDTH`] wide, else the largest.
pub fn pick_png(icns: &[u8]) -> Option<&[u8]> {
    let pngs = icns_pngs(icns);
    pngs.iter()
        .filter(|(w, _)| *w >= MIN_WIDTH)
        .min_by_key(|(w, _)| *w)
        .or_else(|| pngs.iter().max_by_key(|(w, _)| *w))
        .map(|(_, png)| *png)
}

/// `Contents/Resources/<CFBundleIconFile>.icns` of a bundle, falling back
/// to `CFBundleIconName` (apps whose plist names only the asset catalog
/// icon usually still ship an .icns of that name).
pub fn icns_path(bundle: &Path) -> Option<PathBuf> {
    let info = plist::Value::from_file(bundle.join("Contents/Info.plist")).ok()?;
    let dict = info.as_dictionary()?;
    ["CFBundleIconFile", "CFBundleIconName"]
        .iter()
        .filter_map(|k| dict.get(k)?.as_string())
        .map(|name| {
            let file = if name.ends_with(".icns") {
                name.to_string()
            } else {
                format!("{name}.icns")
            };
            bundle.join("Contents/Resources").join(file)
        })
        .find(|p| p.is_file())
}

/// The bundle's icon as a `data:image/png;base64,...` URL.
pub fn data_url(bundle: &Path) -> Option<String> {
    let icns = std::fs::read(icns_path(bundle)?).ok()?;
    let png = pick_png(&icns)?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}
