import { exportAll } from "../store/db";

/** How long the backup's temporary address is kept alive, so the browser has time to save the file from it. */
const BACKUP_ADDRESS_LIFETIME_MS = 60_000;

/** Saves a backup of everything the learner has done as a file in the Downloads folder. */
export async function downloadBackup(): Promise<void> {
  const backup = new Blob([JSON.stringify(await exportAll())], { type: "application/json" });
  const backupAddress = URL.createObjectURL(backup);
  const link = document.createElement("a");
  link.href = backupAddress;
  link.download = `singing-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(backupAddress), BACKUP_ADDRESS_LIFETIME_MS);
}
