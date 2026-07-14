const UNSUPPORTED_MESSAGE = "This medication is not supported in the MVP yet.";
const EMPTY_QUERY_MESSAGE = "Enter a medication name to search.";

export async function searchMedications(pool, rawQuery) {
  const query = String(rawQuery || "").trim();

  if (!query) {
    return {
      query,
      supported: false,
      results: [],
      message: EMPTY_QUERY_MESSAGE,
    };
  }

  const { rows } = await pool.query(
    `
    SELECT id, generic_name, brand_name, drug_class
    FROM medications
    WHERE is_active = true
      AND (
        generic_name ILIKE $1
        OR brand_name ILIKE $1
      )
    ORDER BY generic_name ASC
    LIMIT 10;
    `,
    [`%${query}%`],
  );

  const results = rows.map((row) => ({
    id: row.id,
    genericName: row.generic_name,
    brandName: row.brand_name,
    drugClass: row.drug_class,
  }));

  if (results.length === 0) {
    return {
      query,
      supported: false,
      results: [],
      message: UNSUPPORTED_MESSAGE,
    };
  }

  return {
    query,
    supported: true,
    results,
  };
}
