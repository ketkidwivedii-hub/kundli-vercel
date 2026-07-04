// lib/kootaLabels.js
// Maps each technical Ashtakoota factor to a plain-language label and
// explanation, so the report screen never shows jargon like "Nadi" or
// "Bhakoot" without context. Written for a parent reading this, not a developer.

export const KOOTA_LABELS = {
  Varna: {
    friendlyName: "Personality Compatibility",
    passText: "Personality compatibility check passed.",
    failText: "Personality compatibility check did not fully pass.",
  },
  Vashya: {
    friendlyName: "Mutual Understanding",
    passText: "Mutual understanding and attraction check passed.",
    failText: "Mutual understanding check showed some mismatch.",
  },
  Tara: {
    friendlyName: "General Well-being",
    passText: "General well-being and luck compatibility passed.",
    failText: "General well-being compatibility showed some mismatch.",
  },
  Yoni: {
    friendlyName: "Physical Compatibility",
    passText: "Physical compatibility check passed.",
    failText: "Physical compatibility check showed some mismatch.",
  },
  "Graha Maitri": {
    friendlyName: "Mental Compatibility",
    passText: "Mental and intellectual compatibility check passed.",
    failText: "Mental compatibility check showed some mismatch.",
  },
  Gana: {
    friendlyName: "Temperament Compatibility",
    passText: "Temperament and nature compatibility check passed.",
    failText: "Temperament compatibility check showed some mismatch.",
  },
  Bhakoot: {
    friendlyName: "Family Harmony",
    passText: "Family harmony and prosperity check passed.",
    failText: "Family harmony check showed some mismatch — often reviewed manually rather than treated as disqualifying.",
  },
  Nadi: {
    friendlyName: "Health Compatibility",
    passText: "Health compatibility check passed.",
    failText: "Health compatibility check showed a mismatch — traditionally considered the most important of the eight checks.",
  },
};
