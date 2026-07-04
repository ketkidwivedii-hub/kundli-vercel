import React, { useState, useRef, useCallback } from "react";
import { C, FONT_IMPORT } from "../lib/designTokens";
import ReportDashboard from "./ReportDashboard";

const FIELDS_CONFIG = [
  { key: "fullName", label: "Full Name", group: "Identity" },
  { key: "gender", label: "Gender", group: "Identity" },
  { key: "dob", label: "Date of Birth", group: "Birth Details", hint: "normalized YYYY-MM-DD" },
  { key: "tob", label: "Time of Birth", group: "Birth Details", hint: "normalized 24h HH:MM" },
  { key: "birthLocation", label: "Birth Location", group: "Birth Details" },
  { key: "currentAddress", label: "Current Address", group: "Location" },
  { key: "permanentAddress", label: "Permanent Address", group: "Location" },
  { key: "education", label: "Education", group: "Background" },
  { key: "profession", label: "Profession", group: "Background" },
  { key: "company", label: "Company", group: "Background" },
  { key: "income", label: "Income", group: "Background" },
  { key: "familyDetails", label: "Family Details", group: "Background" },
];

const GROUPS = [...new Set(FIELDS_CONFIG.map((f) => f.group))];

const EMPTY_FIELDS = Object.fromEntries(
  FIELDS_CONFIG.map((f) => [f.key, { value: "", confidence: 0, sourceText: null, source: "empty", confirmed: false }])
);

const SAMPLE_TEXT = `BIODATA

Name: Priya Sharma
Sex: Female
DOB: 15/03/1998
Birth Details: Born at 04:30 AM in Pune, Maharashtra

Currently residing at: Flat 402, Lakeview Apartments, Baner, Pune - 411045
Permanent Address: House No. 12, Civil Lines, Kanpur, U.P.

Education: B.Tech (Computer Science), VIT Pune
Working as Software Engineer at Infosys, Pune
Annual Income: 12 LPA

Family: Father - Businessman, Mother - Homemaker. One younger brother, studying.`;

