const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map();

const keyFor = (username, ip) => `${username}|${ip || 'unknown'}`;

export function loginLimiter(req, res, next) {
  const key = keyFor(req.body?.username, req.ip);
  const now = Date.now();

  const entry = attempts.get(key);
  if (entry) {
    if (now - entry.firstAt > WINDOW_MS) {
      attempts.delete(key);
    } else if (entry.count >= MAX_ATTEMPTS) {
      const minsLeft = Math.ceil((WINDOW_MS - (now - entry.firstAt)) / 60000);
      return res.status(429).json({
        error: `Too many failed login attempts. Try again in ${minsLeft} minute(s).`,
      });
    }
  }

  res.locals.loginKey = key;
  next();
}

export function recordLoginAttempt(key, failed) {
  if (!key) return;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { firstAt: now, count: 0 });
  }
  if (failed) {
    attempts.get(key).count += 1;
  } else {
    attempts.delete(key);
  }

  if (attempts.size > 10000) {
    const cutoff = now - WINDOW_MS;
    for (const [k, v] of attempts) {
      if (now - v.firstAt > cutoff) attempts.delete(k);
    }
  }
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, v] of attempts) {
    if (Date.now() - v.firstAt > cutoff) attempts.delete(k);
  }
}, WINDOW_MS).unref();