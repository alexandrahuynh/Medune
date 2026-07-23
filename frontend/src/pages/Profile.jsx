import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPgxResults, savePgxResult } from "../api/pgx";
import { useAuth } from "../auth/authContextValue";

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

function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const patientId = user?.patientId || null;
  const [patientStatus] = useState({
    status: patientId ? "success" : "error",
    message: patientId ? "" : "Your authenticated patient profile is unavailable.",
  });
  const [activePanel, setActivePanel] = useState(null);
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

  async function handleLogout() {
    await logout();
    navigate("/");
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
    if (patientId) {
      loadPgxProfile(patientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="dashboard-header-actions">
          <Link className="btn btn-small header-nav-button" to="/dashboard">
            Dashboard
          </Link>
          <button className="btn btn-small" type="button" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </header>

      <main className="dashboard-body">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h2 className="dashboard-welcome">
              {user?.firstName || "Patient"}'s Patient Profile
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
              <p className="panel-note">Saved to your own account&apos;s PGx profile.</p>

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


          {activePanel === "profile" && (
            <div className="pgx-form">
              <h3>Edit Profile</h3>
              <p className="panel-note">
                Capture a preferred name and notes for future care planning.
              </p>
              <label className="search-label" htmlFor="profile-name">
                Preferred name
              </label>
              <input
                id="profile-name"
                className="input"
                type="text"
                defaultValue={user?.firstName || ""}
              />
              <label className="search-label" htmlFor="profile-notes">
                Notes
              </label>
              <textarea
                id="profile-notes"
                className="input"
                rows="4"
                placeholder="Add reminders or care preferences"
              />
              <button className="btn" type="button">
                Save Profile Notes
              </button>
            </div>
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
              <>
                <div className="pgx-results-list">
                  {pgxState.results.map((result) => {
                    const isSelected = editForm.gene === result.gene;
                    const cardContent = (
                      <>
                        <h4 className="panel-heading pgx-result-heading">{result.gene}</h4>
                        <dl className="risk-result-list">
                          <div className="risk-meta-row">
                            <dt>Phenotype</dt>
                            <dt>Genotype</dt>
                            <dd>{result.phenotype}</dd>
                            <dd>{result.genotype || "Not provided"}</dd>
                          </div>
                        </dl>
                      </>
                    );

                    if (activePanel === "edit") {
                      return (
                        <div
                          className={`risk-result-card pgx-result-card result-item${
                            isSelected ? " is-selected" : ""
                          }`}
                          key={result.id}
                        >
                          <button
                            className="pgx-result-toggle"
                            type="button"
                            onClick={() => handleSelectResultToEdit(result)}
                            aria-label={`Edit ${result.gene}`}
                          >
                            {cardContent}
                            <span className="result-class">
                              {isSelected ? "Editing" : "Edit"}
                            </span>
                          </button>

                          {isSelected && editForm.gene ? (
                            <form className="pgx-form pgx-inline-form" onSubmit={handleUpdatePgxResult}>
                              <label className="search-label" htmlFor={`edit-pgx-gene-${result.id}`}>
                                Gene
                              </label>
                              <input
                                id={`edit-pgx-gene-${result.id}`}
                                className="input"
                                type="text"
                                name="gene"
                                value={editForm.gene}
                                readOnly
                              />

                              <label className="search-label" htmlFor={`edit-pgx-phenotype-${result.id}`}>
                                Phenotype
                              </label>
                              <select
                                id={`edit-pgx-phenotype-${result.id}`}
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

                              <label className="search-label" htmlFor={`edit-pgx-genotype-${result.id}`}>
                                Genotype (optional)
                              </label>
                              <input
                                id={`edit-pgx-genotype-${result.id}`}
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
                          ) : null}
                        </div>
                      );
                    }

                    return (
                      <div className="risk-result-card pgx-result-card" key={result.id}>
                        {cardContent}
                      </div>
                    );
                  })}
                </div>

                {activePanel === "edit" && !editForm.gene && (
                  <p className="unsupported-message">
                    Select a saved PGx result above to edit it.
                  </p>
                )}

                {activePanel === "edit" && editFormStatus.status === "loading" && (
                  <p className="search-note">Updating PGx result...</p>
                )}

                {activePanel === "edit" && editFormStatus.status === "error" && (
                  <p className="error">{editFormStatus.message}</p>
                )}

                {activePanel === "edit" && editFormStatus.status === "success" && (
                  <p className="unsupported-message">{editFormStatus.message}</p>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default Profile;
