const BASE = 'http://localhost:3001';
const post = async (path, body, token) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
};
const get = async (path, token) => {
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
};

const report = [];
const check = (name, actual, expected) => {
  const ok = actual === expected;
  report.push(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${actual}, want ${expected}`);
};

// 1. login flows
let r = await post('/api/auth/login', { username: 'supervisor_1', password: 'Supervisor1!pass' });
check('good login status', r.status, 200);
const supToken = r.body?.token;
check('login returns token', typeof supToken, 'string');

r = await post('/api/auth/login', { username: 'supervisor_1', password: 'wrongpass' });
check('bad password status', r.status, 401);

r = await post('/api/auth/login', { username: 'nobody', password: 'x' });
check('unknown user status', r.status, 401);

r = await post('/api/auth/login', '{bad json');
check('malformed json status', r.status, 400);

// 2. rate limiting (dummy username + separate IP path is same, so use unique user)
let lastStatus = 0;
for (let i = 0; i < 11; i++) {
  r = await post('/api/auth/login', { username: 'ratelimit_probe', password: 'nope' });
  lastStatus = r.status;
}
check('rate limit kicks in (429)', lastStatus, 429);

// 3. change password on qa_worker_2, then verify + reset
r = await post('/api/auth/login', { username: 'qa_worker_2', password: 'QaWorker2!pass' });
const qaToken = r.body?.token;
check('qa login', r.status, 200);

r = await post('/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'NewPass1234' }, qaToken);
check('change pw wrong current', r.status, 400);

r = await post('/api/auth/change-password', { currentPassword: 'QaWorker2!pass', newPassword: 'NewPass1234' }, qaToken);
check('change pw success', r.status, 200);

r = await post('/api/auth/login', { username: 'qa_worker_2', password: 'NewPass1234' });
check('login with new pw', r.status, 200);

r = await post('/api/auth/login', { username: 'qa_worker_2', password: 'QaWorker2!pass' });
check('old pw rejected', r.status, 401);

r = await post('/api/auth/change-password', { currentPassword: 'QaWorker2!pass', newPassword: 'short' }, qaToken);
check('short new pw rejected', r.status, 400);

// 4. role enforcement
r = await get('/api/supervisor/stats', qaToken);
check('qa cannot access supervisor', r.status, 403);

r = await get('/api/supervisor/stats', supToken);
check('supervisor can access supervisor', r.status, 200);

r = await get('/api/calls/assigned');
check('no token rejected', r.status, 401);

console.log(report.join('\n'));
console.log(report.some((l) => l.startsWith('FAIL')) ? 'SOME FAILURES' : 'ALL PASSED');