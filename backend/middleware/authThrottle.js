const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_REGISTRATIONS = 5;

function keyFor(req, subject) {
  return `${req.ip || req.socket?.remoteAddress || "unknown"}:${String(subject || "").trim().toLowerCase()}`;
}

function checkLimit(storeKey, maximum) {
  const now = Date.now();
  const current = attempts.get(storeKey);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    attempts.set(storeKey, { count: 1, startedAt: now });
    return false;
  }
  current.count += 1;
  return current.count > maximum;
}

export function loginThrottle(req, res, next) {
  if (checkLimit(`login:${keyFor(req, req.body?.email)}`, MAX_LOGIN_ATTEMPTS)) {
    console.warn("Authentication attempt throttled.", { event: "login_throttled", ip: req.ip });
    res.setHeader("Retry-After", "900");
    return res.status(429).json({ error: "Too Many Requests", message: "Too many login attempts. Try again later." });
  }
  return next();
}

export function registrationThrottle(req, res, next) {
  if (checkLimit(`register:${keyFor(req, "registration")}`, MAX_REGISTRATIONS)) {
    console.warn("Registration attempt throttled.", { event: "registration_throttled", ip: req.ip });
    res.setHeader("Retry-After", "900");
    return res.status(429).json({ error: "Too Many Requests", message: "Too many registration attempts. Try again later." });
  }
  return next();
}

export function clearThrottleForTests() {
  attempts.clear();
}
