import jsPDF from "jspdf";
import "jspdf-autotable";

const money = (value: number) => `Tk ${Number(value || 0).toLocaleString("en-BD")}`;
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString("en-BD") : "-";

export function generateSupplierReturnReceiptPdf(ret: any) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("BIG BOSS MOBILE SHOP", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(12);
  doc.text("Supplier Return Receipt", pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Return No: ${ret.return_number || ret.id}`, 14, y);
  doc.text(`Date: ${fmt(ret.created_at)}`, pageWidth - 14, y, { align: "right" });
  y += 7;

  const infoRows = [
    ["Supplier", ret.suppliers?.name || "Unknown", "Phone", ret.suppliers?.phone || "-"],
    ["Purchase Order", ret.purchases?.purchase_number || "N/A", "Status", ret.status || "-"],
    ["Return Method", ret.return_method || "-", "Stock Action", ret.stock_action || "-"],
    ["Finance Action", ret.finance_action || "-", "Refund/Adjust", money(Number(ret.refund_amount || 0))],
    ["Reason", ret.reason_code || "-", "Notes", ret.reason_notes || "-"],
  ];

  (doc as any).autoTable({
    startY: y,
    body: infoRows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 28 }, 2: { fontStyle: "bold", cellWidth: 28 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const itemRows = (ret.supplier_return_items || []).map((it: any, index: number) => [
    String(index + 1),
    it.products?.name || "Product",
    it.products?.imei || "-",
    it.products?.brand || "-",
    it.products?.model || "-",
    String(it.quantity || 0),
    money(Number(it.unit_cost || 0)),
    money(Number(it.total_cost || 0)),
  ]);

  (doc as any).autoTable({
    startY: y,
    head: [["#", "Item", "IMEI", "Brand", "Model", "Qty", "Unit", "Total"]],
    body: itemRows,
    theme: "grid",
    headStyles: { fillColor: [197, 143, 13], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { cellWidth: 38 }, 2: { cellWidth: 28 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const timelineRows = [
    ["Created", ret.processed_by_profile?.full_name || ret.processed_by_profile?.email || "System", fmt(ret.created_at)],
    ret.status === "pending"
      ? ["Pending", "Awaiting approval", "-"]
      : [ret.status === "rejected" ? "Rejected" : "Approved", ret.approved_by_profile?.full_name || ret.approved_by_profile?.email || "System", fmt(ret.approved_at)],
  ];
  if (ret.rejected_reason) timelineRows.push(["Reject Reason", ret.rejected_reason, ""]);

  (doc as any).autoTable({
    startY: y,
    head: [["Timeline", "By", "Timestamp"]],
    body: timelineRows,
    theme: "grid",
    headStyles: { fillColor: [20, 36, 69], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (ret.defect_photo_url) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Defect Photo Link", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 80, 180);
    const lines = doc.splitTextToSize(ret.defect_photo_url, pageWidth - 28);
    doc.textWithLink(lines[0], 14, y, { url: ret.defect_photo_url });
    if (lines.length > 1) doc.text(lines.slice(1), 14, y + 5);
    doc.setTextColor(0, 0, 0);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Supplier Return Receipt | Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
  }

  doc.save(`supplier-return-${ret.return_number || ret.id}.pdf`);
}