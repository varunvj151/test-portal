import { Router, Response } from 'express';
import { query } from '../database/connection';
import { requireContestant, AuthRequest } from '../middleware/auth';
import { evaluateAttempt, isAttemptExpired, autoSubmitAttempt } from '../services/contestService';

const router = Router();

const CONTEST_ID = process.env.CONTEST_ID;

async function getActiveContest() {
  let contestQuery = 'SELECT * FROM contests WHERE is_active = true ORDER BY created_at DESC LIMIT 1';
  const params: any[] = [];

  if (CONTEST_ID) {
    contestQuery = 'SELECT * FROM contests WHERE id = $1 AND is_active = true';
    params.push(CONTEST_ID);
  }

  const { rows } = await query(contestQuery, params);
  return rows[0] || null;
}

// GET /api/contest — get contest info + attempt status
router.get('/', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const contest = await getActiveContest();
    if (!contest) return res.status(404).json({ error: 'No active contest found' });

    const { rows: attemptRows } = await query(
      'SELECT * FROM attempts WHERE contest_id = $1 AND contestant_id = $2',
      [contest.id, req.contestantId]
    );

    const attempt = attemptRows[0] || null;

    return res.json({
      contest: {
        id: contest.id,
        title: contest.title,
        description: contest.description,
        duration_minutes: contest.duration_minutes,
        max_violations: contest.max_violations,
        show_score_to_contestant: contest.show_score_to_contestant,
      },
      attempt: attempt
        ? {
            id: attempt.id,
            status: attempt.status,
            language: attempt.language,
            score: attempt.score,
            violation_count: attempt.violation_count,
            started_at: attempt.started_at,
            expires_at: attempt.expires_at,
            submitted_at: attempt.submitted_at,
          }
        : null,
    });
  } catch (err) {
    console.error('GET /contest error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/contest/start — create or restore attempt
router.post('/start', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const contest = await getActiveContest();
    if (!contest) return res.status(404).json({ error: 'No active contest found' });

    // Check for existing attempt
    const { rows: existing } = await query(
      'SELECT * FROM attempts WHERE contest_id = $1 AND contestant_id = $2',
      [contest.id, req.contestantId]
    );

    if (existing.length > 0) {
      const attempt = existing[0];
      if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
        return res.status(409).json({
          error: 'You have already completed this contest. No second attempt is allowed.',
          attempt: {
            id: attempt.id,
            status: attempt.status,
            score: attempt.score,
          },
        });
      }
      // Restore existing attempt
      return res.json({
        message: 'Existing attempt restored',
        attempt: {
          id: attempt.id,
          status: attempt.status,
          language: attempt.language,
          started_at: attempt.started_at,
          expires_at: attempt.expires_at,
          violation_count: attempt.violation_count,
        },
      });
    }

    // Create new attempt
    const { rows: newAttempt } = await query(
      `INSERT INTO attempts (contest_id, contestant_id, status)
       VALUES ($1, $2, 'NOT_STARTED')
       RETURNING *`,
      [contest.id, req.contestantId]
    );

    return res.status(201).json({
      message: 'Attempt created',
      attempt: {
        id: newAttempt[0].id,
        status: newAttempt[0].status,
      },
    });
  } catch (err: any) {
    if (err.code === '23505') {
      // UNIQUE constraint — race condition, try to fetch existing
      const contest = await getActiveContest();
      const { rows } = await query(
        'SELECT * FROM attempts WHERE contest_id = $1 AND contestant_id = $2',
        [contest?.id, req.contestantId]
      );
      if (rows.length > 0) {
        return res.json({ message: 'Existing attempt', attempt: rows[0] });
      }
    }
    console.error('POST /contest/start error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/contest/language — set language and begin contest
router.post('/language', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const { attempt_id, language } = req.body;
    const validLanguages = ['C', 'JAVA', 'PYTHON'];

    if (!language || !validLanguages.includes(language)) {
      return res.status(400).json({ error: 'Invalid language. Must be C, JAVA, or PYTHON.' });
    }

    const { rows } = await query(
      'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
      [attempt_id, req.contestantId]
    );

    if (rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const attempt = rows[0];

    if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
      return res.status(409).json({ error: 'Contest already submitted' });
    }

    if (attempt.status === 'IN_PROGRESS' || attempt.status === 'LANGUAGE_SELECTED') {
      if (attempt.language !== language) {
        return res.status(409).json({ error: 'Language cannot be changed after contest starts' });
      }
      // Already started, return current state
      return res.json({ message: 'Contest already in progress', attempt: { status: attempt.status, language: attempt.language } });
    }

    // Set language and start contest
    const contest = await getActiveContest();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (contest.duration_minutes * 60 * 1000));

    const { rows: updated } = await query(
      `UPDATE attempts
       SET language = $1, status = 'IN_PROGRESS', started_at = $2, expires_at = $3, updated_at = NOW()
       WHERE id = $4 AND contestant_id = $5 AND status NOT IN ('SUBMITTED', 'AUTO_SUBMITTED')
       RETURNING *`,
      [language, now, expiresAt, attempt_id, req.contestantId]
    );

    if (updated.length === 0) {
      return res.status(409).json({ error: 'Cannot update attempt in current state' });
    }

    // Create answer stubs for all questions of this language in randomized order
    const { rows: questions } = await query(
      `SELECT id, starter_code FROM questions WHERE contest_id = $1 AND language = $2 ORDER BY question_number`,
      [contest.id, language]
    );

    // Fisher-Yates shuffle questions for this contestant
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    await Promise.all(
      shuffled.map((q, idx) =>
        query(
          `INSERT INTO answers (attempt_id, question_id, code, status, assigned_order)
           VALUES ($1, $2, $3, 'NOT_VISITED', $4)
           ON CONFLICT (attempt_id, question_id) DO UPDATE SET assigned_order = EXCLUDED.assigned_order`,
          [attempt_id, q.id, q.starter_code, idx + 1]
        )
      )
    );

    return res.json({
      message: 'Contest started',
      attempt: {
        id: updated[0].id,
        status: updated[0].status,
        language: updated[0].language,
        started_at: updated[0].started_at,
        expires_at: updated[0].expires_at,
      },
    });
  } catch (err) {
    console.error('POST /contest/language error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/contest/heartbeat
router.post('/heartbeat', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const { attempt_id } = req.body;

    const { rows } = await query(
      'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
      [attempt_id, req.contestantId]
    );

    if (rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const attempt = rows[0];

    // Check if expired and auto-submit
    if (attempt.status === 'IN_PROGRESS' && isAttemptExpired(attempt)) {
      try {
        await autoSubmitAttempt(attempt.id, 'TIME_EXPIRED');
      } catch (autoErr) {
        console.error('Auto-submit error during heartbeat:', autoErr);
      }
      return res.json({
        server_time: new Date().toISOString(),
        expires_at: attempt.expires_at,
        status: 'AUTO_SUBMITTED',
        expired: true,
        violation_count: attempt.violation_count,
      });
    }

    return res.json({
      server_time: new Date().toISOString(),
      expires_at: attempt.expires_at,
      status: attempt.status,
      expired: false,
      violation_count: attempt.violation_count,
    });
  } catch (err) {
    console.error('POST /contest/heartbeat error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/contest/attempt — get full attempt details
router.get('/attempt', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const contest = await getActiveContest();
    if (!contest) return res.status(404).json({ error: 'No active contest' });

    const { rows } = await query(
      'SELECT * FROM attempts WHERE contest_id = $1 AND contestant_id = $2',
      [contest.id, req.contestantId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'No attempt found' });

    const attempt = rows[0];

    // Check expiry
    if (attempt.status === 'IN_PROGRESS' && isAttemptExpired(attempt)) {
      try {
        await autoSubmitAttempt(attempt.id, 'TIME_EXPIRED');
        attempt.status = 'AUTO_SUBMITTED';
      } catch (e) {
        console.error('Auto-submit during attempt fetch:', e);
      }
    }

    return res.json({
      attempt: {
        id: attempt.id,
        status: attempt.status,
        language: attempt.language,
        score: attempt.score,
        violation_count: attempt.violation_count,
        started_at: attempt.started_at,
        expires_at: attempt.expires_at,
        submitted_at: attempt.submitted_at,
      },
    });
  } catch (err) {
    console.error('GET /contest/attempt error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/contest/submit — final submission
router.post('/submit', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const { attempt_id } = req.body;

    const { rows } = await query(
      'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
      [attempt_id, req.contestantId]
    );

    if (rows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const attempt = rows[0];

    if (attempt.status === 'SUBMITTED' || attempt.status === 'AUTO_SUBMITTED') {
      return res.status(409).json({ error: 'Contest already submitted' });
    }

    if (attempt.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'Contest is not in progress' });
    }

    // Mark as submitted atomically
    const { rows: updated } = await query(
      `UPDATE attempts
       SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND contestant_id = $2 AND status = 'IN_PROGRESS'
       RETURNING *`,
      [attempt_id, req.contestantId]
    );

    if (updated.length === 0) {
      return res.status(409).json({ error: 'Could not submit — attempt may already be submitted' });
    }

    // Evaluate attempt
    try {
      const score = await evaluateAttempt(attempt_id);
      await query(
        'UPDATE attempts SET score = $1, updated_at = NOW() WHERE id = $2',
        [score, attempt_id]
      );
    } catch (err) {
      console.error('Evaluation error post-submit:', err);
    }

    return res.json({
      message: 'Contest submitted successfully',
      submitted_at: updated[0].submitted_at,
    });
  } catch (err) {
    console.error('POST /contest/submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
