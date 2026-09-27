import PDFDocument from "pdfkit";

// ------------------------------------------------------------
// Génération de PDF tabulaires pour les exports (Phase 4, voir
// AUDIT.md 7.16). Table dessinée "à la main" (colonnes à largeur fixe)
// plutôt qu'avec une méthode de mise en page automatique de pdfkit :
// reste compatible quelle que soit la version de pdfkit installée,
// et suffisant pour des rapports simples.
// ------------------------------------------------------------

export type PdfColumn = { key: string; label: string; width: number };

export async function renderTablePdf({
  title,
  subtitle,
  columns,
  rows,
}: {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: Record<string, string>[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).fillColor("#1C2438").text(title);
    if (subtitle) {
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor("#5B6478").text(subtitle);
    }
    doc.moveDown(1);
    doc.fillColor("#000000");

    const startX = doc.page.margins.left;
    const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
    const rowHeight = 20;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    let y = doc.y;

    function drawHeaderRow() {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#1C2438");
      let x = startX;
      for (const col of columns) {
        doc.text(col.label, x, y, { width: col.width, ellipsis: true });
        x += col.width;
      }
      y += rowHeight;
      doc
        .moveTo(startX, y - 4)
        .lineTo(startX + tableWidth, y - 4)
        .strokeColor("#E2E4E9")
        .stroke();
      doc.font("Helvetica").fontSize(9).fillColor("#1C2438");
    }

    drawHeaderRow();

    if (rows.length === 0) {
      doc.fillColor("#9AA1B2").text("Aucune donnée.", startX, y);
    }

    for (const row of rows) {
      if (y + rowHeight > pageBottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeaderRow();
      }
      let x = startX;
      for (const col of columns) {
        doc.text(row[col.key] ?? "", x, y, { width: col.width, ellipsis: true });
        x += col.width;
      }
      y += rowHeight;
    }

    doc.end();
  });
}
