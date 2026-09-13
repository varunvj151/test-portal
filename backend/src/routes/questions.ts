import { Router, Response } from 'express';
import { query } from '../database/connection';
import { requireContestant, AuthRequest } from '../middleware/auth';
import { isAttemptExpired } from '../services/contestService';

const router = Router();

// GET /api/contest/questions — list questions for current attempt's language
router.get('/', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const { attempt_id } = req.query;

    if (!attempt_id) return res.status(400).json({ error: 'attempt_id required' });

    // Verify ownership + get language
    const { rows: attemptRows } = await query(
      'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
      [String(attempt_id), req.contestantId]
    );

    if (attemptRows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const attempt = attemptRows[0];

    if (attempt.status === 'NOT_STARTED' || attempt.status === 'LANGUAGE_SELECTED') {
      return res.status(400).json({ error: 'Contest has not started yet' });
    }

    if (isAttemptExpired(attempt) && attempt.status !== 'SUBMITTED' && attempt.status !== 'AUTO_SUBMITTED') {
      return res.status(403).json({ error: 'Contest has expired', expired: true });
    }

    // Get questions — do NOT send starter_code if already answered, send current code
    const { rows: questions } = await query(
      `SELECT q.id, q.question_number as master_question_number,
              COALESCE(a.assigned_order, q.question_number) as assigned_order,
              q.title, q.description, q.language, q.points, q.difficulty,
              q.starter_code,
              a.code as current_code, a.status as answer_status, a.points_earned
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id AND a.attempt_id = $1
       WHERE q.contest_id = $2 AND q.language = $3
       ORDER BY COALESCE(a.assigned_order, q.question_number) ASC`,
      [String(attempt_id), attempt.contest_id, attempt.language]
    );

    // Return questions without exposing test cases
    return res.json({
      questions: questions.map(q => ({
        id: q.id,
        question_number: q.assigned_order,
        title: q.title,
        description: q.description,
        language: q.language,
        points: q.points,
        difficulty: q.difficulty,
        // Send current code if saved, otherwise starter code
        code: q.current_code !== null ? q.current_code : q.starter_code,
        starter_code: q.starter_code,
        answer_status: q.answer_status || 'NOT_VISITED',
        points_earned: q.points_earned,
      })),
    });
  } catch (err) {
    console.error('GET /questions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/contest/questions/:id
router.get('/:id', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const { attempt_id } = req.query;
    const questionId = req.params.id;

    if (!attempt_id) return res.status(400).json({ error: 'attempt_id required' });

    // Verify attempt ownership
    const { rows: attemptRows } = await query(
      'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
      [String(attempt_id), req.contestantId]
    );
    if (attemptRows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const attempt = attemptRows[0];

    if (attempt.status === 'NOT_STARTED') {
      return res.status(400).json({ error: 'Contest not started' });
    }

    // Verify question belongs to this contest AND this language
    const { rows: qRows } = await query(
      `SELECT q.*, a.code as current_code, a.status as answer_status,
              COALESCE(a.assigned_order, q.question_number) as assigned_order
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id AND a.attempt_id = $1
       WHERE q.id = $2 AND q.contest_id = $3 AND q.language = $4`,
      [String(attempt_id), questionId, attempt.contest_id, attempt.language]
    );

    if (qRows.length === 0) {
      return res.status(404).json({ error: 'Question not found or not authorized' });
    }

    const q = qRows[0];

    // Mark as visited if not already
    if (q.answer_status === 'NOT_VISITED') {
      await query(
        `UPDATE answers SET status = 'VISITED', updated_at = NOW()
         WHERE attempt_id = $1 AND question_id = $2 AND status = 'NOT_VISITED'`,
        [String(attempt_id), questionId]
      );
    }

    return res.json({
      question: {
        id: q.id,
        question_number: q.assigned_order,
        title: q.title,
        description: q.description,
        language: q.language,
        points: q.points,
        difficulty: q.difficulty,
        code: q.current_code !== null ? q.current_code : q.starter_code,
        answer_status: q.answer_status || 'NOT_VISITED',
      },
    });
  } catch (err) {
    console.error('GET /questions/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
