/**
 * Live production smoke + integration tests for Intervion.
 * Run: node scripts/live-test.cjs
 */
const BACKEND = process.env.LIVE_BACKEND_URL || 'https://ai-interview-backend-production-e046.up.railway.app';
const FRONTEND = process.env.LIVE_FRONTEND_URL || 'https://a-i-interview-frontend.vercel.app';
const API = `${BACKEND}/api/v1`;

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`❌ ${name} — ${detail}`);
}

async function req(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, json, headers: res.headers };
}

async function run() {
  console.log('\n=== Intervion Live Test Suite ===');
  console.log(`Backend: ${BACKEND}`);
  console.log(`Frontend: ${FRONTEND}\n`);

  // 1. Health
  try {
    const h = await req(`${BACKEND}/health`, { method: 'GET' });
    h.status === 200 && h.json?.status === 'ok'
      ? pass('Backend /health', h.json.ts)
      : fail('Backend /health', `HTTP ${h.status}`);
  } catch (e) {
    fail('Backend /health', e.message);
  }

  try {
    const db = await req(`${BACKEND}/health/db`, { method: 'GET' });
    db.status === 200 && db.json?.status === 'ok'
      ? pass('Backend /health/db', `${db.json.jobs} jobs, tables ok`)
      : fail('Backend /health/db', `HTTP ${db.status} ${JSON.stringify(db.json)}`);
  } catch (e) {
    fail('Backend /health/db', e.message);
  }

  // 2. Frontend pages
  for (const path of ['/', '/jobs', '/candidate/login', '/recruiter/login', '/how-it-works']) {
    try {
      const r = await fetch(`${FRONTEND}${path}`);
      r.status === 200 ? pass(`Frontend ${path}`, '200 OK') : fail(`Frontend ${path}`, `HTTP ${r.status}`);
    } catch (e) {
      fail(`Frontend ${path}`, e.message);
    }
  }

  // 3. Public API
  try {
    const jobs = await req('/public/jobs', { method: 'GET' });
    const count = jobs.json?.jobs?.length ?? 0;
    count > 0 ? pass('GET /public/jobs', `${count} jobs`) : fail('GET /public/jobs', 'empty');
  } catch (e) {
    fail('GET /public/jobs', e.message);
  }

  // 4. Full interview flow
  const candidateId = crypto.randomUUID();
  let interviewId = null;
  let sessionToken = null;

  try {
    const start = await req('/interview/start', {
      method: 'POST',
      body: JSON.stringify({ candidateId, role: 'behavioral' }),
    });
    if (start.status === 201 && start.json?.interviewId && start.json?.sessionToken) {
      interviewId = start.json.interviewId;
      sessionToken = start.json.sessionToken;
      pass('POST /interview/start', `id=${interviewId.slice(0, 8)}… token=ok`);
    } else {
      fail('POST /interview/start', `HTTP ${start.status} ${JSON.stringify(start.json)}`);
    }
  } catch (e) {
    fail('POST /interview/start', e.message);
  }

  if (!interviewId) {
    printSummary();
    process.exit(1);
  }

  // 5. Auth: answer without token should 401
  try {
    const noAuth = await req(`/interview/${interviewId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answerText: 'Test answer without auth' }),
    });
    noAuth.status === 401 && noAuth.json?.code === 'UNAUTHORIZED'
      ? pass('POST /answer without token', '401 UNAUTHORIZED')
      : fail('POST /answer without token', `HTTP ${noAuth.status} ${JSON.stringify(noAuth.json)}`);
  } catch (e) {
    fail('POST /answer without token', e.message);
  }

  // 6. begin-live
  try {
    const live = await req(`/interview/${interviewId}/begin-live`, { method: 'POST' });
    live.status === 200 && live.json?.state
      ? pass('POST /begin-live', `turns=${live.json.state.turns?.length ?? 0}`)
      : fail('POST /begin-live', `HTTP ${live.status}`);
  } catch (e) {
    fail('POST /begin-live', e.message);
  }

  // 7. get state
  try {
    const st = await req(`/interview/${interviewId}/state`, { method: 'GET' });
    st.status === 200 && st.json?.interviewId === interviewId
      ? pass('GET /state', `phase=${st.json.phase}`)
      : fail('GET /state', `HTTP ${st.status}`);
  } catch (e) {
    fail('GET /state', e.message);
  }

  // 8. submit answer WITH token
  try {
    const ans = await req(`/interview/${interviewId}/answer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({
        answerText:
          'In my previous role I led a cross-functional team to deliver a customer onboarding project. We reduced time-to-value by thirty percent through better documentation and automated welcome emails.',
      }),
    });
    if (ans.status === 200 && (ans.json?.nextReply || ans.json?.state)) {
      pass('POST /answer with sessionToken', ans.json.nextReply ? 'nextReply received' : 'state updated');
    } else {
      fail('POST /answer with sessionToken', `HTTP ${ans.status} ${JSON.stringify(ans.json)}`);
    }
  } catch (e) {
    fail('POST /answer with sessionToken', e.message);
  }

  // 9. second answer
  try {
    const ans2 = await req(`/interview/${interviewId}/answer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({
        answerText:
          'When facing conflict I listen first, clarify expectations, and propose a small experiment we can try together. That approach helped resolve a disagreement between design and engineering on scope.',
      }),
    });
    ans2.status === 200
      ? pass('POST /answer #2', ans2.json?.report ? 'interview ended with report' : 'continued')
      : fail('POST /answer #2', `HTTP ${ans2.status} ${JSON.stringify(ans2.json)}`);
  } catch (e) {
    fail('POST /answer #2', e.message);
  }

  // 10. Rate limit headers (quick burst - may not hit limit with 2 requests)
  try {
    const rl = await req(`/interview/${interviewId}/answer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ answerText: 'Short test.' }),
    });
    rl.status === 200 || rl.status === 400
      ? pass('POST /answer #3 (flow)', `HTTP ${rl.status}`)
      : fail('POST /answer #3', `HTTP ${rl.status}`);
  } catch (e) {
    fail('POST /answer #3', e.message);
  }

  // 11. Invalid token
  try {
    const bad = await req(`/interview/${interviewId}/answer`, {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid.token.here' },
      body: JSON.stringify({ answerText: 'Should fail' }),
    });
    bad.status === 403 || bad.status === 401
      ? pass('POST /answer invalid token', `HTTP ${bad.status}`)
      : fail('POST /answer invalid token', `HTTP ${bad.status}`);
  } catch (e) {
    fail('POST /answer invalid token', e.message);
  }

  // 12. End interview
  try {
    const end = await req(`/interview/${interviewId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    end.status === 200 && end.json?.ended
      ? pass('POST /end', `reportStatus=${end.json.reportStatus ?? 'n/a'}`)
      : fail('POST /end', `HTTP ${end.status} ${JSON.stringify(end.json)}`);
  } catch (e) {
    fail('POST /end', e.message);
  }

  // 13. Report
  try {
    const rep = await req(`/report/${interviewId}`, { method: 'GET' });
    rep.status === 200 && rep.json?.interviewId
      ? pass('GET /report', `score=${rep.json.overallScore}/${rep.json.maxScore}`)
      : fail('GET /report', `HTTP ${rep.status}`);
  } catch (e) {
    fail('GET /report', e.message);
  }

  // 14. Invalid join token
  try {
    const badJoin = await req('/public/join/invalid-token-xyz/start', { method: 'POST' });
    badJoin.status === 404 ? pass('POST invalid join token', '404') : fail('POST invalid join token', `HTTP ${badJoin.status}`);
  } catch (e) {
    fail('POST invalid join token', e.message);
  }

  // 15. Frontend proxy to API
  try {
    const proxy = await fetch(`${FRONTEND}/api/proxy/public/jobs`);
    const pj = await proxy.json();
    proxy.status === 200 && pj?.jobs?.length > 0
      ? pass('Frontend /api/proxy/public/jobs', `${pj.jobs.length} jobs`)
      : fail('Frontend proxy', `HTTP ${proxy.status}`);
  } catch (e) {
    fail('Frontend proxy', e.message);
  }

  printSummary();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed} | Failed: ${failed} | Total: ${results.length}`);
  if (failed) {
    console.log('\nFailed tests:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
  }
}

run().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
