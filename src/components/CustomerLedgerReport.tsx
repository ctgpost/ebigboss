import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Pencil, Trash2, Search, Users, Wallet, CreditCard, ArrowDownLeft } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

export function CustomerLedgerReport() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [editAmt, setEditAmt] = useState("");
  const [editMethod, setEditMethod] = useState("cash");
  const [editNotes, setEditNotes] = useState("");
  const [deleting, setDeleting] = useState<any>(null);

  const { data: customers } = useQuery({
    queryKey: ["ledger-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,phone").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["ledger-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,customer_id,total_amount,paid_amount,due_amount,payment_method,status,created_at")
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["ledger-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id,sale_id,customer_id,amount,payment_method,notes,return_id,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ledger-sales"] });
    queryClient.invalidateQueries({ queryKey: ["ledger-payments"] });
    queryClient.invalidateQueries({ queryKey: ["sales"] });
    queryClient.invalidateQueries({ queryKey: ["payments"] });
    queryClient.invalidateQueries({ queryKey: ["sales-with-dues"] });
    queryClient.invalidateQueries({ queryKey: ["customer-sales"] });
    queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
  };

  const editMutation = useMutation({
    mutationFn: async ({ id, amount, method, notes, saleId }: any) => {
      const { data: others, error: pe } = await supabase
        .from("payments").select("amount").eq("sale_id", saleId).neq("id", id);
      if (pe) throw pe;
      const otherSum = (others || []).reduce((s, p) => s + Number(p.amount), 0);
      const { data: sale, error: se } = await supabase
        .from("sales").select("total_amount").eq("id", saleId).maybeSingle();
      if (se) throw se;
      const cap = Math.max(0, Number(sale?.total_amount || 0) - otherSum);
      if (amount > cap) throw new Error(`এই বিক্রয়ের সর্বোচ্চ আদায় ৳${cap.toLocaleString('bn-BD')}`);
      const { error } = await supabase
        .from("payments").update({ amount, payment_method: method, notes: notes || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("পেমেন্ট আপডেট হয়েছে"); setEditing(null); },
    onError: (e: any) => toast.error(e.message || "আপডেট ব্যর্থ"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (p: any) => {
      const { error } = await supabase.from("payments").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("পেমেন্ট মুছে ফেলা হয়েছে"); setDeleting(null); },
    onError: (e: any) => toast.error(e.message || "মুছতে ব্যর্থ"),
  });

  const rows = useMemo(() => {
    if (!customers) return [];
    return customers.map(c => {
      const cSales = sales?.filter(s => s.customer_id === c.id) || [];
      const cPays = payments?.filter(p => p.customer_id === c.id) || [];
      const totalSales = cSales.reduce((s, x) => s + Number(x.total_amount), 0);
      const totalPaid = cSales.reduce((s, x) => s + Number(x.paid_amount), 0);
      const totalDue = cSales.reduce((s, x) => s + Number(x.due_amount), 0);
      const totalCollected = cPays.reduce((s, x) => s + Number(x.amount), 0);
      return { ...c, cSales, cPays, totalSales, totalPaid, totalDue, totalCollected };
    });
  }, [customers, sales, payments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = q ? rows.filter(r => r.name.toLowerCase().includes(q) || (r.phone || "").includes(q)) : rows;
    return list.sort((a, b) => b.totalDue - a.totalDue);
  }, [rows, search]);

  const grand = useMemo(() => ({
    sales: rows.reduce((s, r) => s + r.totalSales, 0),
    paid: rows.reduce((s, r) => s + r.totalPaid, 0),
    due: rows.reduce((s, r) => s + r.totalDue, 0),
    customers: rows.filter(r => r.totalSales > 0).length,
  }), [rows]);

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-3">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">📒 কাস্টমার লেজার রিপোর্ট</h1>
        <p className="text-sm text-muted-foreground mt-1">সকল কাস্টমারের পূর্ণাঙ্গ হিসাব-নিকাশ — লাইভ ব্যালেন্স ও স্ট্যাটাস</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <Card className="p-3"><Users className="w-4 h-4 mb-1 text-primary" /><p className="text-lg font-bold">{grand.customers}</p><p className="text-xs text-muted-foreground">সক্রিয় কাস্টমার</p></Card>
          <Card className="p-3"><Wallet className="w-4 h-4 mb-1 text-primary" /><p className="text-lg font-bold text-primary">৳{grand.sales.toLocaleString('bn-BD')}</p><p className="text-xs text-muted-foreground">মোট বিক্রয়</p></Card>
          <Card className="p-3"><CreditCard className="w-4 h-4 mb-1 text-green-600" /><p className="text-lg font-bold text-green-600">৳{grand.paid.toLocaleString('bn-BD')}</p><p className="text-xs text-muted-foreground">আদায়</p></Card>
          <Card className="p-3"><ArrowDownLeft className="w-4 h-4 mb-1 text-destructive" /><p className="text-lg font-bold text-destructive">৳{grand.due.toLocaleString('bn-BD')}</p><p className="text-xs text-muted-foreground">মোট বাকি</p></Card>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="কাস্টমার নাম/ফোন দিয়ে খুঁজুন..." className="pl-9" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6 space-y-2 mt-3">
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">কোনো কাস্টমার নেই</Card>
        )}
        {filtered.map(r => {
          const isOpen = expanded === r.id;
          // Build chronological ledger with running balance
          type Row = { date: string; kind: 'sale' | 'pay'; label: string; amount: number; sign: 1 | -1; method?: string; payment?: any; balance?: number };
          const ledger: Row[] = [];
          r.cSales.forEach(s => {
            ledger.push({ date: s.created_at, kind: 'sale', label: `বিক্রয় #${s.id.slice(0, 8)}`, amount: Number(s.total_amount), sign: 1, method: s.payment_method });
            if (Number(s.paid_amount) > 0) {
              ledger.push({ date: s.created_at, kind: 'pay', label: `প্রাথমিক পরিশোধ`, amount: Number(s.paid_amount), sign: -1, method: s.payment_method });
            }
          });
          r.cPays.forEach(p => {
            const isRefund = Number(p.amount) < 0;
            ledger.push({
              date: p.created_at, kind: 'pay',
              label: isRefund ? `🔄 রিটার্ন রিফান্ড #${p.sale_id.slice(0, 8)}` : `বাকি আদায় #${p.sale_id.slice(0, 8)}`,
              amount: Math.abs(Number(p.amount)),
              sign: isRefund ? 1 : -1,
              method: p.payment_method,
              payment: p,
            });
          });
          ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          let bal = 0;
          ledger.forEach(x => { bal += x.sign * x.amount; x.balance = bal; });

          return (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.phone || '—'} • {r.cSales.length}টি বিক্রয়</p>
                </div>
                <div className="text-right grid grid-cols-3 gap-3 text-xs">
                  <div><p className="text-muted-foreground">বিক্রয়</p><p className="font-bold text-primary">৳{r.totalSales.toLocaleString('bn-BD')}</p></div>
                  <div><p className="text-muted-foreground">আদায়</p><p className="font-bold text-green-600">৳{r.totalPaid.toLocaleString('bn-BD')}</p></div>
                  <div><p className="text-muted-foreground">বাকি</p><p className={`font-bold ${r.totalDue > 0 ? 'text-destructive' : 'text-green-600'}`}>৳{r.totalDue.toLocaleString('bn-BD')}</p></div>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {ledger.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">কোনো লেনদেন নেই</p>
                  ) : ledger.slice().reverse().map((x, i) => {
                    const p = x.payment;
                    const canEdit = isAdmin && p && !p.return_id && Number(p.amount) > 0;
                    return (
                      <div key={i} className="flex items-center justify-between border border-border rounded-lg p-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant={x.kind === 'sale' ? 'destructive' : 'default'} className="text-[10px] shrink-0">
                            {x.kind === 'sale' ? '🛒' : '💵'}
                          </Badge>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{x.label}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(x.date), "dd MMM yyyy, hh:mm a")}{x.method ? ` • ${x.method}` : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="text-right">
                            <p className={`font-bold ${x.sign === 1 ? 'text-destructive' : 'text-green-600'}`}>{x.sign === 1 ? '+' : '−'}৳{x.amount.toLocaleString('bn-BD')}</p>
                            <p className="text-[10px] text-muted-foreground">বাকি: ৳{(x.balance || 0).toLocaleString('bn-BD')}</p>
                          </div>
                          {canEdit && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                setEditing(p); setEditAmt(String(p.amount)); setEditMethod(p.payment_method || "cash"); setEditNotes(p.notes || "");
                              }}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleting(p)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>✏️ পেমেন্ট সম্পাদনা</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">পরিমাণ *</label>
                <Input type="number" value={editAmt} onChange={e => setEditAmt(e.target.value)} /></div>
              <div><label className="block text-sm font-medium mb-1">পদ্ধতি</label>
                <Select value={editMethod} onValueChange={setEditMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 নগদ</SelectItem>
                    <SelectItem value="card">💳 কার্ড</SelectItem>
                    <SelectItem value="mobile">📱 মোবাইল</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><label className="block text-sm font-medium mb-1">নোট</label>
                <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(null)}>বাতিল</Button>
                <Button disabled={editMutation.isPending} onClick={() => {
                  const amt = parseFloat(editAmt);
                  if (!amt || amt <= 0) { toast.error("সঠিক পরিমাণ"); return; }
                  editMutation.mutate({ id: editing.id, amount: amt, method: editMethod, notes: editNotes, saleId: editing.sale_id });
                }}>সংরক্ষণ</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>পেমেন্ট মুছবেন?</AlertDialogTitle>
            <AlertDialogDescription>সংশ্লিষ্ট বিক্রয়ের বাকি স্বয়ংক্রিয়ভাবে পুনঃগণনা হবে।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMutation.mutate(deleting)} className="bg-destructive">মুছুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
