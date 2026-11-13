use std::io::{self, Read};
use std::path::{Path, PathBuf};

pub(crate) fn check_with<H, O, R>(home: H, open: O) -> bool
where
    H: FnOnce() -> Option<PathBuf>,
    O: FnOnce(&Path) -> io::Result<R>,
    R: Read,
{
    let Some(home) = home() else {
        return true;
    };
    let path = home.join("Library/Application Support/com.apple.TCC/TCC.db");
    let result = open(&path).and_then(|mut file| file.read(&mut [0_u8; 1]));
    !matches!(result, Err(error) if error.kind() == io::ErrorKind::PermissionDenied)
}

#[cfg(test)]
#[path = "../../../evidence/settings/full-disk-access-native/fixtures.rs"]
mod tests;
