// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { getAuthenticatedUser, getAuthHeaders, logIn } from "./auth";

afterEach(() => vi.unstubAllGlobals());

test("session bootstrap trusts auth/me rather than browser storage", async () => {
  localStorage.setItem("medune_session", JSON.stringify({ user: { email: "stale@example.com" } }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  expect(await getAuthenticatedUser()).toBeNull();
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/auth\/me$/), { credentials: "include" });
});

test("valid auth/me response becomes authoritative user and CSRF state", async () => {
  const user = { email: "current@example.com", patientId: "patient-a" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user, csrfToken: "csrf-token" }) }));
  expect(await getAuthenticatedUser()).toEqual(user);
  expect(getAuthHeaders()).toEqual({ "X-CSRF-Token": "csrf-token" });
});

test("login uses cookie credentials and captures returned CSRF token", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ supported: true, user: { email: "a@example.com" }, csrfToken: "login-csrf" }) }));
  const result = await logIn("a@example.com", "long-enough-password");
  expect(result.ok).toBe(true);
  expect(fetch.mock.calls[0][1].credentials).toBe("include");
  expect(getAuthHeaders()).toEqual({ "X-CSRF-Token": "login-csrf" });
});
