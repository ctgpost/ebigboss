import { supabase } from "@/integrations/supabase/client";

/**
 * Supabase/PostgREST caps a single response at ~1000 rows. This helper pages
 * through a table in 1000-row chunks and returns ALL matching rows.
 *
 * Usage:
 *   const rows = await fetchAll("products", (q) => q.select("*, categories(name)").order("name"));
 */
export async function fetchAll<T = any>(
  table: string,
  build?: (q: any) => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // hard safety cap to avoid infinite loops
  for (let i = 0; i < 500; i++) {
    let q: any = (supabase as any).from(table);
    q = build ? build(q) : q.select("*");
    q = q.range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = (data as T[]) || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
