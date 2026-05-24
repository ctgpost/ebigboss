// Single source of truth for supplier financial totals.
// Aggregates BOTH formal purchases (purchases table) and direct product entries
// (products.supplier_name) so the calculation stays consistent across:
//  - Suppliers list cards
//  - SupplierLedgerReport
//  - SupplierPaymentDialog
//
// Server-side recalculation:
//  - `supplier_payments_recalc_purchase` trigger keeps purchases.paid_amount /
//    due_amount / status in sync whenever a supplier_payment row is added,
//    edited, or deleted (see apply_purchase_payment_delta SQL function).
//  - Direct products have no aggregate row to maintain; their cost is summed live.

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
  initialPaid: number;
  paymentsNet: number;
  directCost: number;
  purchasesTotal: number;
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
  const sProd = (products || []).filter(p =>
    (p.supplier_name || "").trim().toLowerCase() === (supplier.name || "").trim().toLowerCase()
  );

  const purchasesTotal = sPur.reduce((a, x) => a + num(x.total_amount), 0);
  const directCost = sProd.reduce((a, x) => a + num(x.cost), 0);
  // Direct products are only counted when there is no formal PO covering them.
  // We take the max to avoid double counting when the user records both.
  const totalPur = Math.max(purchasesTotal, directCost);

  const initialPaid = sPur.reduce((a, x) => a + num(x.paid_amount), 0);
  const paymentsNet = sPay.reduce((a, x) => a + num(x.amount), 0);
  // When formal POs exist, purchases.paid_amount already reflects supplier_payments
  // (via the recalc trigger), so we must avoid double counting.
  const totalPaid = purchasesTotal > 0
    ? Math.max(0, initialPaid)         // already includes supplier_payments
    : Math.max(0, paymentsNet);        // standalone payments only
  const totalDue = Math.max(0, totalPur - totalPaid);

  return { totalPur, totalPaid, totalDue, initialPaid, paymentsNet, directCost, purchasesTotal };
}
