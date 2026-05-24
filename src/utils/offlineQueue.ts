import { supabase } from "@/integrations/supabase/client";

export type OfflineAction = {
  id: string;
  type: string;
  payload: any;
  createdAt: string;
};

const QUEUE_KEY = "big-boss-offline-action-queue-v1";

const readQueue = (): OfflineAction[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
};

const writeQueue = (queue: OfflineAction[]) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent("big-boss-offline-queue", { detail: queue.length }));
};

export const getOfflineQueueCount = () => readQueue().length;

export const queueOfflineAction = (type: string, payload: any) => {
  const action: OfflineAction = {
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  writeQueue([...readQueue(), action]);
  return action;
};

const isOfflineError = (error: any) => {
  const message = `${error?.message || error || ""}`.toLowerCase();
  return !navigator.onLine || message.includes("failed to fetch") || message.includes("network") || message.includes("offline");
};

export const queueIfOffline = (type: string, payload: any, error: any) => {
  if (!isOfflineError(error)) throw error;
  return queueOfflineAction(type, payload);
};

async function replayAction(action: OfflineAction) {
  const p = action.payload || {};

  if (action.type === "supplier_return_create") {
    const { returnItem, autoApprove, actorId, ...returnPayload } = p;
    const { data: ret, error } = await (supabase as any).from("supplier_returns").insert(returnPayload).select("*").single();
    if (error) throw error;
    const { error: itemError } = await (supabase as any).from("supplier_return_items").insert({ ...returnItem, supplier_return_id: ret.id });
    if (itemError) throw itemError;
    if (autoApprove) {
      const { error: processError } = await (supabase as any).rpc("process_supplier_return", { _return_id: ret.id, _action: "approve", _actor_id: actorId, _reject_reason: null });
      if (processError) throw processError;
    }
    return;
  }

  if (action.type === "supplier_return_process") {
    const { error } = await (supabase as any).rpc("process_supplier_return", { _return_id: p.returnId, _action: p.action, _actor_id: p.actorId, _reject_reason: p.reason || null });
    if (error) throw error;
    return;
  }

  if (action.type === "supplier_return_edit") {
    const { id, updates } = p;
    const { error } = await (supabase as any).from("supplier_returns").update(updates).eq("id", id).eq("status", "pending");
    if (error) throw error;
    return;
  }

  if (action.type === "purchase_create") {
    const { purchase, items, client_request_id } = p;
    const { error } = await (supabase as any).rpc("create_purchase_idempotent", {
      _request_id: client_request_id || purchase.client_request_id,
      _purchase: purchase,
      _items: items,
    });
    if (error) throw error;
    return;
  }

  if (action.type === "product_insert") {
    const { error } = await (supabase as any).from("products").insert([p.data]);
    if (error) throw error;
    return;
  }

  if (action.type === "customer_insert") {
    const { error } = await (supabase as any).from("customers").insert([p.data]);
    if (error) throw error;
    return;
  }

  if (action.type === "customer_update") {
    const { error } = await (supabase as any).from("customers").update(p.data).eq("id", p.id);
    if (error) throw error;
    return;
  }

  if (action.type === "sales_complete") {
    const { sale, items, client_request_id } = p;
    const { error } = await (supabase as any).rpc("complete_sale_idempotent", {
      _request_id: client_request_id || sale.client_request_id,
      _sale: sale,
      _items: items,
    });
    if (error) throw error;
    return;
  }

  if (action.type === "sales_return_create") {
    const { autoApprove, actorId, ...returnPayload } = p;
    const { data, error } = await (supabase as any).from("returns").insert([returnPayload]).select("*").single();
    if (error) throw error;
    if (autoApprove) {
      const { error: processError } = await (supabase as any).rpc("process_sales_return", { _return_id: data.id, _action: "approve", _actor_id: actorId, _reject_reason: null });
      if (processError) throw processError;
    }
    return;
  }

  if (action.type === "sales_return_process") {
    const { error } = await (supabase as any).rpc("process_sales_return", { _return_id: p.returnId, _action: p.action, _actor_id: p.actorId, _reject_reason: p.reason || null });
    if (error) throw error;
    return;
  }

  if (action.type === "shop_settings_update") {
    const { error } = await (supabase as any).from("shop_settings").update(p.updates).eq("id", p.id);
    if (error) throw error;
  }
}

let syncing = false;
export const flushOfflineQueue = async () => {
  if (syncing || typeof window === "undefined" || !navigator.onLine) return { synced: 0, remaining: getOfflineQueueCount() };
  syncing = true;
  let queue = readQueue();
  let synced = 0;
  try {
    while (queue.length) {
      const [action, ...rest] = queue;
      await replayAction(action);
      synced += 1;
      queue = rest;
      writeQueue(queue);
    }
    return { synced, remaining: 0 };
  } finally {
    syncing = false;
  }
};

export const registerOfflineQueueSync = (onSynced?: (count: number) => void) => {
  const sync = () => flushOfflineQueue().then((r) => r.synced > 0 && onSynced?.(r.synced)).catch(() => undefined);
  window.addEventListener("online", sync);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
  sync();
  return () => window.removeEventListener("online", sync);
};
