import jsPDF from "jspdf";
import "jspdf-autotable";

interface SupplierReportData {
  supplier: { name: string; phone?: string; email?: string; address?: string };
  purchases: any[];
  payments: any[];
  totalPurchase: number;
  totalPaid: number;
  totalDue: number;
  shopName: string;
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

  // Supplier Info
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Supplier Details", 14, 40);
  doc.setFont("helvetica", "normal");

  const supplierInfo = [
    `Name: ${data.supplier.name}`,
    data.supplier.phone ? `Phone: ${data.supplier.phone}` : "",
    data.supplier.email ? `Email: ${data.supplier.email}` : "",
    data.supplier.address ? `Address: ${data.supplier.address}` : "",
  ].filter(Boolean);

  let yPos = 46;
  supplierInfo.forEach(info => {
    doc.text(info, 14, yPos);
    yPos += 6;
  });

  // Summary Box
  yPos += 4;
  doc.setFillColor(240, 240, 240);
  doc.rect(14, yPos, pageWidth - 28, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Total Purchase: Tk ${data.totalPurchase.toLocaleString()}`, 20, yPos + 8);
  doc.text(`Total Paid: Tk ${data.totalPaid.toLocaleString()}`, 80, yPos + 8);
  doc.text(`Total Due: Tk ${data.totalDue.toLocaleString()}`, 140, yPos + 8);
  yPos += 28;

  // Purchase Orders Table
  if (data.purchases.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Purchase Orders", 14, yPos);
    yPos += 4;

    const purchaseRows = data.purchases.map((p: any) => [
      p.purchase_number || "-",
      new Date(p.created_at).toLocaleDateString(),
      p.status || "-",
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
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Payment History", 14, yPos);
    yPos += 4;

    const paymentRows = data.payments.map((p: any) => [
      new Date(p.created_at).toLocaleDateString(),
      `Tk ${Number(p.amount).toLocaleString()}`,
      p.payment_method === "cash" ? "Cash" : p.payment_method === "bank" ? "Bank" : "Mobile",
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
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated: ${new Date().toLocaleString()} | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  doc.save(`supplier-report-${data.supplier.name.replace(/\s+/g, '-')}.pdf`);
}
