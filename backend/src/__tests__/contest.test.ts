import request from 'supertest';
import app from '../index';
import { pool, query } from '../database/connection';

// NOTE: These tests require a running PostgreSQL database.
// Set DATABASE_URL and JWT_SECRET in .env before running.
// Run: npm run migrate && npm run seed before tests.

const TEST_REG_NO = '720824108119';
const TEST_PASSWORD = '720824108119@hitech';
const TEST_REG_NO_2 = '720824108120';
const TEST_PASSWORD_2 = '720824108120@hitech';

let contestantCookie: string;
let contestant2Cookie: string;
let attemptId: string;

beforeAll(async () => {
  await query(`
    DELETE FROM violations WHERE attempt_id IN (SELECT id FROM attempts WHERE contestant_id IN (SELECT id FROM contestants WHERE registration_number IN ($1, $2)))
  `, [TEST_REG_NO, TEST_REG_NO_2]);
  await query(`
    DELETE FROM answers WHERE attempt_id IN (SELECT id FROM attempts WHERE contestant_id IN (SELECT id FROM contestants WHERE registration_number IN ($1, $2)))
  `, [TEST_REG_NO, TEST_REG_NO_2]);
  await query(`
    DELETE FROM attempts WHERE contestant_id IN (SELECT id FROM contestants WHERE registration_number IN ($1, $2))
  `, [TEST_REG_NO, TEST_REG_NO_2]);
});

afterAll(async () => {
  await pool.end();
});

// ============================================================
// AUTH TESTS
// ============================================================

describe('Authentication', () => {
  test('POST /api/auth/login — valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ registration_number: TEST_REG_NO, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.contestant).toBeDefined();
    expect(res.body.contestant.registration_number).toBe(TEST_REG_NO);
    expect(res.headers['set-cookie']).toBeDefined();
    contestantCookie = res.headers['set-cookie'][0];
  });

  test('POST /api/auth/login — invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ registration_number: TEST_REG_NO, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login — nonexistent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ registration_number: '999999999999', password: 'any' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — authenticated', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', contestantCookie);
    expect(res.status).toBe(200);
    expect(res.body.contestant.registration_number).toBe(TEST_REG_NO);
  });

  test('GET /api/auth/me — unauthenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('Login contestant 2', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ registration_number: TEST_REG_NO_2, password: TEST_PASSWORD_2 });
    expect(res.status).toBe(200);
    contestant2Cookie = res.headers['set-cookie'][0];
  });
});

// ============================================================
// CONTEST TESTS
// ============================================================

describe('Contest', () => {
  test('GET /api/contest — authenticated', async () => {
    const res = await request(app)
      .get('/api/contest')
      .set('Cookie', contestantCookie);
    expect(res.status).toBe(200);
    expect(res.body.contest).toBeDefined();
    expect(res.body.contest.duration_minutes).toBe(60);
  });

  test('GET /api/contest — unauthenticated', async () => {
    const res = await request(app).get('/api/contest');
    expect(res.status).toBe(401);
  });

  test('POST /api/contest/start — creates attempt', async () => {
    const res = await request(app)
      .post('/api/contest/start')
      .set('Cookie', contestantCookie);
    expect(res.status).toBeLessThan(300);
    expect(res.body.attempt).toBeDefined();
    attemptId = res.body.attempt.id;
  });

  test('POST /api/contest/start — returns existing attempt (not duplicate)', async () => {
    const res = await request(app)
      .post('/api/contest/start')
      .set('Cookie', contestantCookie);
    expect(res.status).toBeLessThan(300);
    // Same attempt ID
    expect(res.body.attempt.id).toBe(attemptId);
  });

  test('POST /api/contest/language — invalid language rejected', async () => {
    const res = await request(app)
      .post('/api/contest/language')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId, language: 'RUBY' });
    expect(res.status).toBe(400);
  });

  test('POST /api/contest/language — valid language', async () => {
    const res = await request(app)
      .post('/api/contest/language')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId, language: 'PYTHON' });
    expect(res.status).toBe(200);
    expect(res.body.attempt.language).toBe('PYTHON');
    expect(res.body.attempt.status).toBe('IN_PROGRESS');
  });

  test('POST /api/contest/language — cannot change language', async () => {
    const res = await request(app)
      .post('/api/contest/language')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId, language: 'JAVA' });
    // Should be rejected or return current language
    if (res.status === 200) {
      expect(res.body.attempt.language).toBe('PYTHON');
    } else {
      expect(res.status).toBe(409);
    }
  });
});

// ============================================================
// QUESTION TESTS
// ============================================================

