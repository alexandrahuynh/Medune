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
      </main>
    </div>
  );
}

export default Dashboard;
