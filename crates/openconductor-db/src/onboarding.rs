//! First-run onboarding state, kept in the `settings` table under the
//! reference's keys.
//!
//! Conductor v0.87.6 reads `first_time_onboarding_step` (unset reads as
//! `"1"`) and its auth guard shows the first-run onboarding while the user
//! has no repositories and that step is at most 1. Finishing onboarding
//! writes `first_time_onboarding_step = "999"` and `onboarding_step = "4"`
//! (`rI.DONE`) together. Evidence: `index-BGEQ8YjU.js` `w5t` @395554,
//! `e6t`/`t6t` @412190/@412267, `_5t = 999` @395545; `renderApp-D_fmY7hW.js`
//! `Doa` @~10153000, `Bxa`/`Pya` @11099000/@11061033 (byte offsets);
//! `evidence/screens/first-run-onboarding.md`.

use sqlx::sqlite::SqlitePool;

use crate::{app_settings, Result};

/// The setting that gates the first-run onboarding.
pub const FIRST_RUN_STEP_KEY: &str = "first_time_onboarding_step";
/// The in-app onboarding checklist step, set to done with the first run.
pub const ONBOARDING_STEP_KEY: &str = "onboarding_step";
/// `first_time_onboarding_step` once onboarding is finished (`_5t`).
pub const FIRST_RUN_DONE: &str = "999";
/// `onboarding_step` done (`rI.DONE`; FIRST_MESSAGE 0 .. REVIEW_CHANGES 3).
pub const ONBOARDING_DONE: &str = "4";

/// The stored `first_time_onboarding_step`, raw; `None` when never written.
/// The frontend parses it the way the reference does (`parseInt(v ?? "1")`).
pub async fn first_run_step(pool: &SqlitePool) -> Result<Option<String>> {
    app_settings::get(pool, FIRST_RUN_STEP_KEY).await
}

/// Mark first-run onboarding finished: both keys, in one transaction so a
/// failure leaves neither half written.
pub async fn finish_first_run(pool: &SqlitePool) -> Result<()> {
    let mut tx = pool.begin().await?;
    for (key, value) in [
        (FIRST_RUN_STEP_KEY, FIRST_RUN_DONE),
        (ONBOARDING_STEP_KEY, ONBOARDING_DONE),
    ] {
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
            .bind(key)
            .bind(value)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
