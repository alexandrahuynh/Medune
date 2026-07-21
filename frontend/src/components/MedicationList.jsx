import { useEffect, useRef, useState } from "react";
import {
  addPatientMedication,
  getPatientMedications,
  removePatientMedication,
  searchMedications,
  updatePatientMedication,
} from "../api/medications";

const GROUP_LABELS = {
  common: "Common",
  less_common: "Less common",
  serious: "Serious or urgent",
};

function MedicationDetails({ item }) {
  const groups = Object.keys(GROUP_LABELS).map((category) => ({ category, effects: item.safety.sideEffects.filter((effect) => effect.category === category) }));

  return (
    <div className="medication-details">
      <div className="risk-estimate" aria-label="General medication safety assessment: Not evaluated">
        <strong>General safety assessment: {item.assessment.label}</strong>
        <span>No aggregate medication-risk score is calculated.</span>
      </div>

      <details>
        <summary>Why this rating?</summary>
        <ul>
          {item.assessment.factors.map((factor) => (
            <li key={factor.code}>{factor.label}</li>
          ))}
        </ul>
      </details>

      <p><strong>Available forms:</strong> {item.safety.forms.join(", ") || "Not available"}</p>
      <p><strong>Dosage:</strong> {item.safety.dosageInformation}</p>

      {item.safety.status !== "available" && (
        <p className="unsupported-message">Side-effect details are not shown because Medune does not yet have clinically reviewed, versioned source records for this medication.</p>
      )}
      {item.safety.status === "available" && groups.map(({ category, effects }) => (
        <section className="side-effect-group" key={category} aria-labelledby={`${item.id}-${category}`}>
          <h5 id={`${item.id}-${category}`}>{GROUP_LABELS[category]}</h5>
          {effects.length === 0 ? (
            <p>No effects are listed in this fixture category.</p>
          ) : (
            <ul>
              {effects.map((effect) => (
                <li key={`${category}-${effect.name}`}>
                  <strong>{effect.name}</strong> — {effect.severity}; {effect.frequency.replace("_", " ")}. {effect.attentionGuidance}
                  <small>Source: {effect.source}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="data-provenance">
        <strong>Data source:</strong> {item.safety.source || "Unavailable"}<br />
        <strong>Last updated:</strong> {item.safety.lastUpdated || "Not available"}
      </p>
      <p className="safety-disclaimer">
        Medune has not evaluated this medication's general safety. Consult a qualified healthcare professional and the medication's approved labeling before making medication decisions.
      </p>
    </div>
  );
}

function MedicationItem({ item, onChanged, onRemoved, onMessage }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(item.status);
  const [notes, setNotes] = useState(item.notes);
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await updatePatientMedication(item.id, { status, notes });
      if (!result.supported) throw new Error(result.message);
      onMessage("success", result.message);
      setEditing(false);
      await onChanged();
    } catch (error) {
      onMessage("error", error.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${item.genericName} from your medication list?`)) return;
    setSaving(true);
    try {
      const result = await removePatientMedication(item.id);
      if (!result.supported) throw new Error(result.message);
      onMessage("success", result.message);
      await onRemoved();
    } catch (error) {
      onMessage("error", error.message);
      setSaving(false);
    }
  }

  return (
    <article className="medication-list-item">
      <div className="medication-list-summary">
        <div>
          <h4>{item.genericName}{item.brandName ? ` (${item.brandName})` : ""}</h4>
          <p>{item.drugClass} · {item.status.replace("_", " ")}</p>
        </div>
        <span className="risk-pill" aria-label={`General medication safety assessment for ${item.genericName}: ${item.assessment.label}`}>{item.assessment.label}</span>
      </div>

      <div className="medication-actions">
        <button className="btn btn-compact btn-wireframe" type="button" onClick={() => setEditing(!editing)} aria-expanded={editing}>
          {editing ? "Cancel edit" : "Edit"}
        </button>
        <button className="btn btn-compact btn-secondary" type="button" onClick={remove} disabled={saving} aria-label={`Remove ${item.genericName}`}>
          Remove
        </button>
      </div>

      {editing && (
        <form className="medication-edit-form" onSubmit={save}>
          <label htmlFor={`status-${item.id}`}>Status</label>
          <select id={`status-${item.id}`} className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Active</option>
            <option value="past">Past</option>
            <option value="considering">Considering</option>
          </select>
          <label htmlFor={`notes-${item.id}`}>Notes (optional)</label>
          <textarea id={`notes-${item.id}`} className="input" maxLength="500" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <button className="btn btn-compact" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </form>
      )}

      <details className="medication-disclosure">
        <summary>Medication details and side effects</summary>
        <MedicationDetails item={item} />
      </details>
    </article>
  );
}

export default function MedicationList({ patientId }) {
  const [items, setItems] = useState([]);
  const [listState, setListState] = useState("loading");
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState({ status: "idle", results: [], message: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const loadGeneration = useRef(0);
  const searchInputRef = useRef(null);

  async function load() {
    if (!patientId) return;
    const generation = ++loadGeneration.current;
    setListState("loading");
    try {
      const data = await getPatientMedications();
      if (generation !== loadGeneration.current) return;
      if (!data.supported) throw new Error(data.message);
      setItems(data.results || []);
      setListState("success");
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      setMessage({ type: "error", text: error.message });
      setListState("error");
    }
  }

  useEffect(() => {
    // The patient id is the external identity that scopes persisted medication data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!query.trim()) {
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchState((current) => ({ ...current, status: "loading" }));
      try {
        const data = await searchMedications(query.trim(), { signal: controller.signal });
        setSearchState({ status: "success", results: data.results || [], message: data.message || "" });
      } catch (error) {
        if (error.name === "AbortError") return;
        setSearchState({ status: "error", results: [], message: error.message });
      }
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query]);

  function handleQueryChange(event) {
    const value = event.target.value;
    setQuery(value);
    if (!value.trim()) {
      setSearchState({ status: "idle", results: [], message: "" });
    }
  }

  async function add(medication) {
    if (items.some((item) => item.medicationId === medication.id)) {
      setMessage({ type: "error", text: `${medication.genericName} is already in your list.` });
      return;
    }
    setMessage({ type: "", text: "" });
    try {
      const result = await addPatientMedication(medication.id);
      if (!result.supported) throw new Error(result.message);
      setMessage({ type: "success", text: result.message });
      setQuery("");
      await load();
      searchInputRef.current?.focus();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  }

  return (
    <section className="panel-section medication-manager" aria-labelledby="my-medications-heading">
      <h3 className="panel-heading" id="my-medications-heading">My medications</h3>
      <p className="panel-note">Build a persistent medication list and review development-only safety information.</p>
      <label className="search-label" htmlFor="medication-list-search">Add a medication</label>
      <input ref={searchInputRef} id="medication-list-search" className="input" type="search" value={query} onChange={handleQueryChange} placeholder="Search Plavix, Celexa, or Zocor" disabled={!patientId} />

      <div aria-live="polite">
        {searchState.status === "loading" && <p className="search-note">Searching…</p>}
        {searchState.status === "error" && <p className="error">{searchState.message}</p>}
        {searchState.status === "success" && searchState.results.map((medication) => (
          <button key={medication.id} className="result-item" type="button" onClick={() => add(medication)} aria-label={`Add ${medication.genericName} to medication list`}>
            <span><strong>{medication.genericName}</strong>{medication.brandName ? ` (${medication.brandName})` : ""}</span>
            <span className="result-class">Add</span>
          </button>
        ))}
        {searchState.status === "success" && searchState.results.length === 0 && <p className="unsupported-message">{searchState.message}</p>}
      </div>

      {message.text && <p className={message.type === "error" ? "error" : "success-message"} role={message.type === "error" ? "alert" : "status"}>{message.text}</p>}
      {listState === "loading" && <p className="search-note">Loading medications…</p>}
      {listState === "error" && <button className="btn btn-compact" type="button" onClick={load}>Retry</button>}
      {listState === "success" && items.length === 0 && <p className="unsupported-message">Your medication list is empty. Search above to add one.</p>}
      {listState === "success" && items.map((item) => (
        <MedicationItem key={item.id} item={item} onChanged={load} onRemoved={async () => { await load(); searchInputRef.current?.focus(); }} onMessage={(type, text) => setMessage({ type, text })} />
      ))}
    </section>
  );
}
