import { invoke } from "@tauri-apps/api/core";

export async function notificationPermissionGranted(): Promise<boolean> {
  const permission = window.Notification.permission;
  const granted = permission === "default"
    ? await invoke<boolean>("plugin:notification|is_permission_granted")
    : permission === "granted";
  return granted || await window.Notification.requestPermission() === "granted";
}
