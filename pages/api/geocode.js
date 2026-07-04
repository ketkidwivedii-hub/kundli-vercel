// pages/api/geocode.js
// Converts a place-name string into coordinates + administrative state
// using OpenStreetMap's free Nominatim service. No API key needed, but
// usage policy requires a descriptive User-Agent and reasonable volume.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  const { place } = req.body || {};
  if (!place || !place.trim()) {
    return res.status(400).json({ error: "Missing 'place' in request body" });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(place)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "kundli-matching-app (personal project)" },
    });
    const results = await response.json();

    if (!results.length) {
      return res.status(404).json({ error: `Could not find a location for "${place}". Try adding the state name.` });
    }

    const r = results[0];
    const state = r.address?.state || null;

    return res.status(200).json({
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      displayName: r.display_name,
      state,
    });
  } catch (err) {
    return res.status(500).json({ error: `Geocoding failed: ${String(err)}` });
  }
}
