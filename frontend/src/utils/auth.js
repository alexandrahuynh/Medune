const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
let csrfToken = "";

export function getAuthHeaders() {
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
}

async function authRequest(path, body) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (data.csrfToken) csrfToken = data.csrfToken;
    return { ok: response.ok && data.supported, error: data.message || "Authentication failed.", data };
  } catch {
    return { ok: false, error: "Unable to reach the Medune server. Confirm the backend is running.", data: null };
  }
}

export function signUp(firstName, lastName, email, password) {
  return authRequest("register", { firstName, lastName, email, password });
}

export async function logIn(email, password) {
  return authRequest("login", { email, password });
}

export async function getAuthenticatedUser() {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" });
  if (!response.ok) { csrfToken = ""; return null; }
  const data = await response.json();
  csrfToken = data.csrfToken || "";
  return data.user || null;
}

export async function logOut() {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(),
    });
  } finally {
    csrfToken = "";
  }
}