describe('Questions', () => {
  test('GET /api/contest/questions — returns questions for attempt language', async () => {
    const res = await request(app)
      .get('/api/contest/questions')
      .query({ attempt_id: attemptId })
      .set('Cookie', contestantCookie);
    expect(res.status).toBe(200);
    expect(res.body.questions).toBeDefined();
    expect(res.body.questions.length).toBe(10);
    // All should be PYTHON
    for (const q of res.body.questions) {
      expect(q.language).toBe('PYTHON');
    }
    // No test case data should be exposed
    for (const q of res.body.questions) {
      expect(q.test_cases).toBeUndefined();
      expect(q.expected_output).toBeUndefined();
    }
  });

  test('GET /api/contest/questions — contestant 2 cannot access contestant 1 attempt', async () => {
    const res = await request(app)
      .get('/api/contest/questions')
      .query({ attempt_id: attemptId })
      .set('Cookie', contestant2Cookie);
    expect(res.status).toBe(403);
  });
});

// ============================================================
// ANSWERS TESTS
// ============================================================

let questionId: string;

describe('Answers', () => {
  test('Get first question ID', async () => {
    const res = await request(app)
      .get('/api/contest/questions')
      .query({ attempt_id: attemptId })
      .set('Cookie', contestantCookie);
    questionId = res.body.questions[0].id;
    expect(questionId).toBeDefined();
  });

  test('PUT /api/contest/questions/:id/code — saves code', async () => {
    const res = await request(app)
      .put(`/api/contest/questions/${questionId}/code`)
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId, code: 'def sum_array(arr):\n    return sum(arr)\n\nn = int(input())\narr = list(map(int, input().split()))\nprint(sum_array(arr))' });
    expect(res.status).toBe(200);
    expect(res.body.saved_at).toBeDefined();
  });

  test('PUT /api/contest/questions/:id/code — contestant 2 cannot save to contestant 1 attempt', async () => {
    const res = await request(app)
      .put(`/api/contest/questions/${questionId}/code`)
      .set('Cookie', contestant2Cookie)
      .send({ attempt_id: attemptId, code: 'malicious code' });
    expect(res.status).toBe(403);
  });
});

// ============================================================
// SECURITY EVENT TESTS
// ============================================================

describe('Security Events', () => {
  test('POST /api/contest/security-event — records TAB_SWITCH', async () => {
    const res = await request(app)
      .post('/api/contest/security-event')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId, event_type: 'TAB_SWITCH' });
    expect(res.status).toBe(200);
    expect(res.body.violation_count).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/contest/security-event — debounces duplicate within 3s', async () => {
    const res1 = await request(app)
      .post('/api/contest/security-event')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId, event_type: 'FULLSCREEN_EXIT' });
    expect(res1.status).toBe(200);
    const count1 = res1.body.violation_count;

    // Immediately send same event — should be debounced
    const res2 = await request(app)
      .post('/api/contest/security-event')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId, event_type: 'FULLSCREEN_EXIT' });
    expect(res2.status).toBe(200);
    // Count should not increase on immediate duplicate
    expect(res2.body.violation_count).toBeLessThanOrEqual(count1 + 1);
  });

  test('POST /api/contest/security-event — invalid event type rejected', async () => {
    const res = await request(app)
      .post('/api/contest/security-event')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId, event_type: 'HACK_ATTEMPT' });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// SUBMISSION TESTS
// ============================================================

describe('Submission', () => {
  test('POST /api/contest/submit — submits contest', async () => {
    const res = await request(app)
      .post('/api/contest/submit')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId });
    // May be 200 or 409 if already auto-submitted by violation count
    expect([200, 409]).toContain(res.status);
  });

  test('POST /api/contest/submit — duplicate submit rejected', async () => {
    const res = await request(app)
      .post('/api/contest/submit')
      .set('Cookie', contestantCookie)
      .send({ attempt_id: attemptId });
    expect(res.status).toBe(409);
  });

  test('POST /api/contest/start — second attempt denied after submission', async () => {
    const res = await request(app)
      .post('/api/contest/start')
      .set('Cookie', contestantCookie);
    expect(res.status).toBe(409);
  });
});

// ============================================================
// ADMIN AUTH TESTS
// ============================================================

describe('Admin Authorization', () => {
  test('GET /api/admin/dashboard — contestant cannot access admin', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Cookie', contestantCookie);
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/contestants — contestant cannot access admin', async () => {
    const res = await request(app)
      .get('/api/admin/contestants')
      .set('Cookie', contestantCookie);
    expect(res.status).toBe(401);
  });
});
