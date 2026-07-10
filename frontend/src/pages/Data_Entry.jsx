import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "./Header";

// Largely just copied over from the signup page. I'll rewrite what I have here so it actually works to submit the data
function Data_Entry() {
  const navigate = useNavigate();

  // Form fields.
  const [gene, setGene] = useState("");
  const [genotype, setGenotype] = useState("");
  const [phenotype, setPhenotype] = useState("");

  // Message shown when something goes wrong.
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault(); // stop the page from reloading

    // Basic validation: no empty fields.
    if (!gene || !genotype || !phenotype) {
      setError("Please fill in all fields.");
      return;
    }

    // Try to create the account using the localStorage helper (FIX THIS PART FOR DATA ENTRY)
    // const result = signUp(gene, genotype, phenotype, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Success: send the user to the login page to sign in.
    navigate("/");
  }

  return (
    <div className="dashboard">
        {Header()}
        <main className = "dashboard_body">
            <div className = "profile_page">
                <form className="card_data_container" onSubmit={handleSubmit}>
                    <h2 className="section-title">Enter New Data</h2>

                    {error && <p className="error">{error}</p>}

                    <input
                    className="input"
                    type="text"
                    placeholder="Gene"
                    value={gene}
                    onChange={(event) => setGene(event.target.value)}
                    />
                    <input
                    className="input"
                    type="text"
                    placeholder="Genotype"
                    value={genotype}
                    onChange={(event) => setGenotype(event.target.value)}
                    />
                    <input
                    className="input"
                    type="email"
                    placeholder="Phenotype"
                    value={phenotype}
                    onChange={(event) => setPhenotype(event.target.value)}
                    />

                    <button className="btn" type="submit">
                    Add New Data
                    </button>
                </form>
            </div>
      </main>
    </div>
  );
}

export default Data_Entry;
