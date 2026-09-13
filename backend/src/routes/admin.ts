import { Router, Response, Request } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../database/connection';
import { requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/admin/dashboard
router.get('/dashboard', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows: stats } = await query(`
      SELECT
        COUNT(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL) as total_contestants,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'NOT_STARTED' OR a.status = 'LANGUAGE_SELECTED') as not_started,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'IN_PROGRESS') as in_progress,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'SUBMITTED') as submitted,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'AUTO_SUBMITTED') as auto_submitted,
        COUNT(DISTINCT c.id) FILTER (WHERE a.id IS NULL) as never_started
      FROM contestants c
      LEFT JOIN attempts a ON a.contestant_id = c.id
    `);

    const { rows: contests } = await query(
      'SELECT id, title, duration_minutes, is_active FROM contests ORDER BY created_at DESC'
    );

    return res.json({
      stats: stats[0],
      contests,
    });
  } catch (err) {
    console.error('GET /admin/dashboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/contestants
router.get('/contestants', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT c.id, c.registration_number, c.name, c.department, c.is_active, c.created_at,
             a.status as attempt_status, a.language, a.score, a.violation_count,
             a.submitted_at, a.started_at, a.expires_at
      FROM contestants c
      LEFT JOIN attempts a ON a.contestant_id = c.id
      ORDER BY c.registration_number
    `);
    return res.json({ contestants: rows });
  } catch (err) {
    console.error('GET /admin/contestants error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/contestants — add single contestant (only register number required, password regno@hitech)
router.post('/contestants', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { registration_number, name, department } = req.body;
    if (!registration_number || !registration_number.trim()) {
      return res.status(400).json({ error: 'Registration number is required' });
    }

    const cleanReg = registration_number.trim();
    const studentName = (name && name.trim()) ? name.trim() : `Student ${cleanReg}`;
    // Default password structure: regno@hitech
    const defaultPassword = `${cleanReg}@hitech`;
    const hash = await bcrypt.hash(defaultPassword, 12);

    const { rows } = await query(
      `INSERT INTO contestants (registration_number, name, department, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (registration_number) DO UPDATE
         SET name = EXCLUDED.name,
             department = EXCLUDED.department,
             password_hash = EXCLUDED.password_hash,
             is_active = true
       RETURNING id, registration_number, name, department, is_active`,
      [cleanReg, studentName, department || 'Artificial Intelligence and Data Science', hash]
    );

    return res.status(201).json({ contestant: rows[0], generatedPassword: defaultPassword });
  } catch (err: any) {
    console.error('POST /admin/contestants error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/contestants/:id — remove contestant and their attempts
const removeContestantHandler = async (req: AuthRequest, res: Response) => {
  try {
    const identifier = req.params.id || req.body?.id || req.body?.registration_number;
    if (!identifier) {
      return res.status(400).json({ error: 'Contestant ID or registration number required' });
    }

    // Find the contestant by id or registration number
    const { rows: found } = await query(
      `SELECT id, registration_number FROM contestants
       WHERE id::text = $1 OR registration_number = $1`,
      [String(identifier).trim()]
    );

    if (found.length === 0) {
      return res.status(404).json({ error: 'Contestant not found' });
    }

    const contestantId = found[0].id;
    // Delete attempts first (cascades to answers, violations, evaluation_runs, contest_events)
    await query('DELETE FROM attempts WHERE contestant_id = $1', [contestantId]);
    await query('DELETE FROM contestants WHERE id = $1', [contestantId]);

    return res.json({ message: 'Contestant and all associated attempts removed successfully' });
  } catch (err) {
    console.error('Remove contestant error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

router.delete('/contestants/:id', requireAdmin, removeContestantHandler);
router.post('/contestants/:id/delete', requireAdmin, removeContestantHandler);
router.post('/contestants/remove', requireAdmin, removeContestantHandler);

// POST /api/admin/contestants/:id/reset — allow reattempt by contestant ID (clears previous attempt)
router.post('/contestants/:id/reset', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const contestantId = req.params.id;
    await query('DELETE FROM attempts WHERE contestant_id = $1', [contestantId]);
    await query('UPDATE contestants SET is_active = true WHERE id = $1', [contestantId]);
    return res.json({ message: 'Test attempt cleared. Contestant can now start fresh.' });
  } catch (err) {
    console.error('POST /admin/contestants/:id/reset error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/contestants/reset-by-regno — allow reattempt by register number
router.post('/contestants/reset-by-regno', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { registration_number } = req.body;
    if (!registration_number || !registration_number.trim()) {
      return res.status(400).json({ error: 'Registration number is required' });
    }
    const cleanReg = registration_number.trim();
    const { rows } = await query('SELECT id, registration_number, name FROM contestants WHERE registration_number = $1', [cleanReg]);
    if (rows.length === 0) {
      return res.status(404).json({ error: `Contestant with registration number "${cleanReg}" not found` });
    }

    const contestant = rows[0];
    await query('DELETE FROM attempts WHERE contestant_id = $1', [contestant.id]);
    await query('UPDATE contestants SET is_active = true WHERE id = $1', [contestant.id]);

    return res.json({
      message: `Reattempt access granted for ${cleanReg} (${contestant.name}). Contestant can now log in and take the contest fresh.`,
      contestant,
    });
  } catch (err) {
    console.error('POST /admin/contestants/reset-by-regno error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/contestants/bulk — import multiple contestants
router.post('/contestants/bulk', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { contestants } = req.body;
    if (!Array.isArray(contestants) || contestants.length === 0) {
      return res.status(400).json({ error: 'contestants array required' });
    }

    const results = [];
    for (const c of contestants) {
      if (!c.registration_number || !c.registration_number.trim()) continue;
      const cleanReg = c.registration_number.trim();
      const studentName = (c.name && c.name.trim()) ? c.name.trim() : `Student ${cleanReg}`;
      const hash = await bcrypt.hash(`${cleanReg}@hitech`, 12);
      const { rows } = await query(
        `INSERT INTO contestants (registration_number, name, department, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (registration_number) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               name = EXCLUDED.name,
               is_active = true
         RETURNING registration_number, name`,
        [cleanReg, studentName, c.department || 'Artificial Intelligence and Data Science', hash]
      );
      if (rows.length > 0) results.push(rows[0]);
    }

    return res.json({ imported: results.length, contestants: results });
  } catch (err) {
    console.error('POST /admin/contestants/bulk error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/contestants/:id — activate/deactivate
router.patch('/contestants/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { is_active } = req.body;
    const { rows } = await query(
      'UPDATE contestants SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, registration_number, name, is_active',
      [Boolean(is_active), req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Contestant not found' });
    return res.json({ contestant: rows[0] });
  } catch (err) {
    console.error('PATCH /admin/contestants/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/attempts
router.get('/attempts', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT a.id, a.contestant_id, a.status, a.language, a.score, a.violation_count,
             a.started_at, a.expires_at, a.submitted_at, a.auto_submit_reason,
             c.registration_number, c.name, c.department
      FROM attempts a
      JOIN contestants c ON c.id = a.contestant_id
      ORDER BY a.created_at DESC
    `);
    return res.json({ attempts: rows });
  } catch (err) {
    console.error('GET /admin/attempts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/leaderboard
router.get('/leaderboard', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY a.score DESC NULLS LAST, a.submitted_at ASC NULLS LAST) as rank,
        c.registration_number, c.name, c.department,
        a.language, a.score, a.violation_count, a.status,
        a.submitted_at, a.started_at,
        EXTRACT(EPOCH FROM (a.submitted_at - a.started_at))/60 as duration_minutes
      FROM attempts a
      JOIN contestants c ON c.id = a.contestant_id
      WHERE a.status IN ('SUBMITTED', 'AUTO_SUBMITTED')
      ORDER BY a.score DESC NULLS LAST, a.submitted_at ASC NULLS LAST
    `);
    return res.json({ leaderboard: rows });
  } catch (err) {
    console.error('GET /admin/leaderboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/violations
router.get('/violations', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT v.id, v.type, v.timestamp, v.metadata,
             c.registration_number, c.name,
             a.id as attempt_id, a.status as attempt_status
      FROM violations v
      JOIN attempts a ON a.id = v.attempt_id
      JOIN contestants c ON c.id = a.contestant_id
      ORDER BY v.timestamp DESC
      LIMIT 500
    `);
    return res.json({ violations: rows });
  } catch (err) {
    console.error('GET /admin/violations error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/results
router.get('/results', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT
        c.registration_number, c.name, c.department,
        a.language, a.score, a.status, a.violation_count,
        a.submitted_at, a.started_at,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'question_number', q.question_number,
                'title', q.title,
                'points', q.points,
                'points_earned', ans.points_earned,
                'status', COALESCE(ans.status, 'NOT_VISITED'),
                'evaluation_result', ans.evaluation_result
              ) ORDER BY q.question_number
            )
            FROM questions q
            LEFT JOIN answers ans ON ans.question_id = q.id AND ans.attempt_id = a.id
            WHERE q.contest_id = a.contest_id AND (a.language IS NULL OR q.language = a.language)
          ),
          '[]'::json
        ) as answers
      FROM attempts a
      JOIN contestants c ON c.id = a.contestant_id
      ORDER BY a.score DESC NULLS LAST, a.submitted_at ASC NULLS LAST
    `);
    return res.json({ results: rows });
  } catch (err) {
    console.error('GET /admin/results error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Question Management ---

// GET /api/admin/questions
router.get('/questions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { contest_id } = req.query;
    let q = 'SELECT q.*, COUNT(t.id) as test_case_count FROM questions q LEFT JOIN test_cases t ON t.question_id = q.id';
    const params: any[] = [];
    if (contest_id) {
      q += ' WHERE q.contest_id = $1';
      params.push(contest_id);
    }
    q += ' GROUP BY q.id ORDER BY q.language, q.question_number';

    const { rows } = await query(q, params);
    return res.json({ questions: rows });
  } catch (err) {
    console.error('GET /admin/questions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/questions
router.post('/questions', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { contest_id, question_number, language, title, description, starter_code, difficulty, points, test_cases } = req.body;

    if (!contest_id || !question_number || !language || !title || !description || !starter_code) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const { rows } = await query(
      `INSERT INTO questions (contest_id, question_number, language, title, description, starter_code, difficulty, points)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [contest_id, question_number, language.toUpperCase(), title, description, starter_code, difficulty || 'MEDIUM', points || 10]
    );

    const questionId = rows[0].id;

    if (Array.isArray(test_cases)) {
      for (const tc of test_cases) {
        await query(
          'INSERT INTO test_cases (question_id, input_data, expected_output, is_hidden) VALUES ($1, $2, $3, $4)',
          [questionId, tc.input_data || '', tc.expected_output, tc.is_hidden !== false]
        );
      }
    }

    return res.status(201).json({ question_id: questionId });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Question with this number and language already exists' });
    }
    console.error('POST /admin/questions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, starter_code, difficulty, points, test_cases } = req.body;
    await query(
      `UPDATE questions SET title = $1, description = $2, starter_code = $3, difficulty = $4, points = $5
       WHERE id = $6`,
      [title, description, starter_code, difficulty, points, req.params.id]
    );

    if (Array.isArray(test_cases)) {
      await query('DELETE FROM test_cases WHERE question_id = $1', [req.params.id]);
      for (const tc of test_cases) {
        await query(
          'INSERT INTO test_cases (question_id, input_data, expected_output, is_hidden) VALUES ($1, $2, $3, $4)',
          [req.params.id, tc.input_data || '', tc.expected_output, tc.is_hidden !== false]
        );
      }
    }

    return res.json({ message: 'Question updated' });
  } catch (err) {
    console.error('PUT /admin/questions/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM questions WHERE id = $1', [req.params.id]);
    return res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('DELETE /admin/questions/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
