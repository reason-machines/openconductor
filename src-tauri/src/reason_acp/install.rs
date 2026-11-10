//! The official CLI-only installer. Authentication is a separate operation.

use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::os::unix::{fs::DirBuilderExt, fs::OpenOptionsExt, process::CommandExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock, Weak};
use std::time::{Duration, Instant};

const MANIFEST_URL: &str = "https://reasonmachines.com/api/cli-manifest";
const INSTALL_URL: &str = "https://reasonmachines.com/install.sh";
const SAFE_PATH: &str = "/usr/bin:/bin:/usr/sbin:/sbin";
const OUTPUT_LIMIT: u64 = 1024 * 1024;

type InstallResult = Result<InstalledCli, String>;
type Flight = OnceLock<InstallResult>;

/// The verified official installation, not a Settings executable override.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct InstalledCli {
    pub path: String,
    pub version: String,
}

/// Overlapping requests share their result; a later request checks releases again.
#[derive(Default)]
pub struct CliInstaller {
    active: Mutex<Weak<Flight>>,
}

impl CliInstaller {
    pub fn ensure_current(&self, home: &Path) -> InstallResult {
        self.coalesce(|| {
            let scratch = Scratch::new()?;
            let mut native = NativeInstaller { home, scratch };
            ensure_with(home, &mut native)
        })
    }

    fn coalesce(&self, install: impl FnOnce() -> InstallResult) -> InstallResult {
        let flight = {
            let mut active = self
                .active
                .lock()
                .map_err(|_| "Reason installer lock failed")?;
            match active.upgrade() {
                Some(flight) => flight,
                None => {
                    let flight = Arc::new(OnceLock::new());
                    *active = Arc::downgrade(&flight);
                    flight
                }
            }
        };
        flight.get_or_init(install).clone()
    }
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Version([u64; 3]);

impl Version {
    fn parse(text: &str) -> Result<Self, String> {
        let parts: Vec<_> = text.split('.').collect();
        if parts.len() != 3 || text.len() > 64 {
            return Err("Reason returned an invalid CLI version".into());
        }
        let mut version = [0; 3];
        for (index, part) in parts.into_iter().enumerate() {
            if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
                return Err("Reason returned an invalid CLI version".into());
            }
            version[index] = part
                .parse()
                .map_err(|_| "Reason CLI version is too large")?;
        }
        Ok(Self(version))
    }

    fn text(&self) -> String {
        format!("{}.{}.{}", self.0[0], self.0[1], self.0[2])
    }
}

trait InstallOperations {
    fn latest(&mut self) -> Result<Version, String>;
    fn version(&mut self, cli: &Path) -> Result<Version, String>;
    fn install(&mut self, directory: &Path, version: &Version) -> Result<(), String>;
}

fn ensure_with(home: &Path, ops: &mut impl InstallOperations) -> InstallResult {
    if !home.is_absolute() {
        return Err("Reason installation needs an absolute home folder".into());
    }
    let path = home.join(".local/bin/reason");
    let latest = ops.latest()?;
    if let Ok(version) = ops.version(&path) {
        if version >= latest {
            return Ok(InstalledCli {
                path: path.display().to_string(),
                version: version.text(),
            });
        }
    }
    ops.install(path.parent().unwrap(), &latest)?;
    let version = ops.version(&path).map_err(|_| {
        "Reason installed, but its CLI did not answer. Retry the installation.".to_string()
    })?;
    if version < latest {
        return Err(
            "Reason installation did not activate the current CLI. Retry the installation.".into(),
        );
    }
    Ok(InstalledCli {
        path: path.display().to_string(),
        version: version.text(),
    })
}

struct NativeInstaller<'a> {
    home: &'a Path,
    scratch: Scratch,
}

