const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function getPgxResults(patientId) {
  const response = await fetch(
    `${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/pgx-results`,
  );

  if (!response.ok) {
    throw new Error("Could not load PGx profile.");
  }

  return response.json();
}

export async function savePgxResult(patientId, { gene, phenotype, genotype }) {
  const response = await fetch(
    `${API_BASE_URL}/api/patients/${encodeURIComponent(patientId)}/pgx-results`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gene, phenotype, genotype }),
    },
  );

  if (!response.ok) {
    throw new Error("Could not save PGx result.");
  }

  return response.json();
}
