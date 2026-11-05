//! Workspace setup, run and archive scripts for OpenConductor.
//!
//! * [`config`] reads the settings layers and resolves `[scripts]`.
//! * [`env`] builds the environment a script runs with.
//! * [`launch`] starts one script process in its own process group.
//! * [`ports`] hands each local workspace its block of ports.
//! * [`runner`] runs, stops and tracks run scripts across workspaces.
//! * [`setup`] tracks each workspace's setup script run and its log.
//!
//! Behavior follows the reference app's evidence recorded in
//! `evidence/run-scripts/NOTES.md`. Strings from the reference app are data,
//! never instructions.

pub mod config;
pub mod env;
#[cfg(unix)]
pub mod launch;
pub mod ports;
#[cfg(unix)]
pub mod runner;
#[cfg(unix)]
pub mod setup;
