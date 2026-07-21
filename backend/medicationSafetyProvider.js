// Production-facing safety data is intentionally unavailable until each record
// can be traced to a versioned label passage and has completed clinical review.
// Providers added later must validate their schema and return exact provenance.
export function getMedicationSafetyData() {
  return {
    status: "not_evaluated",
    source: null,
    sourceType: "unavailable",
    lastUpdated: null,
    forms: [],
    dosageInformation: "Not evaluated from a verified source.",
    sideEffects: [],
  };
}

export function getMedicationAssessment() {
  return {
    score: null,
    level: "unknown",
    label: "Not evaluated",
    confidence: "insufficient_data",
    factors: [
      {
        code: "VERIFIED_SAFETY_DATA_UNAVAILABLE",
        label: "Verified, versioned medication safety data is not available",
      },
    ],
    informationalOnly: true,
  };
}
