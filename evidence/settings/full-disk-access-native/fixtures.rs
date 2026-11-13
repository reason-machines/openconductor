use super::check_with;
use std::cell::Cell;
use std::io::{self, ErrorKind, Read};
use std::path::{Path, PathBuf};
use std::rc::Rc;

struct FakeReader {
    result: io::Result<usize>,
    calls: Rc<Cell<usize>>,
}

impl Read for FakeReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        assert_eq!(buffer.len(), 1, "The probe requests exactly one byte");
        self.calls.set(self.calls.get() + 1);
        if matches!(self.result, Ok(1)) {
            buffer[0] = 0x49;
        }
        std::mem::replace(&mut self.result, Ok(0))
    }
}

fn home() -> PathBuf {
    PathBuf::from("controlled-home with spaces")
}

fn expected_path() -> PathBuf {
    home().join("Library/Application Support/com.apple.TCC/TCC.db")
}

fn custom_error(kind: ErrorKind) -> io::Error {
    io::Error::new(kind, "injected fixture error")
}

const ERROR_KINDS: &[ErrorKind] = &[
    ErrorKind::PermissionDenied,
    ErrorKind::NotFound,
    ErrorKind::Other,
    ErrorKind::Interrupted,
    ErrorKind::WouldBlock,
    ErrorKind::Unsupported,
    ErrorKind::InvalidInput,
    ErrorKind::InvalidData,
    ErrorKind::UnexpectedEof,
    ErrorKind::TimedOut,
    ErrorKind::AlreadyExists,
    ErrorKind::IsADirectory,
];

#[test]
fn absent_home_returns_true_without_open_or_read() {
    let env_calls = Cell::new(0);
    let result = check_with(
        || {
            env_calls.set(env_calls.get() + 1);
            None
        },
        |_| -> io::Result<FakeReader> { panic!("Absent HOME must not open a path") },
    );
    assert!(result);
    assert_eq!(env_calls.get(), 1);
}

#[test]
fn open_errors_return_false_only_for_permission_denied_without_reading() {
    let constructors: [fn(ErrorKind) -> io::Error; 2] = [io::Error::from, custom_error];
    for constructor in constructors {
        for &kind in ERROR_KINDS {
            let open_calls = Cell::new(0);
            let result = check_with(
                || Some(home()),
                |path| -> io::Result<FakeReader> {
                    open_calls.set(open_calls.get() + 1);
                    assert_eq!(path, expected_path());
                    Err(constructor(kind))
                },
            );
            assert_eq!(result, kind != ErrorKind::PermissionDenied, "{kind:?}");
            assert_eq!(open_calls.get(), 1);
        }
    }
}

#[test]
fn read_errors_return_false_only_for_permission_denied_without_retrying() {
    let constructors: [fn(ErrorKind) -> io::Error; 2] = [io::Error::from, custom_error];
    for constructor in constructors {
        for &kind in ERROR_KINDS {
            let read_calls = Rc::new(Cell::new(0));
            let open_calls = Cell::new(0);
            let result = check_with(
                || Some(home()),
                |path| {
                    open_calls.set(open_calls.get() + 1);
                    assert_eq!(path, expected_path());
                    Ok(FakeReader {
                        result: Err(constructor(kind)),
                        calls: Rc::clone(&read_calls),
                    })
                },
            );
            assert_eq!(result, kind != ErrorKind::PermissionDenied, "{kind:?}");
            assert_eq!(open_calls.get(), 1);
            assert_eq!(read_calls.get(), 1, "No retry for {kind:?}");
        }
    }
}

#[test]
fn successful_zero_and_one_byte_reads_return_true_after_one_read() {
    for count in [0, 1] {
        let read_calls = Rc::new(Cell::new(0));
        let open_calls = Cell::new(0);
        let result = check_with(
            || Some(home()),
            |path| {
                open_calls.set(open_calls.get() + 1);
                assert_eq!(path, expected_path());
                Ok(FakeReader {
                    result: Ok(count),
                    calls: Rc::clone(&read_calls),
                })
            },
        );
        assert!(result, "A successful {count}-byte read returns true");
        assert_eq!(open_calls.get(), 1);
        assert_eq!(read_calls.get(), 1);
    }
}

#[test]
fn empty_home_is_present_and_joins_a_relative_probe_path() {
    let read_calls = Rc::new(Cell::new(0));
    assert!(check_with(
        || Some(PathBuf::new()),
        |path| {
            assert_eq!(
                path,
                Path::new("Library/Application Support/com.apple.TCC/TCC.db")
            );
            Ok(FakeReader {
                result: Ok(0),
                calls: Rc::clone(&read_calls),
            })
        },
    ));
    assert_eq!(read_calls.get(), 1);
}
