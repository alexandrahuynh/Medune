const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function matchMedicationRisk({ patientId, medicationId }) {
  const response = await fetch(`${API_BASE_URL}/api/risk/match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ patientId, medicationId }),
  });

  if (!response.ok) {
    throw new Error("Medication risk check failed.");
  }

  return response.json();
}
