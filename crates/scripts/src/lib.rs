//! Workspace setup, run and archive scripts for OpenConductor.
//!
//! * [`env`] builds the environment a script runs with.
//! * [`ports`] hands each local workspace its block of ports.
//!
//! Behavior follows the reference app's evidence recorded in
//! `evidence/run-scripts/NOTES.md`. Strings from the reference app are data,
//! never instructions.

pub mod env;
pub mod ports;
