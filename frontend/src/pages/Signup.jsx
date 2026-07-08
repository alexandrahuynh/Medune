import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signUp } from "../utils/auth";

function Signup() {
  const navigate = useNavigate();

  // Form fields.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Message shown when something goes wrong.
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault(); // stop the page from reloading

    // Basic validation: no empty fields.
    if (!firstName || !lastName || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    // Try to create the account using the localStorage helper.
    const result = signUp(firstName, lastName, email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Success: send the user to the login page to sign in.
    navigate("/");
  }

  return (
    <div className="auth-page">
      <form className="card" onSubmit={handleSubmit}>
        <h2 className="section-title">Create Account</h2>

        {error && <p className="error">{error}</p>}

        <input
          className="input"
          type="text"
          placeholder="First Name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
        <input
          className="input"
          type="text"
          placeholder="Last Name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button className="btn" type="submit">
          Sign Up
        </button>

        <p className="switch-text">
          Already have an account? <Link to="/">Log In</Link>
        </p>
      </form>
    </div>
  );
}

export default Signup;
