import jsPDF from "jspdf";
import "jspdf-autotable";

interface MonthlySummary {
  month: string;
  purchases: number;
  payments: number;
}

interface SupplierReportData {
  supplier: { name: string; phone?: string; email?: string; address?: string };
  purchases: any[];
  payments: any[];
  totalPurchase: number;
  totalPaid: number;
  totalDue: number;
  shopName: string;
  monthlySummary?: MonthlySummary[];
  supplierProducts?: any[];
}

export function generateSupplierReport(data: SupplierReportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.shopName, pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Supplier Report", pageWidth / 2, 28, { align: "center" });
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 34, { align: "center" });

  // Supplier Info
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Supplier Details", 14, 44);
  doc.setFont("helvetica", "normal");

  const supplierInfo = [
    `Name: ${data.supplier.name}`,
    data.supplier.phone ? `Phone: ${data.supplier.phone}` : "",
    data.supplier.email ? `Email: ${data.supplier.email}` : "",
    data.supplier.address ? `Address: ${data.supplier.address}` : "",
  ].filter(Boolean);

  let yPos = 50;
  supplierInfo.forEach(info => {
    doc.text(info, 14, yPos);
    yPos += 6;
  });

  // Summary Box
  yPos += 4;
  doc.setFillColor(41, 128, 185);
  doc.rect(14, yPos, pageWidth - 28, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Total Purchase: Tk ${data.totalPurchase.toLocaleString()}`, 20, yPos + 8);
  doc.text(`Total Paid: Tk ${data.totalPaid.toLocaleString()}`, 80, yPos + 8);
  doc.text(`Total Due: Tk ${data.totalDue.toLocaleString()}`, 140, yPos + 8);
  doc.setFontSize(8);
  doc.text(`Total Orders: ${data.purchases.length}`, 20, yPos + 16);
  doc.text(`Total Payments: ${data.payments.length}`, 80, yPos + 16);
  doc.text(`Balance: ${data.totalDue > 0 ? 'DUE' : 'CLEAR'}`, 140, yPos + 16);
  doc.setTextColor(0, 0, 0);
  yPos += 30;

  // Purchase Orders Table
  if (data.purchases.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Purchase Orders", 14, yPos);
    yPos += 4;

    const purchaseRows = data.purchases.map((p: any) => [
      p.purchase_number || "-",
      new Date(p.created_at).toLocaleDateString(),
      p.status === 'paid' ? 'Paid' : p.status === 'received' ? 'Received' : 'Pending',
      `Tk ${Number(p.total_amount).toLocaleString()}`,
      `Tk ${Number(p.paid_amount || 0).toLocaleString()}`,
      `Tk ${Number(p.due_amount || 0).toLocaleString()}`,
    ]);

    (doc as any).autoTable({
      startY: yPos,
      head: [["PO #", "Date", "Status", "Total", "Paid", "Due"]],
      body: purchaseRows,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Payments Table
  if (data.payments.length > 0) {
    if (yPos > 230) { doc.addPage(); yPos = 20; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Payment History", 14, yPos);
    yPos += 4;

    const paymentRows = data.payments.map((p: any) => [
      new Date(p.created_at).toLocaleDateString(),
      `Tk ${Number(p.amount).toLocaleString()}`,
      p.payment_method === "cash" ? "Cash" : p.payment_method === "bank" ? "Bank" : p.payment_method === "cheque" ? "Cheque" : "Mobile",
      p.notes || "-",
    ]);

    (doc as any).autoTable({
      startY: yPos,
      head: [["Date", "Amount", "Method", "Notes"]],
      body: paymentRows,
      theme: "grid",
      headStyles: { fillColor: [39, 174, 96], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Products Table
  if (data.supplierProducts && data.supplierProducts.length > 0) {
    if (yPos > 230) { doc.addPage(); yPos = 20; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Products from this Supplier", 14, yPos);
    yPos += 4;

    const productRows = data.supplierProducts.map((p: any) => [
      p.name || "-",
      p.imei || "-",
      p.condition === 'new' ? 'New' : p.condition === 'used' ? 'Used' : p.condition || "-",
      `Tk ${Number(p.cost || 0).toLocaleString()}`,
      String(p.stock_quantity ?? 0),
    ]);

    (doc as any).autoTable({
      startY: yPos,
      head: [["Product", "IMEI", "Condition", "Cost", "Stock"]],
      body: productRows,
      theme: "grid",
      headStyles: { fillColor: [142, 68, 173], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Monthly Summary Table
  if (data.monthlySummary && data.monthlySummary.length > 0) {
    if (yPos > 230) { doc.addPage(); yPos = 20; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Monthly Transaction Summary", 14, yPos);
    yPos += 4;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyRows = data.monthlySummary.map((m) => {
      const [y, mo] = m.month.split("-");
      const balance = m.purchases - m.payments;
      return [
        `${monthNames[Number(mo) - 1]} ${y}`,
        `Tk ${m.purchases.toLocaleString()}`,
        `Tk ${m.payments.toLocaleString()}`,
        `Tk ${Math.abs(balance).toLocaleString()} ${balance > 0 ? '(Due)' : balance < 0 ? '(Advance)' : ''}`,
      ];
    });

    (doc as any).autoTable({
      startY: yPos,
      head: [["Month", "Purchases", "Payments", "Balance"]],
      body: monthlyRows,
      theme: "grid",
      headStyles: { fillColor: [230, 126, 34], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${data.shopName} | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  doc.save(`supplier-report-${data.supplier.name.replace(/\s+/g, '-')}.pdf`);
}
