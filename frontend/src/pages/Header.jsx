import { useNavigate } from "react-router-dom";
import { getCurrentUser, logOut } from "../utils/auth";

function Header() {
    function handleLogout() {
        logOut();
        navigate("/"); // back to the login page
    }

    return(
        <header className="dashboard-header">
            <h1 className="brand">MEDUNE</h1>
            <button className="btn btn-small" type="button" onClick={handleLogout}>
                Log Out
            </button>
        </header>
    );
}

export default Header;