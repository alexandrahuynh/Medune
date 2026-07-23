import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/authContextValue";
import "./App.css";

// Only let logged-in users see the dashboard.
// If nobody is logged in, send them to the login page.
function ProtectedRoute({ children }) {
  const { status, user } = useAuth();
  if (status === "loading") return <p className="search-note">Checking session…</p>;
  return user ? children : <Navigate to="/" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
