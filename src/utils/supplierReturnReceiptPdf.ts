import jsPDF from "jspdf";
import "jspdf-autotable";

const money = (value: number) => `Tk ${Number(value || 0).toLocaleString("en-BD")}`;
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString("en-BD") : "-";
const label = (value?: string | null) => String(value || "-").replace(/_/g, " ");

export function generateSupplierReturnReceiptPdf(ret: any, format: "a4" | "letter" = "a4") {
  const doc = new jsPDF({ unit: "mm", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = 16;
  const ensureSpace = (needed = 28) => {
    if (y > pageHeight - needed) {
      doc.addPage();
      y = 16;
    }
  };

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
    ["Return Method", label(ret.return_method), "Stock Action", label(ret.stock_action)],
    ["Finance Action", label(ret.finance_action), "Refund/Adjust", money(Number(ret.refund_amount || 0))],
    ["Reason", label(ret.reason_code), "Notes", ret.reason_notes || "-"],
  ];

  (doc as any).autoTable({
    startY: y,
    body: infoRows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak", valign: "top" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 26 }, 1: { cellWidth: 58 }, 2: { fontStyle: "bold", cellWidth: 26 }, 3: { cellWidth: pageWidth - 2 * margin - 110 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 8;
  ensureSpace(36);

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
  if (itemRows.length === 0) itemRows.push(["-", "No return items", "-", "-", "-", "0", money(0), money(0)]);

  (doc as any).autoTable({
    startY: y,
    head: [["#", "Item", "IMEI", "Brand", "Model", "Qty", "Unit", "Total"]],
    body: itemRows,
    theme: "grid",
    headStyles: { fillColor: [197, 143, 13], textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    styles: { cellPadding: 1.6, overflow: "linebreak", valign: "top" },
    margin: { left: margin, right: margin },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 34 }, 2: { cellWidth: 27 }, 3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 12 }, 6: { cellWidth: 22 }, 7: { cellWidth: 24 } },
    horizontalPageBreak: true,
  });
  y = (doc as any).lastAutoTable.finalY + 8;
  ensureSpace(34);

  const timelineRows = [
    ["Created", ret.processed_by_profile?.full_name || ret.processed_by_profile?.email || "System", fmt(ret.created_at)],
    ret.stock_applied ? ["Stock Applied", ret.stock_applied_by || ret.approved_by_profile?.email || "System", fmt(ret.stock_applied_at)] : ["Stock", ret.stock_action === "deduct_stock" ? "Pending" : "No stock change", "-"],
    ret.finance_applied ? ["Finance Applied", ret.finance_applied_by || ret.approved_by_profile?.email || "System", fmt(ret.finance_applied_at)] : ["Finance", ret.finance_action === "none" ? "No finance change" : "Pending", "-"],
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
    styles: { cellPadding: 2, overflow: "linebreak", valign: "top" },
    columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: pageWidth - 2 * margin - 86 }, 2: { cellWidth: 50 } },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (ret.defect_photo_url) {
    ensureSpace(38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Defect Photo Link", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 80, 180);
    const lines = doc.splitTextToSize(ret.defect_photo_url, pageWidth - 2 * margin);
    lines.forEach((line: string, index: number) => {
      if (y + index * 5 > pageHeight - 16) {
        doc.addPage();
        y = 16 - index * 5;
      }
      doc.textWithLink(line, margin, y + index * 5, { url: ret.defect_photo_url });
    });
    doc.setTextColor(0, 0, 0);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Supplier Return Receipt | ${format.toUpperCase()} | Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
  }

  doc.save(`supplier-return-${ret.return_number || ret.id}.pdf`);
}