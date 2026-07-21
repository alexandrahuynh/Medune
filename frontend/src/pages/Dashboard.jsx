import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchMedications } from "../api/medications";
import { resolvePatient } from "../api/patients";
import { matchMedicationRisk } from "../api/risk";
import { getCurrentUser, logOut } from "../utils/auth";

// Returns the risk label formatted with proper spaces and capitalization
function formatRiskLevelLabel(riskLevel) {
  return String(riskLevel || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Returns the classname for the color-coded risk level card based on the risk level
function getRiskResultClassName(riskLevel) {
  switch (riskLevel) {
    case "potential_concern":
      return "risk-result-card risk-result-card--danger";
    case "caution":
      return "risk-result-card risk-result-card--warning";
    case "low_risk":
      return "risk-result-card risk-result-card--success";
    default:
      return "risk-result-card";
  }
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
  function handleLogout() {
    logOut();
    navigate("/"); // back to the login page
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

  async function handleCheckMedicationRisk(medication) {
    const med = medication ?? selectedMedication;

    if (!med?.id) {
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
        medicationId: med.id,
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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="brand">MEDUNE</h1>
        <div className="dashboard-header-actions">
          <button
            className="btn btn-small btn-wireframe"
            type="button"
            onClick={() => navigate("/profile")}
          >
            My PGx Profile
          </button>
          <button className="btn btn-small" type="button" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </header>

      <main className="dashboard-body">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h2 className="dashboard-welcome">
              Welcome, {user?.firstName || "Patient"}
            </h2>
          </div>

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
                    onClick={() => handleCheckMedicationRisk(medication)}
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
              <div className="selected-medication">
                <span>Selected medication ID</span>
                <code>{selectedMedication.id}</code>
              </div>
            )}

            {riskState.status === "loading" && (
              <p className="search-note">Checking medication risk...</p>
            )}

            {riskState.status === "error" && (
              <p className="error">{riskState.message}</p>
            )}

            {riskState.status === "message" && (
              <p className="unsupported-message">{riskState.message}</p>
            )}
          </section>
        </div>

        {riskState.status === "success" && riskState.result && (
            <section
              className={getRiskResultClassName(riskState.result.riskLevel)}
            >
              <h3 className="panel-heading">
                {riskState.result.medication?.genericName}
                {riskState.result.medication?.brandName
                  ? ` (${riskState.result.medication.brandName})`
                  : ""}
              </h3>
              <p></p>
              <dl className="risk-result-list">
                <div className="risk-meta-row">
                  <dt>Risk Level</dt>
                  <dt>Gene</dt>
                  <dt>Phenotype</dt>
                  <dd className="risk-level-panel">
                    {formatRiskLevelLabel(riskState.result.riskLevel)}
                  </dd>
                  <dd>{riskState.result.gene}</dd>
                  <dd>{riskState.result.phenotype}</dd>
                </div>
                <div className="risk-summary-panel">
                  <div>
                    <h3 className="panel-heading">Patient Summary</h3>
                    <dd>{riskState.result.patientSummary}</dd>
                  </div>
                  <div>
                    <dt>Recommended Action</dt>
                    <dd>{riskState.result.recommendedAction}</dd>
                  </div>
                </div>
              </dl>
            </section>
          )}
      </main>
    </div>
  );
}

export default Dashboard;
