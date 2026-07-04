// pages/api/geocode.js
// Thin HTTP wrapper around lib/geocode.js. Kept as a route in case anything
// client-side ever needs to geocode directly, but server-side code (like
// pages/api/match.js) should import geocodePlace() from the lib directly
// rather than calling this route over HTTP.

import { geocodePlace } from "../../lib/geocode";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  const { place } = req.body || {};

  try {
    const result = await geocodePlace(place);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: String(err.message || err) });
  }
}
