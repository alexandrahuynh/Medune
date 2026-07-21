import { getAuthHeaders } from "../utils/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function getPgxResults() {
  const response = await fetch(
    `${API_BASE_URL}/api/patients/me/pgx-results`,
    { headers: getAuthHeaders(), credentials: "include" },
  );

  if (!response.ok) {
    throw new Error("Could not load PGx profile.");
  }

  return response.json();
}

export async function savePgxResult(_patientId, { gene, phenotype, genotype }) {
  const response = await fetch(
    `${API_BASE_URL}/api/patients/me/pgx-results`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ gene, phenotype, genotype }),
    },
  );

  if (!response.ok) {
    throw new Error("Could not save PGx result.");
  }

  return response.json();
}
