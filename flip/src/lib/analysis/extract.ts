export interface ExtractResult {
  text: string;
  label: string;
}

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;

/**
 * Turns an uploaded file into plain text (DeepSeek is text-only).
 * - PDF → extracted text
 * - Word/Excel/CSV → extracted text
 * - Images/photos → OCR (Italian + English)
 */
export async function extractContent(file: File): Promise<ExtractResult> {
  const type = file.type || "";
  const name = file.name;
  const buf = Buffer.from(await file.arrayBuffer());

  // PDF
  if (type === "application/pdf" || /\.pdf$/i.test(name)) {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      await parser.destroy();
      const text = (result.text || "").trim();
      return {
        label: name,
        text: text || "(Questo PDF non contiene testo leggibile: potrebbe essere una scansione. Prova a fotografarlo.)",
      };
    } catch {
      return { label: name, text: "(Impossibile leggere il PDF.)" };
    }
  }

  // Word
  if (/\.docx?$/i.test(name) || type.includes("word") || type.includes("officedocument.wordprocessing")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { label: name, text: value.trim() || "(documento vuoto)" };
  }

  // Excel / CSV
  if (/\.(xlsx?|csv)$/i.test(name) || type.includes("sheet") || type.includes("excel") || type === "text/csv") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const parts = wb.SheetNames.map((n) => `# Foglio: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`);
    return { label: name, text: parts.join("\n\n").slice(0, 50_000) };
  }

  // Image → OCR
  if (IMAGE_RE.test(name) || type.startsWith("image/")) {
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(buf, "ita+eng");
      const text = (data.text || "").trim();
      return {
        label: name,
        text: text || "(Non ho riconosciuto testo nella foto: riprova con più luce, a fuoco e ben inquadrata.)",
      };
    } catch {
      return { label: name, text: "(Impossibile leggere il testo dalla foto.)" };
    }
  }

  // Plain text fallback
  return { label: name, text: buf.toString("utf-8").slice(0, 50_000) };
}
