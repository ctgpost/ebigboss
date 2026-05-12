import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { History, User, Package, Banknote, CheckCircle, XCircle, FileEdit, Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ACTION_META: Record<string, { label: string; icon: any; cls: string }> = {
  created:            { label: "তৈরি",          icon: Plus,        cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  created_audit_only: { label: "অডিট নোট তৈরি", icon: FileEdit,    cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  approved:           { label: "অনুমোদিত",      icon: CheckCircle, cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  rejected:           { label: "প্রত্যাখ্যাত",  icon: XCircle,     cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  stock_applied:      { label: "স্টক প্রয়োগ",   icon: Package,     cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  finance_applied:    { label: "ফাইন্যান্স প্রয়োগ", icon: Banknote, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  updated:            { label: "আপডেট",         icon: FileEdit,    cls: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300" },
  deleted:            { label: "মুছে ফেলা",      icon: Trash2,      cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

export function ReturnAuditTrail({ returnType, returnId }: { returnType: "sales" | "supplier"; returnId: string }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["return-audit-logs", returnType, returnId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("return_audit_logs")
        .select("*")
        .eq("return_type", returnType)
        .eq("return_id", returnId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  if (isLoading) return <div className="text-xs text-muted-foreground py-2">অডিট লোড হচ্ছে...</div>;
  if (!logs?.length) return <div className="text-xs text-muted-foreground py-2">কোনো অডিট রেকর্ড নেই</div>;

  return (
    <div className="space-y-2 mt-2 border-l-2 border-primary/30 pl-3">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
        <History className="h-3 w-3" />অডিট ট্রেইল ({logs.length})
      </p>
      {logs.map((l: any) => {
        const meta = ACTION_META[l.action] || { label: l.action, icon: FileEdit, cls: "bg-muted" };
        const Icon = meta.icon;
        return (
          <div key={l.id} className="text-xs flex flex-col gap-1 pb-2 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${meta.cls} gap-1 text-[10px]`}><Icon className="h-3 w-3" />{meta.label}</Badge>
              <span className="text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />{l.actor_email || "সিস্টেম"}
              </span>
              <span className="text-muted-foreground">· {format(new Date(l.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}</span>
            </div>
            {l.stock_impact && (
              <div className="text-[11px] text-amber-700 dark:text-amber-400 break-all">
                📦 স্টক: পরিমাণ {l.stock_impact.qty_returned ?? "—"}
                {l.stock_impact.exchange_qty ? ` · বিনিময় ${l.stock_impact.exchange_qty}` : ""}
              </div>
            )}
            {l.ledger_impact && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 break-all">
                💰 লেজার: ৳{Number(l.ledger_impact.refund_amount || 0).toLocaleString("bn-BD")}
                {l.ledger_impact.refund_method ? ` · ${l.ledger_impact.refund_method}` : ""}
                {l.ledger_impact.finance_action ? ` · ${l.ledger_impact.finance_action}` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