impl NativeInstaller<'_> {
    fn command(&self, program: impl AsRef<std::ffi::OsStr>) -> Command {
        let mut cmd = Command::new(program);
        // No API keys, pairing tokens, shell hooks, curl config or release overrides.
        cmd.env_clear()
            .env("HOME", self.home)
            .env("PATH", SAFE_PATH)
            .env("TMPDIR", &self.scratch.0)
            .env("CURL_HOME", &self.scratch.0)
            .env("LC_ALL", "C")
            .current_dir(self.home)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0);
        cmd
    }

    fn run(&self, mut cmd: Command, timeout: Duration, step: &str) -> Result<Vec<u8>, String> {
        let output_path = self.scratch.0.join("output");
        let output = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&output_path)
            .map_err(|_| format!("Could not prepare Reason {step}"))?;
        cmd.stdout(Stdio::from(output));
        let mut child = cmd
            .spawn()
            .map_err(|_| format!("Could not start Reason {step}. Retry the installation."))?;
        let start = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if start.elapsed() < timeout => {
                    std::thread::sleep(Duration::from_millis(25))
                }
                _ => {
                    let _ = Command::new("/bin/kill")
                        .env_clear()
                        .args(["-KILL", "--", &format!("-{}", child.id())])
                        .status();
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "Reason {step} timed out. Check your connection and retry."
                    ));
                }
            }
        };
        if !status.success() {
            return Err(format!(
                "Reason {step} failed. Check your connection and available disk space, then retry."
            ));
        }
        let mut output = Vec::new();
        File::open(output_path)
            .and_then(|f| f.take(OUTPUT_LIMIT + 1).read_to_end(&mut output))
            .map_err(|_| format!("Could not read Reason {step} result"))?;
        if output.len() as u64 > OUTPUT_LIMIT {
            return Err(format!("Reason {step} returned too much output"));
        }
        Ok(output)
    }

    fn download_command(&self, url: &str) -> Command {
        let mut cmd = self.command("/usr/bin/curl");
        cmd.args([
            "--disable",
            "--fail",
            "--silent",
            "--show-error",
            "--proto",
            "=https",
            "--tlsv1.2",
            "--connect-timeout",
            "15",
            "--max-time",
            "60",
            "--max-filesize",
            "1048576",
            url,
        ]);
        cmd
    }

    fn download(&self, url: &str) -> Result<Vec<u8>, String> {
        self.run(
            self.download_command(url),
            Duration::from_secs(65),
            "download",
        )
    }

    fn install_command(&self, script: &Path, directory: &Path, version: &Version) -> Command {
        let mut cmd = self.command("/bin/bash");
        cmd.arg(script)
            .args(["--version", &version.text(), "--install-dir"])
            .arg(directory)
            .args([
                "--background-mode",
                "cli_only",
                "--no-modify-path",
                "--no-login",
                "--minimal",
            ]);
        cmd
    }
}

impl InstallOperations for NativeInstaller<'_> {
    fn latest(&mut self) -> Result<Version, String> {
        #[derive(Deserialize)]
        struct Manifest {
            version: String,
        }
        let manifest: Manifest = serde_json::from_slice(&self.download(MANIFEST_URL)?)
            .map_err(|_| "Reason's release information is unavailable. Retry the installation.")?;
        Version::parse(&manifest.version)
    }

    fn version(&mut self, cli: &Path) -> Result<Version, String> {
        let mut cmd = self.command(cli);
        cmd.arg("--version");
        let bytes = self.run(cmd, Duration::from_secs(30), "version check")?;
        let text = std::str::from_utf8(&bytes)
            .map_err(|_| "Reason CLI version is not text")?
            .trim();
        Version::parse(
            text.strip_prefix("reason ")
                .or_else(|| text.strip_prefix("ara "))
                .unwrap_or(text),
        )
    }

    fn install(&mut self, directory: &Path, version: &Version) -> Result<(), String> {
        let script = self.download(INSTALL_URL)?;
        if !script.starts_with(b"#!/usr/bin/env bash\n") {
            return Err("Reason's installer is unavailable. Retry the installation.".into());
        }
        let script_path = self.scratch.0.join("install.sh");
        use std::io::Write;
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .mode(0o600)
            .open(&script_path)
            .map_err(|_| "Could not save Reason's installer")?;
        file.write_all(&script)
            .map_err(|_| "Could not save Reason's installer")?;
        drop(file);
        self.run(
            self.install_command(&script_path, directory, version),
            Duration::from_secs(300),
            "installation",
        )?;
        Ok(())
    }
}

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Result<Self, String> {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        for _ in 0..100 {
            let path = std::env::temp_dir().join(format!(
                "openconductor-reason-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            match fs::DirBuilder::new().mode(0o700).create(&path) {
                Ok(()) => return Ok(Self(path)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(_) => return Err("Could not create a private Reason installer folder".into()),
            }
        }
        Err("Could not create a private Reason installer folder".into())
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[cfg(test)]
#[path = "install_tests.rs"]
mod tests;
