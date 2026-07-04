// pages/api/parse-pdf.js
// Accepts a base64-encoded PDF, returns extracted text. Client reads the
// file with FileReader, sends base64 here, gets plain text back, and that
// text flows into the exact same extraction pipeline as pasted text.
//
// Uses `unpdf` -- a PDF.js wrapper built specifically for serverless/edge
// runtimes (Vercel, Cloudflare Workers). Regular pdfjs-dist (even its
// "legacy" build) references browser globals like DOMMatrix that don't
// exist in Vercel's Node serverless runtime; unpdf avoids that.

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { base64 } = req.body || {};
  if (!base64) {
    return res.status(400).json({ error: "Missing 'base64' PDF data in request body" });
  }

  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buffer = Buffer.from(base64, "base64");

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = (text || "").trim();

    if (!cleaned) {
      return res.status(422).json({
        error: "No selectable text found in this PDF. It may be a scanned image — image OCR support is planned but not built yet. Try pasting the text manually for now.",
      });
    }

    return res.status(200).json({ text: cleaned });
  } catch (err) {
    return res.status(500).json({ error: `Could not read PDF: ${String(err)}` });
  }
}
