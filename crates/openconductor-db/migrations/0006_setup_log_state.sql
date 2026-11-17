-- Persist the setup script's last-run outcome state alongside its log path
-- so the Setup tab can show the previous run's transcript after a restart.
-- NULL means no run has been recorded (new column, or setup has not run since).
ALTER TABLE workspaces ADD COLUMN setup_log_state TEXT;
