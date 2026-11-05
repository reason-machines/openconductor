//! Stopping a terminal.

use std::sync::Arc;

use super::manager::Session;
use super::spawn::Result;

pub(crate) fn stop(s: Arc<Session>) -> Result<()> {
    s.killer.lock().unwrap().kill()?;
    Ok(())
}
