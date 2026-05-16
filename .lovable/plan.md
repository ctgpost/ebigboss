## অফলাইন প্রোডাক্ট + POS, এনহ্যান্সড ব্যাকআপ/রিস্টোর সিস্টেম

### Part 1 — অফলাইন Product Add (নতুন/পুরাতন উভয়)

**বর্তমান অবস্থা:** `src/components/Products.tsx`-এ ইতিমধ্যে `queueIfOffline("product_insert", ...)` আছে এবং `offlineQueue.ts`-এ replay handler আছে। কিন্তু ছবি আপলোড (Cloudinary) অফলাইনে কাজ করে না — যা প্রোডাক্ট যোগ আটকে দিতে পারে।

**পরিবর্তন:**
- `Products.tsx`: অফলাইনে থাকলে Cloudinary আপলোড skip করে IndexedDB-তে blob হিসেবে রাখা, পরে অনলাইনে এলে replay-এর সময় Cloudinary-তে আপলোড করে `image_url` সেট হবে।
- নতুন/পুরাতন (condition: new/used) — উভয়ের জন্যই form validation অফলাইনে চলবে।
- IMEI দিয়ে duplicate চেক — অফলাইনে cache থেকে চেক হবে।

### Part 2 — কখনই Refresh-এ অফলাইন ডেটা হারাবে না (সব ডিভাইস/ব্রাউজার)

- `public/sw.js` enhance: Workbox-style cache-first strategy for app shell + stale-while-revalidate for Supabase REST GET; offline queue persistence via IndexedDB (localStorage-এর বদলে IDB যাতে private mode/Safari-তেও থাকে)।
- `App.tsx`-এ Service Worker register + update prompt।
- React Query persistence: `@tanstack/query-persist-client-core` + IDB persister যাতে refresh-এর পরও cached data দেখায়।
- offline queue migrate from localStorage → IndexedDB (data safer across refresh)।

### Part 3 — POS অফলাইন বিক্রয়

**বর্তমান অবস্থা:** `POS.tsx`-এ `queueIfOffline("sales_complete", ...)` আছে এবং replay handler বাস্তব। কাজ করছে, কিন্তু:
- Stock immediately UI-তে কমে না অফলাইনে।
- Invoice দেখানো হয় কিন্তু কোনো indicator নেই যে এটি "queued"।

**পরিবর্তন:**
- offline sale-এর সময় local product cache-এর stock immediately deduct করে query cache update।
- Invoice-এ "অফলাইন — সিঙ্ক হবে" badge।
- Sync হলে toast: "X টি অফলাইন বিক্রয় সিঙ্ক হয়েছে"।

### Part 4 — Backup/Restore Role-Based Access

- `Settings.tsx` (বা যেখানে backup আছে) — `useUserRole()` চেক করে শুধু `admin` দেখাবে।
- Manager/Staff-কে দেখালে Bengali toast: "শুধুমাত্র অ্যাডমিন এই কাজ করতে পারবেন"।

### Part 5 — Restore Dry-Run Mode

- নতুন `BackupRestore.tsx` (বা existing enhance) — Dry-Run toggle।
- Dry-run: backup JSON parse → প্রতিটি table-এর জন্য:
  - Record count
  - FK conflict detection (e.g., `sale_items.product_id` যদি products-এ না থাকে)
  - Duplicate PK check
  - Missing required field check
- Result panel: ✅ pass / ⚠️ warnings / ❌ errors per table।
- শুধু "All Pass" হলে actual restore button enable।

### Part 6 — Post-Restore Validation Report

- Restore শেষে: backup-এর প্রতিটি table count vs DB-এর actual count (Supabase `select count(*)`)।
- Mismatch highlighted table দেখাবে।
- Downloadable PDF/JSON report।

### Part 7 — রাত ১০:৩০-এ অটো ব্যাকআপ (Full ZIP)

- `useScheduledBackup()` hook — `App.tsx`-এ mount; localStorage-এ last-run date track।
- প্রতিদিন 22:30 (Bangladesh time)-এ চেক, যদি আজকের ব্যাকআপ না হয়ে থাকে → trigger।
- ZIP contains:
  - `database.json` — সব table-এর data
  - `reports/sales-daily.json`, `sales-weekly.json`, `sales-monthly.json`
  - `reports/profit-loss.json`
  - `reports/returns-summary.json`
  - `reports/stock-status.json`
  - `reports/staff-performance.json`
  - `reports/customer-summary.json`
  - `reports/supplier-summary.json`
  - `metadata.json` — backup time, totals, version
- JSZip দিয়ে ZIP তৈরি → auto-download → toast।
- Settings-এ manual "এখনই ব্যাকআপ" button + schedule on/off।

### Technical Stack

- নতুন packages: `jszip`, `idb` (IndexedDB wrapper), `@tanstack/query-sync-storage-persister` (optional)।
- নতুন files: `src/utils/idbQueue.ts`, `src/utils/backupZip.ts`, `src/hooks/useScheduledBackup.ts`, `src/components/BackupRestore.tsx` (enhanced)।
- Edit: `Products.tsx`, `POS.tsx`, `App.tsx`, `Settings.tsx`, `public/sw.js`, `src/main.tsx`।

### Phasing (delivery order)

1. **Phase A** — Service Worker + IDB queue migration + React Query persistence (refresh-safe foundation)।
2. **Phase B** — Products অফলাইন (image blob queue) + POS offline stock-deduct UX।
3. **Phase C** — Backup ZIP + 10:30 PM scheduler।
4. **Phase D** — Restore dry-run + validation report + role gate।

Each phase tested before moving on। প্রতিটি phase শেষে confirm চাইব।

**শুরু করতে "হ্যাঁ" বলুন — আমি Phase A দিয়ে শুরু করব।**
