// pages/api/match.js
// Orchestrates the full check: location eligibility (pure JS, no external
// call) + kundli score (calls the Python engine deployed separately, since
// the precise astronomical calculation lives there — see backend/ folder,
// deployed on Render). Requires BACKEND_URL to be set as an environment
// variable pointing at that deployed service.
//
// DEBUG NOTE (fix for "Unexpected token '<'" error): that error means
// something in this chain returned HTML instead of JSON. The most likely
// cause is Render's free tier "cold start" — if the backend has been idle,
// it can take 30-60s to wake up, and Vercel's own function can time out
// waiting on it first, returning Vercel's own HTML error page (not
// anything from the Python backend). Fixed by: (1) reading every response
// as text first and only parsing as JSON if it looks like JSON, so a
// timeout or error page produces a clear message instead of a crash, and
// (2) raising this function's own timeout so it can actually wait out a
// Render cold start instead of giving up first.

export const config = {
  maxDuration: 60, // give Render's cold start room to finish (Vercel Hobby max)
};

import { checkLocationEligibilityByText, checkLocationEligibilityByState } from "../../lib/locationRules";
import { OWNER_PROFILE } from "../../lib/ownerProfile";

// Reads a fetch Response as text first, then attempts JSON.parse. Throws a
// clear, diagnosable error (including a snippet of the raw body) instead of
// letting "Unexpected token '<'" reach the user with no context.
async function safeJson(res, label) {
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const snippet = raw.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `${label} did not return JSON (HTTP ${res.status}). This usually means the service timed out or crashed before responding. Raw response started with: "${snippet}"`
    );
  }
  return { ok: res.ok, status: res.status, data };
}

async function geocode(place, origin) {
  const res = await fetch(`${origin}/api/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place }),
  });
  const { ok, data } = await safeJson(res, "Internal geocode API");
  if (!ok) throw new Error(data.error || "Geocoding failed");
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { fields } = req.body || {};
  if (!fields) {
    return res.status(400).json({ error: "Missing 'fields' in request body" });
  }

  const origin = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;

  // ---- Step 1: location eligibility ----
  let location;
  if (!fields.permanentAddress || !fields.permanentAddress.trim()) {
    location = { passed: null, reason: "No permanent address was provided, so this check could not run.", matchedState: null };
  } else {
    try {
      const geo = await geocode(fields.permanentAddress, origin);
      location = checkLocationEligibilityByState(geo.state, fields.permanentAddress);
    } catch (err) {
      console.error("Location geocode failed, falling back to text match:", err.message || err);
      location = checkLocationEligibilityByText(fields.permanentAddress);
    }
  }

  // ---- Step 2: kundli score ----
  let kundli = { available: false, reason: null };

  if (!fields.dob || !fields.tob || !fields.birthLocation) {
    kundli.reason = "Cannot calculate kundli score because birth information is incomplete (date, time, or place of birth is missing).";
  } else if (!process.env.BACKEND_URL) {
    kundli.reason = "The kundli calculation service isn't connected yet (BACKEND_URL environment variable is not set). Deploy the /backend service and add its URL in Vercel's environment variables.";
  } else {
    try {
      const geo = await geocode(fields.birthLocation, origin);
      const prospect = {
        name: fields.fullName || "Prospect",
        dob: fields.dob,
        tob: fields.tob,
        utc_offset_hours: 5.5, // assumed India; adjust if matching profiles born elsewhere
        latitude: geo.latitude,
        longitude: geo.longitude,
      };

      const backendUrl = `${process.env.BACKEND_URL.replace(/\/$/, "")}/match`;
      console.log("Calling kundli backend:", backendUrl);

      const matchRes = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groom: prospect, bride: OWNER_PROFILE }),
      });
      const { ok, data: matchData } = await safeJson(matchRes, "Kundli backend (Render)");

      if (!ok) {
        console.error("Kundli backend returned an error:", matchRes.status, matchData);
        kundli.reason = matchData.detail || `The kundli calculation service returned an error (HTTP ${matchRes.status}).`;
      } else {
        kundli = {
          available: true,
          total_score: matchData.total_score,
          max_score: matchData.max_score,
          status: matchData.status,
          breakdown: matchData.breakdown,
          resolvedBirthPlace: geo.displayName,
        };
      }
    } catch (err) {
      console.error("Kundli calculation failed:", err.message || err);
      kundli.reason = `Could not calculate kundli score: ${String(err.message || err)}`;
    }
  }

  // ---- Step 3: overall decision ----
  let decision = "NOT_RECOMMENDED";
  let decisionText = "Important criteria did not match.";

  if (location.passed === false) {
    decision = "NOT_RECOMMENDED";
    decisionText = "Location criteria did not match.";
  } else if (kundli.available && kundli.total_score < 18) {
    decision = "NOT_RECOMMENDED";
    decisionText = "Kundli compatibility score is below the minimum threshold.";
  } else if (kundli.available && kundli.total_score > 24) {
    decision = "STRONG_MATCH";
    decisionText = "This profile meets your selected requirements.";
  } else if (kundli.available && kundli.total_score >= 18) {
    decision = "AVERAGE_MATCH";
    decisionText = "Basic criteria passed, but review manually.";
  } else if (!kundli.available && location.passed !== false) {
    decision = "AVERAGE_MATCH";
    decisionText = "Location check passed, but kundli score could not be calculated — review manually.";
  }

  return res.status(200).json({ location, kundli, decision, decisionText });
}
