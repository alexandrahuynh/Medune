import { useEffect, useState } from "react";
import { getAuthenticatedUser, logIn, logOut, signUp } from "../utils/auth";
import { AuthContext } from "./authContextValue";

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: "loading", user: null });

  useEffect(() => {
    let active = true;
    getAuthenticatedUser()
      .then((user) => { if (active) setState({ status: "ready", user }); })
      .catch(() => { if (active) setState({ status: "ready", user: null }); });
    return () => { active = false; };
  }, []);

  async function login(email, password) {
    const result = await logIn(email, password);
    if (result.ok) setState({ status: "ready", user: result.data.user });
    return result;
  }

  async function logout() {
    await logOut();
    setState({ status: "ready", user: null });
  }

  return <AuthContext.Provider value={{ ...state, login, logout, signup: signUp }}>{children}</AuthContext.Provider>;
}
