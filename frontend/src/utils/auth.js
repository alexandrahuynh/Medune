// Temporary auth helpers backed by localStorage.
// NOTE: This is only for testing the signup/login flow.
// It is NOT secure and will be replaced by a real backend later.

const USERS_KEY = "medune_users"; // list of all signed-up accounts
const CURRENT_USER_KEY = "medune_current_user"; // the logged-in user's email

// Read the array of saved accounts from localStorage.
function getUsers() {
  const data = localStorage.getItem(USERS_KEY);
  return data ? JSON.parse(data) : [];
}

// Save the array of accounts back to localStorage.
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Create a new account. Returns { ok, error }.
export function signUp(firstName, lastName, email, password) {
  const users = getUsers();

  // Don't allow the same email to sign up twice.
  const alreadyExists = users.some((user) => user.email === email);
  if (alreadyExists) {
    return { ok: false, error: "An account with this email already exists." };
  }

  users.push({ firstName, lastName, email, password });
  saveUsers(users);
  return { ok: true, error: "" };
}

// Log in with an email + password. Returns { ok, error }.
export function logIn(email, password) {
  const users = getUsers();
  const match = users.find(
    (user) => user.email === email && user.password === password
  );

  if (!match) {
    return { ok: false, error: "Incorrect email or password." };
  }

  // Remember who is logged in.
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(match));
  return { ok: true, error: "" };
}

// Get the currently logged-in user (or null if nobody is logged in).
export function getCurrentUser() {
  const data = localStorage.getItem(CURRENT_USER_KEY);
  return data ? JSON.parse(data) : null;
}

// Clear the logged-in user.
export function logOut() {
  localStorage.removeItem(CURRENT_USER_KEY);
}
