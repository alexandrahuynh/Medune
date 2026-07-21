import { getAuthHeaders } from "../utils/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function searchMedications(query, options = {}) {
  const response = await fetch(
    `${API_BASE_URL}/api/medications/search?q=${encodeURIComponent(query)}`,
    { signal: options.signal },
  );

  if (!response.ok) {
    throw new Error("Medication search failed.");
  }

  return response.json();
}

async function patientMedicationRequest(path = "", options = {}) {
  const response = await fetch(
    `${API_BASE_URL}/api/patients/me/medications${path}`,
    {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...options.headers },
    },
  );
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.message || "Medication list request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export function getPatientMedications() {
  return patientMedicationRequest();
}

export function addPatientMedication(medicationId) {
  return patientMedicationRequest("", {
    method: "POST",
    body: JSON.stringify({ medicationId }),
  });
}

export function updatePatientMedication(itemId, updates) {
  return patientMedicationRequest(`/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function removePatientMedication(itemId) {
  return patientMedicationRequest(`/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}
