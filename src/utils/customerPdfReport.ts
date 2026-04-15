import jsPDF from "jspdf";
import "jspdf-autotable";

interface CustomerReportData {
  customer: { name: string; phone?: string; email?: string; address?: string };
  sales: any[];
  payments: any[];
  totalSales: number;
  totalPaid: number;
  totalDue: number;
  shopName: string;
}

export function generateCustomerReport(data: CustomerReportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.shopName, pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Customer Report", pageWidth / 2, 28, { align: "center" });

  // Customer Info
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Details", 14, 40);
  doc.setFont("helvetica", "normal");

  const customerInfo = [
    `Name: ${data.customer.name}`,
    data.customer.phone ? `Phone: ${data.customer.phone}` : "",
    data.customer.email ? `Email: ${data.customer.email}` : "",
    data.customer.address ? `Address: ${data.customer.address}` : "",
  ].filter(Boolean);

  let yPos = 46;
  customerInfo.forEach(info => {
    doc.text(info, 14, yPos);
    yPos += 6;
  });

  // Summary Box
  yPos += 4;
  doc.setFillColor(240, 240, 240);
  doc.rect(14, yPos, pageWidth - 28, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Total Sales: Tk ${data.totalSales.toLocaleString()}`, 20, yPos + 8);
  doc.text(`Total Paid: Tk ${data.totalPaid.toLocaleString()}`, 80, yPos + 8);
  doc.text(`Total Due: Tk ${data.totalDue.toLocaleString()}`, 140, yPos + 8);
  yPos += 28;

  // Sales Table
  if (data.sales.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Sales History", 14, yPos);
    yPos += 4;

    const salesRows = data.sales.map((s: any) => [
      s.id?.slice(0, 8) || "-",
      new Date(s.created_at).toLocaleDateString(),
      (s.sale_items as any[])?.map((i: any) => i.products?.name).filter(Boolean).join(", ") || "-",
      `Tk ${Number(s.total_amount).toLocaleString()}`,
      `Tk ${Number(s.paid_amount).toLocaleString()}`,
      `Tk ${Number(s.due_amount).toLocaleString()}`,
    ]);

    (doc as any).autoTable({
      startY: yPos,
      head: [["Invoice #", "Date", "Products", "Total", "Paid", "Due"]],
      body: salesRows,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
      columnStyles: { 2: { cellWidth: 40 } },
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
      p.payment_method === "cash" ? "Cash" : p.payment_method === "card" ? "Card" : "Mobile",
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

  doc.save(`customer-report-${data.customer.name.replace(/\s+/g, '-')}.pdf`);
}
