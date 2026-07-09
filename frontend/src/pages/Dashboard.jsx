import { useNavigate } from "react-router-dom";
import { getCurrentUser, logOut } from "../utils/auth";

function Dashboard() {
  const navigate = useNavigate();

  // Find out who is currently logged in.
  const user = getCurrentUser();

  function handleLogout() {
    logOut();
    navigate("/"); // back to the login page
  }

  // Array stores PGx data as strings-- once we integrate with the backend we'll push data in here iteratively but for now it just has static junk data
  const Data = [
    ["CYP2C19", "7/9/2026", "Manual Entry", "*2/*2", "Poor Metabolizer"],
    ["ENTRY 2", "7/9/2026", "Manual Entry", "*2/*2", "Poor Metabolizer"],
    ["ENTRY 3", "7/9/2026", "Manual Entry", "*2/*2", "Poor Metabolizer"]
  ];

  // Takes a PGx data point and formats it into a card
  function DisplayDataCard(geneName, timestamp, source, genotype, phenotype) {
    return (
      <div className="card_data">
        <h2 className="card_header">{geneName}</h2>
        <p className="card_timestamp">{timestamp} - {source}</p>
        <break></break>
        <p>Phenotype: {phenotype}</p>
        <p>Genotype: {genotype}</p>
      </div>
    );
  }

  // Takes all PGx data points and creates a set of cards
  function DisplayDataCardList() {
    // Map each data point into a Data Card and return an array of those cards
    const DataCards = Data.map((entry) => DisplayDataCard(entry[0], entry[1], entry[2], entry[3], entry[4]))
    return(DataCards);
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
        <h2>Welcome, {user ? user.firstName : "Patient"}</h2>
        <p>This is your dashboard. Content coming soon.</p>
          <div className="profile_page">
            <div className="card_data_container">
              <h2>Logged PGx Data</h2>
              {DisplayDataCardList()}
            </div>
          </div>
      </main>
    </div>
  );
}

export default Dashboard;
