// lib/geocode.js
// Converts a place-name string into coordinates + administrative state
// using OpenStreetMap's free Nominatim service. No API key needed, but
// usage policy requires a descriptive User-Agent and reasonable volume.
//
// This is a plain function, not an API route -- call it directly from
// server-side code (like pages/api/match.js) instead of making an internal
// fetch("/api/geocode") call. Self-invoking your own API route from inside
// a Vercel serverless function is fragile (it can hit routing/cold-start
// edge cases and return a fallback HTML page instead of your handler's
// JSON), so match.js should import geocodePlace() directly.

export async function geocodePlace(place) {
  if (!place || !place.trim()) {
    throw new Error("Missing place name");
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(place)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "kundli-matching-app (personal project)" },
  });

  const raw = await response.text();
  let results;
  try {
    results = JSON.parse(raw);
  } catch {
    throw new Error(`Nominatim did not return JSON (HTTP ${response.status}). Raw: ${raw.slice(0, 150)}`);
  }

  if (!response.ok) {
    throw new Error(`Nominatim returned an error (HTTP ${response.status})`);
  }
  if (!results.length) {
    throw new Error(`Could not find a location for "${place}". Try adding the state name.`);
  }

  const r = results[0];
  return {
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    displayName: r.display_name,
    state: r.address?.state || null,
  };
}
