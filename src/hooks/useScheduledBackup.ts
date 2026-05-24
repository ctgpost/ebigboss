import { useEffect } from "react";
import { downloadFullZipBackup, downloadFullJsonBackup } from "@/utils/backupZip";
import { toast } from "sonner";

const STORAGE_KEY = "big-boss-last-auto-backup-date";
const SCHEDULED_HOUR = 22; // 10 PM
const SCHEDULED_MINUTE = 30;

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function scheduledPassedToday(now: Date) {
  if (now.getHours() > SCHEDULED_HOUR) return true;
  if (now.getHours() === SCHEDULED_HOUR && now.getMinutes() >= SCHEDULED_MINUTE) return true;
  return false;
}

async function runIfDue(force = false) {
  const now = new Date();
  const last = localStorage.getItem(STORAGE_KEY);
  const today = todayKey(now);

  if (!force) {
    if (last === today) return;
    // Catch-up: if a previous day was missed (last < today OR no record), run immediately.
    // Otherwise wait until today's scheduled time.
    const missedPrevDay = !last || last < today;
    if (!missedPrevDay && !scheduledPassedToday(now)) return;
    if (missedPrevDay && last === null) {
      // First-ever run on this device — only catch up if past today's window OR last sched.
      // Allow first run any time so user has at least one snapshot.
    }
  }

  try {
    toast.info("🌙 অটো ব্যাকআপ চলছে...");
    const zipRes = await downloadFullZipBackup();
    // Also download the plain JSON snapshot per user requirement.
    let jsonName = "";
    try {
      const jsonRes = await downloadFullJsonBackup();
      jsonName = jsonRes.filename;
    } catch (e) {
      console.warn("[backup] JSON download failed:", e);
    }
    const total = Object.values(zipRes.counts).reduce((a, b) => a + b, 0);
    localStorage.setItem(STORAGE_KEY, today);
    toast.success(
      `✅ অটো ব্যাকআপ সম্পন্ন: ${zipRes.filename}${jsonName ? ` + ${jsonName}` : ""} (${total.toLocaleString("bn-BD")} রেকর্ড)`,
    );
  } catch (e: any) {
    toast.error("অটো ব্যাকআপ ব্যর্থ: " + (e?.message || ""));
  }
}

export function useScheduledBackup(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    // Check shortly after mount (catch-up for missed days)
    const t1 = setTimeout(() => runIfDue(), 5000);
    // Then re-check every 5 minutes
    const interval = setInterval(() => runIfDue(), 5 * 60 * 1000);
    return () => { clearTimeout(t1); clearInterval(interval); };
  }, [enabled]);
}

export async function runManualScheduledBackup() {
  return runIfDue(true);
}
