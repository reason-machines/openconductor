use openconductor_db::{app_settings, onboarding, open_in_memory};

#[tokio::test]
async fn first_run_step_is_unset_on_a_new_database() {
    let pool = open_in_memory().await.unwrap();
    assert_eq!(onboarding::first_run_step(&pool).await.unwrap(), None);
}

#[tokio::test]
async fn finish_writes_both_reference_keys() {
    let pool = open_in_memory().await.unwrap();
    let key = onboarding::FIRST_RUN_STEP_KEY;
    app_settings::set(&pool, key, "1").await.unwrap();
    onboarding::finish_first_run(&pool).await.unwrap();
    let step = onboarding::first_run_step(&pool).await.unwrap();
    assert_eq!(step.as_deref(), Some("999"));
    let checklist = app_settings::get(&pool, "onboarding_step").await.unwrap();
    assert_eq!(checklist.as_deref(), Some("4"));
    // Finishing again is harmless.
    onboarding::finish_first_run(&pool).await.unwrap();
    let step = onboarding::first_run_step(&pool).await.unwrap();
    assert_eq!(step.as_deref(), Some("999"));
}
