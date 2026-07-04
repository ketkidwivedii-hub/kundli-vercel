// lib/locationRules.js
// Permanent-address eligibility check.
//
// Two layers, because a plain string like "Kanpur" doesn't mention "Uttar
// Pradesh" anywhere -- there's no way to catch that from text alone without
// either a full city->state database or a geocoding lookup:
//
//  1. checkLocationEligibilityByText() -- fast, offline, catches cases where
//     the state name is written out (or is one of a curated list of major
//     UP/Bihar cities). Used as an immediate fallback.
//  2. checkLocationEligibilityByGeocode() -- resolves the address through
//     OpenStreetMap and reads its actual administrative state, so "Kanpur"
//     alone is correctly caught. This is the primary method; see pages/api/match.js.

const UP_ALIASES = ["uttar pradesh", "up"];
const BIHAR_ALIASES = ["bihar"];
const NOIDA_ALIASES = ["noida"];

// Not exhaustive -- a reasonable safety net if geocoding is unavailable.
// The reliable check is the geocoded one.
const KNOWN_UP_CITIES = ["kanpur", "lucknow", "varanasi", "agra", "prayagraj", "allahabad", "meerut", "ghaziabad", "bareilly", "aligarh", "moradabad", "saharanpur", "gorakhpur", "mathura"];
const KNOWN_BIHAR_CITIES = ["patna", "gaya", "muzaffarpur", "bhagalpur", "darbhanga", "purnia", "begusarai"];

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsWord(haystack, needle) {
  const pattern = new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`, "i");
  return pattern.test(haystack);
}

function evaluateNormalizedText(norm) {
  if (NOIDA_ALIASES.some((a) => containsWord(norm, a))) {
    return { passed: true, reason: "Noida is an allowed exception to the Uttar Pradesh exclusion.", matchedState: "Noida (exception)" };
  }
  if (UP_ALIASES.some((a) => containsWord(norm, a)) || KNOWN_UP_CITIES.some((c) => containsWord(norm, c))) {
    return { passed: false, reason: "This location is currently excluded based on your preferences (Uttar Pradesh).", matchedState: "Uttar Pradesh" };
  }
  if (BIHAR_ALIASES.some((a) => containsWord(norm, a)) || KNOWN_BIHAR_CITIES.some((c) => containsWord(norm, c))) {
    return { passed: false, reason: "This location is currently excluded based on your preferences (Bihar).", matchedState: "Bihar" };
  }
  return null;
}

/** Fast offline check against the raw address text (fallback path). */
export function checkLocationEligibilityByText(permanentAddress) {
  if (!permanentAddress || !permanentAddress.trim()) {
    return { passed: null, reason: "No permanent address was provided, so this check could not run.", matchedState: null };
  }
  const norm = normalize(permanentAddress);
  const hit = evaluateNormalizedText(norm);
  return hit || { passed: true, reason: "No location exclusion applies.", matchedState: null };
}

/**
 * Check against a geocoded administrative state name (e.g. from Nominatim's
 * address.state field). More reliable than text matching since it catches
 * city-only addresses like "Kanpur" with no state mentioned.
 */
export function checkLocationEligibilityByState(resolvedState, rawAddress) {
  const norm = normalize(resolvedState || "");
  const hit = evaluateNormalizedText(norm);
  if (hit) return hit;
  // Geocoding resolved a state, but it's not UP/Bihar/Noida -- also
  // double check the raw text in case geocoding mis-resolved something.
  return checkLocationEligibilityByText(rawAddress);
}
