// pages/api/extract.js
// Server-side proxy to the Google Gemini API. Keeps your API key out of the
// browser. Set GEMINI_API_KEY in Vercel -> Project Settings -> Environment
// Variables (and in a local .env.local file for local dev -- never commit
// that file).
//
// The frontend expects a response shaped like { content: [{ type: "text",
// text: "..." }] } -- that shape is preserved here even though the
// underlying provider changed, so components/BiodataExtractionUI.jsx did
// not need to change at all.

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not set on the server. Add it in Vercel -> Project Settings -> Environment Variables, then redeploy.",
    });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "Missing 'prompt' in request body" });
  }

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || `Gemini API returned status ${response.status}`;
      return res.status(response.status).json({ error: message, raw: data });
    }

    // Gemini's response shape: { candidates: [ { content: { parts: [ { text } ] } } ] }
    let text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";

    if (!text) {
      return res.status(502).json({ error: "Gemini returned no text content.", raw: data });
    }

    // Gemini sometimes wraps JSON in a markdown fence -- strip it here so
    // the frontend always receives clean text either way.
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    // Re-wrap in the same shape the frontend already knows how to parse.
    return res.status(200).json({ content: [{ type: "text", text }] });
  } catch (err) {
    return res.status(500).json({ error: `Request to Gemini API failed: ${String(err)}` });
  }
}
