import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchMedications } from "../api/medications";
import { resolvePatient } from "../api/patients";
import { getPgxResults, savePgxResult } from "../api/pgx";
import { matchMedicationRisk } from "../api/risk";
import { getCurrentUser, logOut } from "../utils/auth";

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

const PGX_GENOTYPE_EXAMPLES_BY_GENE = {
  CYP2C19: "e.g. *1/*1, *1/*2, *2/*2",
  SLCO1B1: "Examples: *1/*1, *1/*5, *2/*5, *5/*5, c.521TT, c.521TC, c.521CC",
};

function getPhenotypesForGene(gene) {
  return PGX_PHENOTYPES_BY_GENE[gene] || [];
}

function getGenotypePlaceholder(gene) {
  return PGX_GENOTYPE_EXAMPLES_BY_GENE[gene] || "Optional genotype";
}

function Dashboard() {
  const navigate = useNavigate();

  // Find out who is currently logged in.
  const user = getCurrentUser();
  // Real backend patient row for this account, resolved by email.
  const [patientId, setPatientId] = useState(null);
  const [patientStatus, setPatientStatus] = useState({
    status: "loading",
    message: "",
  });
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
  const [editForm, setEditForm] = useState({
    gene: "",
    phenotype: "",
    genotype: "",
  });
  const [editFormStatus, setEditFormStatus] = useState({
    status: "idle",
    message: "",
  });

  const phenotypeOptions = getPhenotypesForGene(pgxForm.gene);
  const genotypePlaceholder = getGenotypePlaceholder(pgxForm.gene);
  const editPhenotypeOptions = getPhenotypesForGene(editForm.gene);
  const editGenotypePlaceholder = getGenotypePlaceholder(editForm.gene);

  function handleLogout() {
    logOut();
    navigate("/"); // back to the login page
  }

  async function loadPgxProfile(activePatientId = patientId) {
    if (!activePatientId) {
      return;
    }

    setPgxState((current) => ({ ...current, status: "loading", message: "" }));

    try {
      const data = await getPgxResults(activePatientId);

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
    let cancelled = false;

    async function resolveAndLoad() {
      if (!user?.email) {
        setPatientStatus({
          status: "error",
          message: "You must be logged in to view your PGx profile.",
        });
        return;
      }

      setPatientStatus({ status: "loading", message: "" });

      try {
        // Map the logged-in account email to its own backend patient row.
        const data = await resolvePatient({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        });

        if (cancelled) {
          return;
        }

        if (!data.supported || !data.patientId) {
          setPatientStatus({
            status: "error",
            message: data.message || "Could not load your patient profile.",
          });
          return;
        }

        setPatientId(data.patientId);
        setPatientStatus({ status: "success", message: "" });
        await loadPgxProfile(data.patientId);
      } catch (error) {
        if (!cancelled) {
          setPatientStatus({ status: "error", message: error.message });
        }
      }
    }

    resolveAndLoad();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (!patientId) {
      setRiskState({
        status: "message",
        result: null,
        message: "Your patient profile is still loading. Try again shortly.",
      });
      return;
    }

    setRiskState({
      status: "loading",
      result: null,
      message: "",
    });

    try {
      // Risk matching reads PGx from pgx_results for this account's patientId.
      const data = await matchMedicationRisk({
        patientId,
        medicationId: selectedMedication.id,
      });

      if (!data.supported || !data.matched) {
        setRiskState({
          status: "message",
          result: null,
          message:
            data.message ||
            "No PGx data found. Please add your genetic result before checking medication risk.",
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

    if (!patientId) {
      setPgxFormStatus({
        status: "error",
        message: "Your patient profile is still loading. Try again shortly.",
      });
      return;
    }

    const geneAlreadySaved = pgxState.results.some(
      (result) =>
        String(result.gene).toUpperCase() === String(pgxForm.gene).toUpperCase(),
    );

    if (geneAlreadySaved) {
      setPgxFormStatus({
        status: "error",
        message: `${pgxForm.gene} already exists. Use Edit Data to update it.`,
      });
      return;
    }

    setPgxFormStatus({
      status: "loading",
      message: "",
    });

    try {
      const data = await savePgxResult(patientId, {
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

      setPgxForm({
        gene: "CYP2C19",
        phenotype: "poor metabolizer",
        genotype: "",
      });
      setPgxFormStatus({
        status: "idle",
        message: "",
      });
      await loadPgxProfile();
      setActivePanel(null);
    } catch (error) {
      setPgxFormStatus({
        status: "error",
        message: error.message,
      });
    }
  }

  function handleSelectResultToEdit(result) {
    const phenotypes = getPhenotypesForGene(result.gene);
    const phenotype = phenotypes.includes(result.phenotype)
      ? result.phenotype
      : phenotypes[0] || result.phenotype;

    setEditForm({
      gene: result.gene,
      phenotype,
      genotype: result.genotype || "",
    });
    setEditFormStatus({
      status: "idle",
      message: "",
    });
  }

  function handleEditFormChange(event) {
    const { name, value } = event.target;

    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleUpdatePgxResult(event) {
    event.preventDefault();

    if (!patientId) {
      setEditFormStatus({
        status: "error",
        message: "Your patient profile is still loading. Try again shortly.",
      });
      return;
    }

    if (!editForm.gene || !editForm.phenotype) {
      setEditFormStatus({
        status: "error",
        message: "Select a saved PGx result to edit.",
      });
      return;
    }

    setEditFormStatus({
      status: "loading",
      message: "",
    });

    try {
      // savePgxResult upserts by gene, so this updates the existing row.
      const data = await savePgxResult(patientId, {
        gene: editForm.gene,
        phenotype: editForm.phenotype,
        genotype: editForm.genotype,
      });

      if (!data.supported) {
        setEditFormStatus({
          status: "error",
          message: data.message || "Could not update PGx result.",
        });
        return;
      }

      setEditFormStatus({
        status: "success",
        message: `${editForm.gene} PGx result updated.`,
      });
      await loadPgxProfile();
      setEditForm({
        gene: "",
        phenotype: "",
        genotype: "",
      });
      setEditFormStatus({
        status: "idle",
        message: "",
      });
      setActivePanel(null);
    } catch (error) {
      setEditFormStatus({
        status: "error",
        message: error.message,
      });
    }
  }

  function togglePanel(panelName) {
    setActivePanel((current) => {
      const nextPanel = current === panelName ? null : panelName;

      if (nextPanel === "edit") {
        setEditForm({
          gene: "",
          phenotype: "",
          genotype: "",
        });
        setEditFormStatus({
          status: "idle",
          message: "",
        });
      }

      if (nextPanel === "input") {
        setPgxForm({
          gene: "CYP2C19",
          phenotype: "poor metabolizer",
          genotype: "",
        });
        setPgxFormStatus({
          status: "idle",
          message: "",
        });
      }

      return nextPanel;
    });
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
                Saved to your own account's PGx profile.
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
                placeholder={genotypePlaceholder}
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
            </form>
          )}

          {activePanel === "edit" && (
            <div className="pgx-form">
              <h3>Edit PGx Result</h3>
              <p className="panel-note">
                Choose a saved result below, update phenotype/genotype, then
                save. Gene stays the same because one result is stored per gene.
              </p>

              {pgxState.status === "loading" && (
                <p className="search-note">Loading saved PGx results...</p>
              )}

              {pgxState.status === "error" && (
                <p className="error">{pgxState.message}</p>
              )}

              {pgxState.status === "success" && pgxState.results.length === 0 && (
                <p className="unsupported-message">
                  No PGx results to edit yet. Use Input Data to add one first.
                </p>
              )}

              {pgxState.status === "success" && pgxState.results.length > 0 && (
                <>
                  <div className="pgx-results-list">
                    {pgxState.results.map((result) => (
                      <button
                        className={`pgx-result-card result-item${
                          editForm.gene === result.gene ? " is-selected" : ""
                        }`}
                        type="button"
                        key={result.id}
                        onClick={() => handleSelectResultToEdit(result)}
                      >
                        <span>
                          <strong>{result.gene}</strong>
                          <br />
                          {result.phenotype}
                          {result.genotype ? ` · ${result.genotype}` : ""}
                        </span>
                        <span className="result-class">
                          {editForm.gene === result.gene ? "Selected" : "Edit"}
                        </span>
                      </button>
                    ))}
                  </div>

                  {editForm.gene ? (
                    <form onSubmit={handleUpdatePgxResult}>
                      <label className="search-label" htmlFor="edit-pgx-gene">
                        Gene
                      </label>
                      <input
                        id="edit-pgx-gene"
                        className="input"
                        type="text"
                        name="gene"
                        value={editForm.gene}
                        readOnly
                      />

                      <label
                        className="search-label"
                        htmlFor="edit-pgx-phenotype"
                      >
                        Phenotype
                      </label>
                      <select
                        id="edit-pgx-phenotype"
                        className="input"
                        name="phenotype"
                        value={editForm.phenotype}
                        onChange={handleEditFormChange}
                      >
                        {editPhenotypeOptions.map((phenotype) => (
                          <option key={phenotype} value={phenotype}>
                            {phenotype}
                          </option>
                        ))}
                      </select>

                      <label
                        className="search-label"
                        htmlFor="edit-pgx-genotype"
                      >
                        Genotype (optional)
                      </label>
                      <input
                        id="edit-pgx-genotype"
                        className="input"
                        type="text"
                        name="genotype"
                        placeholder={editGenotypePlaceholder}
                        value={editForm.genotype}
                        onChange={handleEditFormChange}
                      />

                      <button
                        className="btn"
                        type="submit"
                        disabled={editFormStatus.status === "loading"}
                      >
                        Update PGx Result
                      </button>
                    </form>
                  ) : (
                    <p className="unsupported-message">
                      Select a saved PGx result above to edit it.
                    </p>
                  )}
                </>
              )}

              {editFormStatus.status === "loading" && (
                <p className="search-note">Updating PGx result...</p>
              )}

              {editFormStatus.status === "error" && (
                <p className="error">{editFormStatus.message}</p>
              )}

              {editFormStatus.status === "success" && (
                <p className="unsupported-message">{editFormStatus.message}</p>
              )}
            </div>
          )}

          {activePanel === "profile" && (
            <p className="unsupported-message">
              Edit Profile is a wireframe placeholder for a later MVP step.
            </p>
          )}

          <section className="panel-section">
            <h3 className="panel-heading">My PGx Profile</h3>

            {patientStatus.status === "loading" && (
              <p className="search-note">Loading your patient profile...</p>
            )}

            {patientStatus.status === "error" && (
              <p className="error">{patientStatus.message}</p>
            )}

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
