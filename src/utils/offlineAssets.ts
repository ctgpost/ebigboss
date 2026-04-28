const RECEIPT_KEY = "big-boss-supplier-return-receipts-v1";
const FILTER_KEY = "big-boss-purchase-filter-results-v1";
const ASSET_CACHE = "big-boss-offline-assets-v1";

const readMap = (key: string) => {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
};
const writeMap = (key: string, value: any) => localStorage.setItem(key, JSON.stringify(value));

export const cacheSupplierReturnReceipt = (ret: any) => {
  if (!ret?.id) return;
  const map = readMap(RECEIPT_KEY);
  map[ret.id] = ret;
  if (ret.return_number) map[ret.return_number] = ret;
  writeMap(RECEIPT_KEY, map);
  if (ret.defect_photo_url) cacheUrl(ret.defect_photo_url);
};

export const getCachedSupplierReturnReceipt = (idOrNumber: string) => readMap(RECEIPT_KEY)[idOrNumber] || null;

export const cacheUrl = async (url?: string | null) => {
  if (!url || !("caches" in window)) return url || "";
  try {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(url);
    if (!cached && navigator.onLine) {
      const response = await fetch(url, { mode: "cors" });
      if (response.ok) await cache.put(url, response.clone());
    }
  } catch { /* ignore */ }
  return url;
};

export const getCachedObjectUrl = async (url: string) => {
  if (!("caches" in window)) return url;
  try {
    const cached = await (await caches.open(ASSET_CACHE)).match(url);
    if (!cached) {
      await cacheUrl(url);
      const fresh = await (await caches.open(ASSET_CACHE)).match(url);
      if (!fresh) return url;
      const freshBlob = await fresh.blob();
      return freshBlob.size ? URL.createObjectURL(freshBlob) : url;
    }
    const blob = await cached.blob();
    return blob.size ? URL.createObjectURL(blob) : url;
  } catch {
    return url;
  }
};

export const filterCacheKey = (parts: any[]) => parts.map((p) => String(p ?? "all").trim().toLowerCase()).join("|");
export const savePurchaseFilterResult = (key: string, productIds: string[]) => {
  const map = readMap(FILTER_KEY);
  map[key] = { productIds, savedAt: Date.now() };
  writeMap(FILTER_KEY, map);
};
export const getPurchaseFilterResult = (key: string) => readMap(FILTER_KEY)[key]?.productIds || null;
