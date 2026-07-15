import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchMedications } from "../api/medications";
import { getPgxResults, savePgxResult } from "../api/pgx";
import { matchMedicationRisk } from "../api/risk";
import { getCurrentUser, logOut } from "../utils/auth";

// Temporary demo patient ID until real auth/patient profile is connected.
const DEMO_PATIENT_ID = "756bd410-d6e5-427b-89aa-d86c4b82d2d9";

const PGX_GENE_OPTIONS = ["CYP2C19", "SLCO1B1"];

const PGX_PHENOTYPES_BY_GENE = {
  CYP2C19: [
    "poor metabolizer",
    "intermediate metabolizer",
    "normal metabolizer",
    "rapid metabolizer",
    "ultrarapid metabolizer",
  ],
  SLCO1B1: [
    "normal function",
    "possible decreased function",
    "decreased function",
    "poor function",
  ],
};

function getPhenotypesForGene(gene) {
  return PGX_PHENOTYPES_BY_GENE[gene] || [];
}

function Dashboard() {
  const navigate = useNavigate();

  // Find out who is currently logged in.
  const user = getCurrentUser();
  const [activePanel, setActivePanel] = useState(null);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState({
    status: "idle",
    supported: false,
    results: [],
    message: "",
  });
  const [selectedMedication, setSelectedMedication] = useState(null);
  const [riskState, setRiskState] = useState({
    status: "idle",
    result: null,
    message: "",
  });
  const [pgxState, setPgxState] = useState({
    status: "idle",
    results: [],
    message: "",
  });
  const [pgxForm, setPgxForm] = useState({
    gene: "CYP2C19",
    phenotype: "poor metabolizer",
    genotype: "",
  });
  const [pgxFormStatus, setPgxFormStatus] = useState({
    status: "idle",
    message: "",
  });

  const phenotypeOptions = getPhenotypesForGene(pgxForm.gene);

  function handleLogout() {
    logOut();
    navigate("/"); // back to the login page
  }

  async function loadPgxProfile() {
    setPgxState((current) => ({ ...current, status: "loading", message: "" }));

    try {
      // Temporary demo patient ID until real auth/patient profile is connected.
      const data = await getPgxResults(DEMO_PATIENT_ID);

      if (!data.supported) {
        setPgxState({
          status: "error",
          results: [],
          message: data.message || "Could not load PGx profile.",
        });
        return;
      }

      setPgxState({
        status: "success",
        results: data.results || [],
        message: "",
      });
    } catch (error) {
      setPgxState({
        status: "error",
        results: [],
        message: error.message,
      });
    }
  }

  useEffect(() => {
    loadPgxProfile();
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setSearchState((current) => ({ ...current, status: "loading" }));

      try {
        const data = await searchMedications(trimmedQuery);
        setSearchState({
          status: "success",
          supported: data.supported,
          results: data.results || [],
          message: data.message || "",
        });
      } catch (error) {
        setSearchState({
          status: "error",
          supported: false,
          results: [],
          message: error.message,
        });
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  function handleQueryChange(event) {
    const nextQuery = event.target.value;
    setQuery(nextQuery);

    if (!nextQuery.trim()) {
      setSearchState({
        status: "idle",
        supported: false,
        results: [],
        message: "",
      });
      setSelectedMedication(null);
      setRiskState({
        status: "idle",
        result: null,
        message: "",
      });
    }
  }

  function handleSelectMedication(medication) {
    setSelectedMedication(medication);
    setRiskState({
      status: "idle",
      result: null,
      message: "",
    });
  }

  async function handleCheckMedicationRisk() {
    if (!selectedMedication?.id) {
      return;
    }

    setRiskState({
      status: "loading",
      result: null,
      message: "",
    });

    try {
      const data = await matchMedicationRisk({
        // Temporary demo patient ID until real auth/patient profile is connected.
        patientId: DEMO_PATIENT_ID,
        medicationId: selectedMedication.id,
      });

      if (!data.supported || !data.matched) {
        setRiskState({
          status: "message",
          result: null,
          message: data.message || "No matching medication risk result was found.",
        });
        return;
      }

      setRiskState({
        status: "success",
        result: data,
        message: "",
      });
    } catch (error) {
      setRiskState({
        status: "error",
        result: null,
        message: error.message,
      });
    }
  }

  function handlePgxFormChange(event) {
    const { name, value } = event.target;

    if (name === "gene") {
      const nextPhenotypes = getPhenotypesForGene(value);
      setPgxForm({
        gene: value,
        phenotype: nextPhenotypes[0] || "",
        genotype: "",
      });
      return;
    }

    setPgxForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleAddPgxResult(event) {
    event.preventDefault();

    setPgxFormStatus({
      status: "loading",
      message: "",
    });

    try {
      // Temporary demo patient ID until real auth/patient profile is connected.
      const data = await savePgxResult(DEMO_PATIENT_ID, {
        gene: pgxForm.gene,
        phenotype: pgxForm.phenotype,
        genotype: pgxForm.genotype,
      });

      if (!data.supported) {
        setPgxFormStatus({
          status: "error",
          message: data.message || "Could not save PGx result.",
        });
        return;
      }

      setPgxFormStatus({
        status: "success",
        message: "PGx result saved.",
      });
      setPgxForm((current) => ({
        ...current,
        genotype: "",
      }));
      await loadPgxProfile();
    } catch (error) {
      setPgxFormStatus({
        status: "error",
        message: error.message,
      });
    }
  }

  function togglePanel(panelName) {
    setActivePanel((current) => (current === panelName ? null : panelName));
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="brand">MEDUNE</h1>
        <button className="btn btn-small" type="button" onClick={handleLogout}>
          Log Out
        </button>
      </header>

      <main className="dashboard-body">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h2 className="dashboard-welcome">
              Welcome, {user?.firstName || "Patient"}
            </h2>

            <div className="dashboard-side-actions">
              <button
                className={`btn btn-wireframe${activePanel === "input" ? " is-active" : ""}`}
                type="button"
                onClick={() => togglePanel("input")}
              >
                Input Data
              </button>
              <button
                className={`btn btn-wireframe${activePanel === "edit" ? " is-active" : ""}`}
                type="button"
                onClick={() => togglePanel("edit")}
              >
                Edit Data
              </button>
              <button
                className={`btn btn-wireframe${activePanel === "profile" ? " is-active" : ""}`}
                type="button"
                onClick={() => togglePanel("profile")}
              >
                Edit Profile
              </button>
            </div>
          </div>

          {activePanel === "input" && (
            <form className="pgx-form" onSubmit={handleAddPgxResult}>
              <h3>Add PGx Result</h3>
              <p className="panel-note">
                Uses the temporary demo patient until real auth/patient profile
                connection is added.
              </p>

              <label className="search-label" htmlFor="pgx-gene">
                Gene
              </label>
              <select
                id="pgx-gene"
                className="input"
                name="gene"
                value={pgxForm.gene}
                onChange={handlePgxFormChange}
              >
                {PGX_GENE_OPTIONS.map((gene) => (
                  <option key={gene} value={gene}>
                    {gene}
                  </option>
                ))}
              </select>

              <label className="search-label" htmlFor="pgx-phenotype">
                Phenotype
              </label>
              <select
                id="pgx-phenotype"
                className="input"
                name="phenotype"
                value={pgxForm.phenotype}
                onChange={handlePgxFormChange}
              >
                {phenotypeOptions.map((phenotype) => (
                  <option key={phenotype} value={phenotype}>
                    {phenotype}
                  </option>
                ))}
              </select>

              <label className="search-label" htmlFor="pgx-genotype">
                Genotype (optional)
              </label>
              <input
                id="pgx-genotype"
                className="input"
                type="text"
                name="genotype"
                placeholder="e.g. *2/*2"
                value={pgxForm.genotype}
                onChange={handlePgxFormChange}
              />

              <button
                className="btn"
                type="submit"
                disabled={pgxFormStatus.status === "loading"}
              >
                Save PGx Result
              </button>

              {pgxFormStatus.status === "loading" && (
                <p className="search-note">Saving PGx result...</p>
              )}

              {pgxFormStatus.status === "error" && (
                <p className="error">{pgxFormStatus.message}</p>
              )}

              {pgxFormStatus.status === "success" && (
                <p className="unsupported-message">{pgxFormStatus.message}</p>
              )}
            </form>
          )}

          {activePanel === "edit" && (
            <p className="unsupported-message">
              Edit Data is a wireframe placeholder for a later MVP step.
            </p>
          )}

          {activePanel === "profile" && (
            <p className="unsupported-message">
              Edit Profile is a wireframe placeholder for a later MVP step.
            </p>
          )}

          <section className="panel-section">
            <h3 className="panel-heading">My PGx Profile</h3>

            {pgxState.status === "loading" && (
              <p className="search-note">Loading PGx profile...</p>
            )}

            {pgxState.status === "error" && (
              <p className="error">{pgxState.message}</p>
            )}

            {pgxState.status === "success" && pgxState.results.length === 0 && (
              <p className="unsupported-message">
                No PGx results on file yet. Use Input Data to add one.
              </p>
            )}

            {pgxState.status === "success" && pgxState.results.length > 0 && (
              <div className="pgx-results-list">
                {pgxState.results.map((result) => (
                  <div className="pgx-result-card" key={result.id}>
                    <p>
                      <strong>Gene:</strong> {result.gene}
                    </p>
                    <p>
                      <strong>Phenotype:</strong> {result.phenotype}
                    </p>
                    <p>
                      <strong>Genotype:</strong>{" "}
                      {result.genotype || "Not provided"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel-section medication-database-card">
            <h3 className="panel-heading">Medication Database</h3>
            <p className="panel-note">
              Search an MVP-supported medication by generic or brand name.
            </p>

            <label className="search-label" htmlFor="medication-search">
              Medication
            </label>
            <input
              id="medication-search"
              className="input search-input"
              type="search"
              placeholder="Try Plavix, Celexa, or Zocor"
              value={query}
              onChange={handleQueryChange}
            />

            <div className="search-results" aria-live="polite">
              {searchState.status === "loading" && (
                <p className="search-note">Searching...</p>
              )}

              {searchState.status === "error" && (
                <p className="error">{searchState.message}</p>
              )}

              {searchState.status === "success" &&
                searchState.supported &&
                searchState.results.map((medication) => (
                  <button
                    className="result-item"
                    type="button"
                    key={medication.id}
                    onClick={() => handleSelectMedication(medication)}
                  >
                    <span>
                      <strong>{medication.genericName}</strong>
                      {medication.brandName && ` (${medication.brandName})`}
                    </span>
                    <span className="result-class">{medication.drugClass}</span>
                  </button>
                ))}

              {searchState.status === "success" && !searchState.supported && (
                <p className="unsupported-message">{searchState.message}</p>
              )}
            </div>

            {selectedMedication && (
              <div className="selected-medication-panel">
                <div className="selected-medication">
                  <span>Selected medication ID</span>
                  <code>{selectedMedication.id}</code>
                </div>

                <button
                  className="btn"
                  type="button"
                  onClick={handleCheckMedicationRisk}
                  disabled={riskState.status === "loading"}
                >
                  Check Medication Risk
                </button>

                {riskState.status === "loading" && (
                  <p className="search-note">Checking medication risk...</p>
                )}

                {riskState.status === "error" && (
                  <p className="error">{riskState.message}</p>
                )}

                {riskState.status === "message" && (
                  <p className="unsupported-message">{riskState.message}</p>
                )}
              </div>
            )}
          </section>

          {riskState.status === "success" && riskState.result && (
            <section className="risk-result-card">
              <h3 className="panel-heading">Medication Risk Result</h3>
              <dl className="risk-result-list">
                <div>
                  <dt>Risk Level</dt>
                  <dd>{riskState.result.riskLevel}</dd>
                </div>
                <div>
                  <dt>Medication</dt>
                  <dd>
                    {riskState.result.medication?.genericName}
                    {riskState.result.medication?.brandName
                      ? ` (${riskState.result.medication.brandName})`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Gene</dt>
                  <dd>{riskState.result.gene}</dd>
                </div>
                <div>
                  <dt>Phenotype</dt>
                  <dd>{riskState.result.phenotype}</dd>
                </div>
                <div>
                  <dt>Patient Summary</dt>
                  <dd>{riskState.result.patientSummary}</dd>
                </div>
                <div>
                  <dt>Recommended Action</dt>
                  <dd>{riskState.result.recommendedAction}</dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
