const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Find or create the backend patient row for the logged-in account.
// Each account email maps to its own users + patients row, so PGx data
// is no longer shared across accounts.
export async function resolvePatient({ email, firstName, lastName }) {
  const response = await fetch(`${API_BASE_URL}/api/patients/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, firstName, lastName }),
  });

  if (!response.ok) {
    throw new Error("Could not load your patient profile.");
  }

  return response.json();
}
