import { getAuthHeaders } from "../utils/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function matchMedicationRisk({ medicationId }) {
  const response = await fetch(`${API_BASE_URL}/api/risk/match`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ medicationId }),
  });

  if (!response.ok) {
    throw new Error("Medication risk check failed.");
  }

  return response.json();
}
