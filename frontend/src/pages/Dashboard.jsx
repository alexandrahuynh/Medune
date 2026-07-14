import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchMedications } from "../api/medications";
import { getCurrentUser, logOut } from "../utils/auth";

function Dashboard() {
  const navigate = useNavigate();

  // Find out who is currently logged in.
  const user = getCurrentUser();
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState({
    status: "idle",
    supported: false,
    results: [],
    message: "",
  });
  const [selectedMedication, setSelectedMedication] = useState(null);

  function handleLogout() {
    logOut();
    navigate("/"); // back to the login page
  }

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
    }
  }

  function handleSelectMedication(medication) {
    setSelectedMedication(medication);
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
        <section className="medication-search">
          <div className="dashboard-intro">
            <h2>Welcome, {user ? user.firstName : "Patient"}</h2>
            <p>Search an MVP-supported medication by generic or brand name.</p>
          </div>

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
            <div className="selected-medication">
              <span>Selected medication ID</span>
              <code>{selectedMedication.id}</code>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
