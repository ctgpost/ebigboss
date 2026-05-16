import { useEffect } from "react";
import { downloadFullZipBackup } from "@/utils/backupZip";
import { toast } from "sonner";

const STORAGE_KEY = "big-boss-last-auto-backup-date";
const SCHEDULED_HOUR = 22; // 10 PM
const SCHEDULED_MINUTE = 30;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function runIfDue(force = false) {
  const now = new Date();
  const last = localStorage.getItem(STORAGE_KEY);
  const today = todayKey();
  if (!force) {
    if (last === today) return;
    if (now.getHours() < SCHEDULED_HOUR) return;
    if (now.getHours() === SCHEDULED_HOUR && now.getMinutes() < SCHEDULED_MINUTE) return;
  }
  try {
    toast.info("🌙 অটো ব্যাকআপ চলছে...");
    const { counts, filename } = await downloadFullZipBackup();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    localStorage.setItem(STORAGE_KEY, today);
    toast.success(`✅ অটো ব্যাকআপ সম্পন্ন: ${filename} (${total.toLocaleString("bn-BD")} রেকর্ড)`);
  } catch (e: any) {
    toast.error("অটো ব্যাকআপ ব্যর্থ: " + (e?.message || ""));
  }
}

export function useScheduledBackup(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    // Check immediately on mount
    const t1 = setTimeout(() => runIfDue(), 5000);
    // Then re-check every 5 minutes
    const interval = setInterval(() => runIfDue(), 5 * 60 * 1000);
    return () => { clearTimeout(t1); clearInterval(interval); };
  }, [enabled]);
}

export async function runManualScheduledBackup() {
  return runIfDue(true);
}
