
## Returns 360° — Phased Delivery Plan

আপনি ৪টি phase select করেছেন। সবগুলো একসাথে এক message এ shipping করলে বড় bug risk আছে। তাই আমি **এক message এ এক phase complete** করব এবং প্রতি phase শেষে আপনাকে test করতে বলব। প্রতিটা phase পুরোপুরি 360° functional হবে।

---

### Phase 1 — Exchange Flow + Audit Log + Real-time Search

**1. Customer Mobile Exchange (Manual pricing)**
- Returns dialog এ নতুন **"Exchange"** mode add করব (cash/exchange/store_credit/replacement)।
- পুরাতন mobile (returned IMEI) → stock এ +1 (already supported)।
- নতুন mobile (exchange_product) → search by IMEI/name/barcode, stock -1 atomically।
- Manual price difference field: **পার্থক্য (৳)** — positive = customer extra দিবে, negative = refund/credit।
- Difference handling: cash collect/refund payment row create হবে।
- Approve হওয়ার পরই exchange product stock কমবে (process_sales_return RPC update)।

**2. Audit Log (Sales & Supplier Returns)**
- নতুন table: `return_audit_logs` (return_type, return_id, action, actor, before/after JSON, stock_impact, ledger_impact, notes, ip)।
- Triggers on `returns` ও `supplier_returns` (INSERT/UPDATE/DELETE) — automatic record।
- UI: প্রতিটা return card এ "Audit Trail" expandable section — কে/কখন/কী change করল।

**3. Real-time Search (Sales Returns)**
- ইতিমধ্যে `search_sale_ids_for_return` RPC আছে যা IMEI/invoice/return number support করে।
- Search debounce 150ms → instant feel; supabase realtime subscribe করব `returns` table এ যাতে নতুন return আসলে list auto-refresh হয়।

---

### Phase 2 — Stock Impact Preview + Unified Dashboard

- Approve dialog এ **Stock Impact Preview** card: `প্রোডাক্ট X — Stock 0 → 1`, `Exchange প্রোডাক্ট Y — Stock 1 → 0`, `Sale total: ৳12000 → ৳5000`, `Customer payment refund: ৳7000`।
- নতুন route/tab: **Unified Returns Dashboard** — Sales + Supplier returns একসাথে, status filter (pending/completed/rejected), real-time totals (count + amount), Supabase realtime subscribed।

---

### Phase 3 — Reconciliation Report + Reports Impact

- নতুন report: **Return Reconciliation** — period select করে invoices vs returned items vs stock movements vs payments compare; mismatch row highlighted (e.g., return approved কিন্তু stock apply হয়নি, payment row missing, ইত্যাদি)।
- Reports/Dashboard verify: profit-loss daily/weekly/monthly এ approved returns deducted হচ্ছে কিনা check ও fix। `process_sales_return` ইতিমধ্যে `sales.total_amount`, `paid_amount`, `due_amount` adjust করে — Reports component এ এই adjusted values use হচ্ছে কিনা confirm।

---

### Phase 4 — Offline POS Test Checklist

- POS page এ একটা collapsible panel: **"অফলাইন টেস্ট চেকলিস্ট"** —
  - Network status indicator (online/offline)
  - Pending offline queue count (live)
  - Step-by-step checklist: ① Offline mode on করুন, ② Product add test, ③ Sale complete test, ④ Online হলে sync verify
  - প্রতিটা step এ pass/fail badge real-time update।

---

### Technical Details

**Database migrations (Phase 1):**
```sql
CREATE TABLE return_audit_logs (
  id uuid PK, return_type text, return_id uuid, action text,
  actor_id uuid, actor_email text, before_state jsonb, after_state jsonb,
  stock_impact jsonb, ledger_impact jsonb, notes text, ip_address text,
  created_at timestamptz default now()
);
-- RLS: admin/manager view all, others own; insert by authenticated.
-- Triggers: log_return_change() on returns/supplier_returns INSERT/UPDATE/DELETE.
-- Update process_sales_return: handle exchange_product_id stock decrement + cash diff payment row.
```

**Files to edit (Phase 1):**
- `src/components/Returns.tsx` — exchange UI, audit panel, realtime subscribe
- `src/components/SupplierReturns.tsx` — audit panel
- New: `src/components/returns/ReturnAuditTrail.tsx`, `src/components/returns/ExchangeProductPicker.tsx`
- DB migration for audit table + triggers + exchange logic refinement

**Confirmation needed:** শুরু করি? শুধু **"হ্যাঁ"** বললে Phase 1 implement করব, complete হলে test করতে বলব, তারপর Phase 2 এ যাব।
