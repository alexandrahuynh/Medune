import { useNavigate } from "react-router-dom";
import { getCurrentUser, logOut } from "../utils/auth";
import Header from "./Header";

function Dashboard() {
  const navigate = useNavigate();

  // Find out who is currently logged in.
  const user = getCurrentUser();

  function handleLogout() {
        logOut();
        navigate("/"); // back to the login page
    }

  function handleDataEntry() {
    navigate("/data_entry");
  }

  // Array stores PGx data as strings-- once we integrate with the backend we'll push data in here iteratively but for now it just has static junk data
  const Data = [
    ["CYP2C19", "7/9/2026", "Manual Entry", "*2/*2", "Poor Metabolizer"],
    ["ENTRY 2", "7/9/2026", "Manual Entry", "*2/*2", "Poor Metabolizer"],
    ["ENTRY 3", "7/9/2026", "Manual Entry", "*2/*2", "Poor Metabolizer"]
  ];

  // Takes a set of strings representing a PGx data point and formats it into a card
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
      {Header()}
      <main className="dashboard-body">
        <h2>Welcome, {user ? user.firstName : "Patient"}</h2>
        <form>
          <input
            className="search_bar"
            type="text"
            placeholder="Search Medication Database"
            />
        </form>
          <div className="profile_page">
            <div className="card_data_container">
              <header className="header_with_button">
                <h2>
                  Logged PGx Data
                </h2>
                <button className="btn btn-small" type="button" onClick={handleDataEntry}>
                    Enter New Data
                </button>
              </header>
              {DisplayDataCardList()}
            </div>
          </div>
      </main>
    </div>
  );
}

export default Dashboard;
