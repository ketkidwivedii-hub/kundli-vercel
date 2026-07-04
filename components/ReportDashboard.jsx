import React, { useEffect, useState } from "react";
import { C, FONT_IMPORT } from "../lib/designTokens";
import { KOOTA_LABELS } from "../lib/kootaLabels";

function calcAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function scoreLabel(score) {
  if (score > 24) return "Excellent Match";
  if (score >= 18) return "Good Match";
  return "Below Recommended Threshold";
}

const DECISION_DISPLAY = {
  STRONG_MATCH: { icon: "⭐", title: "Strong Match", color: C.green, bg: C.greenBg, text: "This profile meets your selected requirements." },
  AVERAGE_MATCH: { icon: "⚠️", title: "Average Match", color: C.amber, bg: C.amberBg, text: "Basic criteria passed, but review manually." },
  NOT_RECOMMENDED: { icon: "❌", title: "Not Recommended", color: C.red, bg: C.redBg, text: "Important criteria did not match." },
};

export default function ReportDashboard({ fields, onReset }) {
  const [status, setStatus] = useState("loading"); // loading | error | done
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setStatus("loading");
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not generate the report.");
        if (!cancelled) {
          setResult(data);
          setStatus("done");
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e.message || e));
          setStatus("error");
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [fields]);

  const buildSummary = () => {
    if (!result) return "";
    const lines = [
      `Marriage Compatibility Report`,
      `Candidate: ${fields.fullName || "—"}`,
      `Location: ${fields.birthLocation || fields.currentAddress || "—"}`,
      ``,
      `Location Check: ${result.location.passed === false ? "FAILED — " + result.location.reason : result.location.passed === true ? "PASSED" : "Not checked — " + result.location.reason}`,
      result.kundli.available
        ? `Kundli Score: ${result.kundli.total_score}/${result.kundli.max_score} (${scoreLabel(result.kundli.total_score)})`
        : `Kundli Score: not available — ${result.kundli.reason}`,
      ``,
      `Overall: ${DECISION_DISPLAY[result.decision]?.title} — ${result.decisionText}`,
    ];
    return lines.join("\n");
  };

  const copySummary = () => {
    navigator.clipboard?.writeText(buildSummary()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: C.paper, minHeight: "100%", color: C.ink }}>
      <style>{FONT_IMPORT}</style>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        @media (max-width: 640px) {
          .report-container { padding: 16px !important; }
        }
      `}</style>

      <div className="report-container" style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brass, fontWeight: 600, marginBottom: 6, textAlign: "center" }}>
          Compatibility Report
        </div>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 30, fontWeight: 700, color: C.navy, margin: "0 0 24px", textAlign: "center" }}>
          Marriage Compatibility Report
        </h1>

        {/* ---- Candidate card ---- */}
        <div style={{ background: C.paperPanel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 12 }}>
            {fields.fullName || "Candidate"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 15 }}>
            {calcAge(fields.dob) !== null && (
              <div><span style={{ color: C.inkSoft }}>Age: </span><strong>{calcAge(fields.dob)}</strong></div>
            )}
            {fields.profession && (
              <div><span style={{ color: C.inkSoft }}>Profession: </span><strong>{fields.profession}</strong></div>
            )}
            {(fields.birthLocation || fields.currentAddress) && (
              <div style={{ gridColumn: "1 / -1" }}><span style={{ color: C.inkSoft }}>Location: </span><strong>{fields.birthLocation || fields.currentAddress}</strong></div>
            )}
            {fields.education && (
              <div style={{ gridColumn: "1 / -1" }}><span style={{ color: C.inkSoft }}>Education: </span><strong>{fields.education}</strong></div>
            )}
          </div>
        </div>

        {status === "loading" && (
          <div style={{ textAlign: "center", padding: 60, fontFamily: "'IBM Plex Mono', monospace", color: C.navySoft, fontSize: 14 }}>
            Checking location and calculating kundli compatibility…
          </div>
        )}

        {status === "error" && (
          <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 10, padding: 20, color: C.red, fontSize: 15 }}>
            Something went wrong generating this report: {error}
          </div>
        )}

        {status === "done" && result && (
          <>
            {/* ---- Step 1: Location ---- */}
            <div style={{ background: C.paperPanel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: C.navySoft, fontWeight: 600, marginBottom: 12 }}>
                Step 1 — Location Check
              </div>
              {result.location.passed === true && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 700, color: C.green }}>
                  🟢 Passed
                </div>
              )}
              {result.location.passed === false && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 700, color: C.red, marginBottom: 8 }}>
                    🔴 Location Criteria Failed
                  </div>
                  <div style={{ fontSize: 15, color: C.ink }}>
                    <div style={{ color: C.inkSoft, marginBottom: 2 }}>Permanent Address:</div>
                    <div style={{ marginBottom: 10 }}>{fields.permanentAddress}</div>
                    <div style={{ color: C.inkSoft, marginBottom: 2 }}>Reason:</div>
                    <div>{result.location.reason}</div>
                  </div>
                </>
              )}
              {result.location.passed === null && (
                <div style={{ fontSize: 15, color: C.inkSoft }}>{result.location.reason}</div>
              )}
            </div>

            {/* ---- Step 2: Kundli ---- */}
            <div style={{ background: C.paperPanel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: C.navySoft, fontWeight: 600, marginBottom: 12 }}>
                Step 2 — Kundli Compatibility
              </div>

              {result.kundli.available ? (
                <>
                  <div style={{ fontSize: 26, fontWeight: 700, color: C.navy, marginBottom: 6 }}>
                    {result.kundli.total_score} / {result.kundli.max_score}
                  </div>
                  <div style={{ height: 14, background: C.paperDark, borderRadius: 7, overflow: "hidden", marginBottom: 8 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${(result.kundli.total_score / result.kundli.max_score) * 100}%`,
                        background: result.kundli.total_score >= 18 ? C.green : C.red,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: result.kundli.total_score >= 18 ? C.green : C.red, marginBottom: 18 }}>
                    {scoreLabel(result.kundli.total_score)}
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    {result.kundli.breakdown.map((row) => {
                      const label = KOOTA_LABELS[row.koota] || { friendlyName: row.koota, passText: "Passed", failText: "Did not fully pass" };
                      const isFull = row.points === row.max;
                      return (
                        <div key={row.koota} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: C.paperDark, borderRadius: 6 }}>
                          <div>
                            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{label.friendlyName}</div>
                            <div style={{ fontSize: 12.5, color: C.inkSoft }}>{isFull ? label.passText : label.failText}</div>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: isFull ? C.green : C.amber, fontFamily: "'IBM Plex Mono', monospace" }}>
                            {row.points}/{row.max}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 15, color: C.inkSoft }}>{result.kundli.reason}</div>
              )}
            </div>

            {/* ---- Final decision ---- */}
            {(() => {
              const d = DECISION_DISPLAY[result.decision];
              return (
                <div style={{ background: d.bg, border: `1px solid ${d.color}`, borderRadius: 10, padding: 24, textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{d.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: d.color, marginBottom: 6 }}>{d.title}</div>
                  <div style={{ fontSize: 15.5, color: C.ink }}>{result.decisionText}</div>
                </div>
              );
            })()}

            {/* ---- Actions ---- */}
            <div className="no-print" style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                onClick={onReset}
                style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 6, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Check Another Profile
              </button>
              <button
                onClick={() => window.print()}
                style={{ background: C.brass, color: "#fff", border: "none", borderRadius: 6, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Download / Print Report
              </button>
              <button
                onClick={copySummary}
                style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 6, padding: "12px 20px", fontSize: 14, color: C.inkSoft, cursor: "pointer" }}
              >
                {copied ? "Copied!" : "Copy Summary"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
