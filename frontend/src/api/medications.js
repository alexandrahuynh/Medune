const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function searchMedications(query) {
  const response = await fetch(
    `${API_BASE_URL}/api/medications/search?q=${encodeURIComponent(query)}`,
  );

  if (!response.ok) {
    throw new Error("Medication search failed.");
  }

  return response.json();
}