export default function BiodataExtractionUI() {
  const [stage, setStage] = useState("input"); // input | extracting | review | confirmed
  const [rawText, setRawText] = useState("");
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [error, setError] = useState(null);
  const [popover, setPopover] = useState(null); // {x,y,text}
  const docRef = useRef(null);

  /* ---------------- Extraction ---------------- */
  const runExtraction = useCallback(async (text) => {
    setStage("extracting");
    setError(null);
    try {
      const schemaKeys = FIELDS_CONFIG.map((f) => f.key).join(", ");
      const prompt = `Extract structured fields from this marriage biodata document.

Respond with ONLY valid JSON — no markdown fences, no preamble, no explanation.

Schema: an object with these keys: ${schemaKeys}
Each key maps to: {"value": string|null, "confidence": number (0 to 1), "sourceText": string|null}

Rules:
- "value" should be the normalized/cleaned field value.
- "dob" value MUST be normalized to YYYY-MM-DD if a date is found.
- "tob" value MUST be normalized to 24-hour HH:MM if a time is found.
- "sourceText" MUST be an exact, verbatim substring copied from the input document that supports this field (used for highlighting). If you cannot find an exact substring, set it to null.
- If a field is not present in the document, set "value" to null, "confidence" to 0, "sourceText" to null.
- "confidence" reflects how certain you are the value is correct, from 0 to 1.

Document:
"""
${text}
"""`;

      // Calls our own Next.js API route (pages/api/extract.js), which holds
      // the Gemini API key server-side and returns a response already
      // shaped as { content: [{ type: "text", text }] } for this code
      // below to parse, regardless of which provider is behind the route.
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Extraction request failed (status ${response.status})`);
      }

      const textBlocks = (data.content || []).filter((b) => b.type === "text").map((b) => b.text);
      const raw = textBlocks.join("\n").trim();
      if (!raw) throw new Error("The model returned no text content.");
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error("The model's response wasn't valid JSON. You can still fill fields in manually below.");
      }

      const nextFields = {};
      FIELDS_CONFIG.forEach(({ key }) => {
        const entry = parsed[key] || {};
        const hasValue = entry.value !== null && entry.value !== undefined && entry.value !== "";
        nextFields[key] = {
          value: hasValue ? String(entry.value) : "",
          confidence: typeof entry.confidence === "number" ? entry.confidence : 0,
          sourceText: entry.sourceText || null,
          source: hasValue ? "ai" : "empty",
          confirmed: false,
        };
      });
      setFields(nextFields);
      setStage("review");
    } catch (e) {
      console.error(e);
      setError(`Extraction failed: ${e.message || e}`);
      setFields(EMPTY_FIELDS);
      setStage("review");
    }
  }, []);

  /* ---------------- PDF upload ---------------- */
  const handlePdfUpload = async (file) => {
    if (!file) return;
    setError(null);
    setStage("extracting");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read this PDF");

      setRawText(data.text);
      await runExtraction(data.text);
    } catch (e) {
      setError(`PDF upload failed: ${e.message || e}`);
      setStage("input");
    }
  };

  /* ---------------- Field editing ---------------- */
  const updateField = (key, patch) => {
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const assignSelectionToField = (key, text) => {
    updateField(key, { value: text.trim(), source: "manual", sourceText: text.trim(), confirmed: false });
    setPopover(null);
    window.getSelection()?.removeAllRanges();
  };

  /* ---------------- Text selection handling ---------------- */
  const handleDocMouseUp = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text || !docRef.current) {
      setPopover(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = docRef.current.getBoundingClientRect();
    setPopover({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top,
      text,
    });
  };

  /* ---------------- Build highlighted document segments ---------------- */
  const buildSegments = () => {
    const marks = [];
    FIELDS_CONFIG.forEach(({ key, label }) => {
      const f = fields[key];
      if (f.sourceText && f.source === "ai") {
        const idx = rawText.indexOf(f.sourceText);
        if (idx !== -1) marks.push({ start: idx, end: idx + f.sourceText.length, label, key });
      }
    });
    marks.sort((a, b) => a.start - b.start);
    // drop overlaps (keep first)
    const clean = [];
    let cursor = 0;
    marks.forEach((m) => {
      if (m.start >= cursor) {
        clean.push(m);
        cursor = m.end;
      }
    });

    const segments = [];
    let pos = 0;
    clean.forEach((m) => {
      if (m.start > pos) segments.push({ type: "text", text: rawText.slice(pos, m.start) });
      segments.push({ type: "mark", text: rawText.slice(m.start, m.end), label: m.label, key: m.key });
      pos = m.end;
    });
    if (pos < rawText.length) segments.push({ type: "text", text: rawText.slice(pos) });
    return segments;
  };

  const confirmedCount = FIELDS_CONFIG.filter((f) => fields[f.key].confirmed).length;
  const filledCount = FIELDS_CONFIG.filter((f) => fields[f.key].value).length;
  const allConfirmed = confirmedCount === FIELDS_CONFIG.length;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: C.paper, minHeight: "100%", color: C.ink }}>
      <style>{FONT_IMPORT}</style>

      {/* ---------------- Header ---------------- */}
      {stage !== "confirmed" && (
        <div style={{ borderBottom: `1px solid ${C.line}`, padding: "28px 32px 22px" }}>
          <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brass, fontWeight: 600, marginBottom: 6 }}>
            Intake Desk · Biodata Verification
          </div>
          <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 30, fontWeight: 700, color: C.navy, margin: 0 }}>
            Field Confirmation Ledger
          </h1>
          <p style={{ color: C.inkSoft, fontSize: 14, marginTop: 6, maxWidth: 640, lineHeight: 1.5 }}>
            Nothing here is processed for eligibility or kundli matching until every field below is confirmed.
            Select text in the original document at any time to assign or correct a field.
          </p>
        </div>
      )}

      {/* ---------------- Stage: input ---------------- */}
      {stage === "input" && (
        <div style={{ padding: 32, maxWidth: 780 }}>
          <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: "0.06em", color: C.navySoft, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
            Paste biodata text
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the prospect's biodata here..."
            rows={12}
            style={{
              width: "100%",
              background: C.paperPanel,
              border: `1px solid ${C.line}`,
              borderRadius: 4,
              padding: 16,
              fontSize: 14,
              lineHeight: 1.6,
              color: C.ink,
              fontFamily: "'IBM Plex Mono', monospace",
              resize: "vertical",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center" }}>
            <button
              onClick={() => runExtraction(rawText)}
              disabled={!rawText.trim()}
              style={{
                background: rawText.trim() ? C.navy : C.paperDark,
                color: rawText.trim() ? C.paperPanel : C.inkSoft,
                border: "none",
                borderRadius: 4,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: 600,
                cursor: rawText.trim() ? "pointer" : "not-allowed",
                fontFamily: "Inter, sans-serif",
              }}
            >
              Extract fields
            </button>
            <button
              onClick={() => setRawText(SAMPLE_TEXT)}
              style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 16px", fontSize: 13, color: C.inkSoft, cursor: "pointer" }}
            >
              Load sample biodata
            </button>
            <span style={{ color: C.inkSoft, fontSize: 13 }}>or</span>
            <label
              style={{
                background: "transparent",
                border: `1px solid ${C.navySoft}`,
                borderRadius: 4,
                padding: "10px 16px",
                fontSize: 13,
                color: C.navySoft,
                cursor: "pointer",
              }}
            >
              Upload biodata PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => handlePdfUpload(e.target.files?.[0])}
                style={{ display: "none" }}
              />
            </label>
          </div>
          {error && (
            <div style={{ marginTop: 14, background: C.stampBg, border: `1px solid ${C.stamp}`, borderRadius: 4, padding: 10, fontSize: 12.5, color: C.stamp }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Stage: extracting ---------------- */}
      {stage === "extracting" && (
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: C.navySoft, letterSpacing: "0.05em" }}>
            Reading the document…
          </div>
        </div>
      )}

      {/* ---------------- Stage: review / confirmed ---------------- */}
      {stage === "review" && (
        <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
          {/* LEFT: original document */}
          <div style={{ flex: "1 1 46%", padding: 24, borderRight: `1px solid ${C.line}`, position: "sticky", top: 0 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.navySoft, marginBottom: 10 }}>
              Original Document
            </div>
            <div
              ref={docRef}
              onMouseUp={handleDocMouseUp}
              style={{
                position: "relative",
                background: C.paperPanel,
                border: `1px solid ${C.line}`,
                borderRadius: 4,
                padding: 18,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13,
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
                color: C.ink,
                userSelect: "text",
                boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
              }}
            >
              {buildSegments().map((seg, i) =>
                seg.type === "text" ? (
                  <span key={i}>{seg.text}</span>
                ) : (
                  <span
                    key={i}
                    title={`AI matched → ${seg.label}`}
                    style={{
                      background: C.aiHighlight,
                      borderBottom: `2px solid ${C.aiHighlightBorder}`,
                      borderRadius: 2,
                      padding: "1px 2px",
                    }}
                  >
                    {seg.text}
                  </span>
                )
              )}

              {popover && (
                <div
                  style={{
                    position: "absolute",
                    left: popover.x,
                    top: popover.y - 10,
                    transform: "translate(-50%, -100%)",
                    background: C.navy,
                    borderRadius: 6,
                    padding: 8,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                    zIndex: 20,
                    minWidth: 200,
                  }}
                >
                  <div style={{ color: "#D9E1EA", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
                    Assign to field
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 260 }}>
                    {FIELDS_CONFIG.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => assignSelectionToField(f.key, popover.text)}
                        style={{
                          background: C.navySoft,
                          color: "#fff",
                          border: "none",
                          borderRadius: 3,
                          padding: "4px 8px",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPopover(null)}
                    style={{ marginTop: 6, background: "none", border: "none", color: "#B7C2CF", fontSize: 11, cursor: "pointer", padding: 0 }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: C.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 10, height: 10, background: C.aiHighlight, border: `1px solid ${C.aiHighlightBorder}`, borderRadius: 2 }} />
              text the AI matched to a field · select any text to (re)assign it
            </div>
            {error && (
              <div style={{ marginTop: 12, background: C.stampBg, border: `1px solid ${C.stamp}`, borderRadius: 4, padding: 10, fontSize: 12.5, color: C.stamp }}>
                {error}
              </div>
            )}
          </div>

          {/* RIGHT: field ledger */}
          <div style={{ flex: "1 1 54%", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.navySoft }}>
                Extracted Fields
              </div>
              <div style={{ fontSize: 12, color: C.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                {confirmedCount}/{FIELDS_CONFIG.length} confirmed
              </div>
            </div>

            {/* progress bar */}
            <div style={{ height: 4, background: C.paperDark, borderRadius: 2, marginBottom: 22, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(confirmedCount / FIELDS_CONFIG.length) * 100}%`, background: C.brass, transition: "width 0.25s ease" }} />
            </div>

            {GROUPS.map((group) => (
              <div key={group} style={{ marginBottom: 22 }}>
                <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 15, fontWeight: 600, color: C.navy, marginBottom: 10, borderBottom: `1px solid ${C.line}`, paddingBottom: 4 }}>
                  {group}
                </div>
                {FIELDS_CONFIG.filter((f) => f.group === group).map((f) => {
                  const state = fields[f.key];
                  const isEmpty = !state.value;
                  const stampColor = state.confirmed ? C.brass : isEmpty ? C.stamp : C.inkSoft;
                  const stampBg = state.confirmed ? C.brassBg : isEmpty ? C.stampBg : C.paperDark;

                  return (
                    <div key={f.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                      <button
                        onClick={() => updateField(f.key, { confirmed: !state.confirmed })}
                        title={state.confirmed ? "Confirmed" : isEmpty ? "Missing — needs input" : "Click to confirm"}
                        style={{
                          flexShrink: 0,
                          marginTop: 2,
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          border: `1.5px solid ${stampColor}`,
                          background: stampBg,
                          color: stampColor,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {state.confirmed ? "✓" : isEmpty ? "!" : ""}
                      </button>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <label style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{f.label}</label>
                          <span style={{ fontSize: 10, color: C.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>
                            {state.source === "ai" && `AI · ${Math.round(state.confidence * 100)}%`}
                            {state.source === "manual" && "assigned by you"}
                            {state.source === "empty" && f.hint}
                          </span>
                        </div>
                        <input
                          value={state.value}
                          onChange={(e) => updateField(f.key, { value: e.target.value, source: "manual", confirmed: false })}
                          placeholder={isEmpty ? "Not found — type or select from document" : ""}
                          style={{
                            width: "100%",
                            marginTop: 4,
                            background: C.paperPanel,
                            border: `1px solid ${isEmpty ? C.stamp : C.line}`,
                            borderRadius: 4,
                            padding: "7px 10px",
                            fontSize: 13.5,
                            color: C.ink,
                            outline: "none",
                            fontFamily: "Inter, sans-serif",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Footer actions */}
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18, marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setStage("confirmed")}
                disabled={!allConfirmed}
                style={{
                  background: allConfirmed ? C.brass : C.paperDark,
                  color: allConfirmed ? "#fff" : C.inkSoft,
                  border: "none",
                  borderRadius: 4,
                  padding: "11px 22px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: allConfirmed ? "pointer" : "not-allowed",
                }}
              >
                {allConfirmed ? "Confirm all & continue" : `Confirm remaining ${FIELDS_CONFIG.length - confirmedCount} field(s)`}
              </button>
              <button
                onClick={() => {
                  setStage("input");
                  setFields(EMPTY_FIELDS);
                  setRawText("");
                }}
                style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 4, padding: "10px 16px", fontSize: 13, color: C.inkSoft, cursor: "pointer" }}
              >
                Start over
              </button>
              <span style={{ fontSize: 12, color: C.inkSoft }}>{filledCount}/{FIELDS_CONFIG.length} fields have a value</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Stage: confirmed — full report screen ---------------- */}
      {stage === "confirmed" && (
        <ReportDashboard
          fields={Object.fromEntries(FIELDS_CONFIG.map((f) => [f.key, fields[f.key].value || null]))}
          onReset={() => {
            setStage("input");
            setFields(EMPTY_FIELDS);
            setRawText("");
          }}
        />
      )}
    </div>
  );
}
