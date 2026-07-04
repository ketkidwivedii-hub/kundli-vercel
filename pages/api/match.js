// pages/api/match.js
// Orchestrates the full check: location eligibility (pure JS, no external
// call) + kundli score (calls the Python engine deployed separately, since
// the precise astronomical calculation lives there -- see backend/ folder,
// deployed on Render). Requires BACKEND_URL to be set as an environment
// variable pointing at that deployed service.
//
// Geocoding is called via the shared lib/geocode.js function directly --
// NOT via an internal fetch("/api/geocode") call. Self-invoking your own
// API route from inside a Vercel serverless function is fragile and was
// returning an HTML fallback page instead of JSON; importing the plain
// function removes that failure mode entirely.

export const config = {
  maxDuration: 60, // give Render's cold start room to finish (Vercel Hobby max)
};

import { checkLocationEligibilityByText, checkLocationEligibilityByState } from "../../lib/locationRules";
import { OWNER_PROFILE } from "../../lib/ownerProfile";
import { geocodePlace } from "../../lib/geocode";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { fields } = req.body || {};
  if (!fields) {
    return res.status(400).json({ error: "Missing 'fields' in request body" });
  }

  // ---- Step 1: location eligibility ----
  let location;
  if (!fields.permanentAddress || !fields.permanentAddress.trim()) {
    location = { passed: null, reason: "No permanent address was provided, so this check could not run.", matchedState: null };
  } else {
    try {
      const geo = await geocodePlace(fields.permanentAddress);
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
      const geo = await geocodePlace(fields.birthLocation);
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
    decisionText = "Location check passed, but kundli score could not be calculated -- review manually.";
  }

  return res.status(200).json({ location, kundli, decision, decisionText });
}
