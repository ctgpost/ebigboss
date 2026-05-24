// Single source of truth for supplier financial totals.
// Aggregates BOTH formal purchases (purchases table) and direct product entries
// (products.supplier_name) so the calculation stays consistent across:
//  - Suppliers list cards
//  - SupplierLedgerReport
//  - SupplierPaymentDialog
//
// Server-side recalculation:
//  - `supplier_payments_recalc_purchase` trigger keeps purchases.paid_amount /
//    due_amount / status in sync on UPDATE/DELETE of supplier_payments.
//  - `collect_supplier_payment_idempotent` RPC updates purchases on INSERT.
//  - Direct products have no aggregate row; their cost is summed live.

export interface SupplierLike { id: string; name: string }
export interface PurchaseLike {
  id: string; supplier_id: string | null;
  total_amount: number | string; paid_amount?: number | string | null;
  due_amount?: number | string | null;
}
export interface SupplierPaymentLike {
  id: string; supplier_id: string; purchase_id?: string | null;
  amount: number | string; supplier_return_id?: string | null;
}
export interface ProductLike {
  id: string; supplier_name?: string | null; cost: number | string;
}

export interface SupplierTotals {
  totalPur: number;
  totalPaid: number;
  totalDue: number;
  purchasesTotal: number;
  directCost: number;
  initialPaid: number;
  standalonePay: number;
  paymentsNet: number;
}

const num = (v: any) => Number(v || 0);

export function computeSupplierTotals(
  supplier: SupplierLike,
  purchases: PurchaseLike[] | undefined | null,
  payments: SupplierPaymentLike[] | undefined | null,
  products?: ProductLike[] | null,
): SupplierTotals {
  const sPur = (purchases || []).filter(p => p.supplier_id === supplier.id);
  const sPay = (payments || []).filter(p => p.supplier_id === supplier.id);
  const supName = (supplier.name || "").trim().toLowerCase();
  const sProd = (products || []).filter(
    p => (p.supplier_name || "").trim().toLowerCase() === supName,
  );

  const purchasesTotal = sPur.reduce((a, x) => a + num(x.total_amount), 0);
  const directCost = sProd.reduce((a, x) => a + num(x.cost), 0);
  // Use whichever is larger to avoid double-counting (PO + same item entered directly).
  const totalPur = Math.max(purchasesTotal, directCost);

  // purchases.paid_amount is kept in sync with linked supplier_payments by trigger.
  // Standalone payments (purchase_id IS NULL) are NOT reflected there.
  const initialPaid = sPur.reduce((a, x) => a + num(x.paid_amount), 0);
  const standalonePay = sPay
    .filter(p => !p.purchase_id)
    .reduce((a, x) => a + num(x.amount), 0);
  const paymentsNet = sPay.reduce((a, x) => a + num(x.amount), 0);

  const totalPaid = Math.max(0, initialPaid + standalonePay);
  const totalDue = Math.max(0, totalPur - totalPaid);

  return {
    totalPur, totalPaid, totalDue,
    purchasesTotal, directCost, initialPaid, standalonePay, paymentsNet,
  };
}
