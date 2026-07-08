import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { logIn } from "../utils/auth";

function Login() {
  const navigate = useNavigate();

  // Form fields.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Toggle to show or hide the password text.
  const [showPassword, setShowPassword] = useState(false);

  // Message shown when something goes wrong.
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault(); // stop the page from reloading

    // Basic validation: no empty fields.
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    // Try to log in using the localStorage helper.
    const result = logIn(email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Success: go to the dashboard.
    navigate("/dashboard");
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <h1 className="brand">MEDUNE</h1>

        {error && <p className="error">{error}</p>}

        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div className="password-field">
          <input
            className="input"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="show-btn"
            type="button"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        <button className="btn" type="submit">
          Log In
        </button>

        <p className="switch-text">
          Don&apos;t have an account? <Link to="/signup">Create Account</Link>
        </p>
      </form>
    </div>
  );
}

export default Login;
