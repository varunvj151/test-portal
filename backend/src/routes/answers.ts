import { Router, Response } from 'express';
import { query } from '../database/connection';
import { requireContestant, AuthRequest } from '../middleware/auth';
import { isAttemptExpired } from '../services/contestService';
import { evaluateCode } from '../services/judgeService';

const router = Router();

// Handler for saving code (autosave)
const saveCodeHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { attempt_id, code } = req.body;
    const questionId = req.params.id;

    if (!attempt_id) return res.status(400).json({ error: 'attempt_id required' });
    if (typeof code !== 'string') return res.status(400).json({ error: 'code must be a string' });

    // Verify attempt ownership
    const { rows: attemptRows } = await query(
      'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
      [String(attempt_id), req.contestantId]
    );
    if (attemptRows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const attempt = attemptRows[0];

    if (attempt.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: 'Cannot save code — contest is not in progress' });
    }

    if (isAttemptExpired(attempt)) {
      return res.status(403).json({ error: 'Contest has expired', expired: true });
    }

    // Verify question belongs to this contest + language
    const { rows: qRows } = await query(
      'SELECT id FROM questions WHERE id = $1 AND contest_id = $2 AND language = $3',
      [questionId, attempt.contest_id, attempt.language]
    );
    if (qRows.length === 0) {
      return res.status(404).json({ error: 'Question not found or not authorized' });
    }

    // Upsert answer
    await query(
      `INSERT INTO answers (attempt_id, question_id, code, status, last_saved_at)
       VALUES ($1, $2, $3, 'SAVED', NOW())
       ON CONFLICT (attempt_id, question_id)
       DO UPDATE SET code = EXCLUDED.code, status = 'SAVED', last_saved_at = NOW(), updated_at = NOW()`,
      [String(attempt_id), questionId, code]
    );

    return res.json({ message: 'Code saved', saved_at: new Date().toISOString() });
  } catch (err) {
    console.error('Save code error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/contest/questions/:id/save — save code
router.post('/:id/save', requireContestant, saveCodeHandler);
// PUT /api/contest/questions/:id/code — save code (legacy)
router.put('/:id/code', requireContestant, saveCodeHandler);
// POST /api/contest/questions/:id/code — save code (fallback)
router.post('/:id/code', requireContestant, saveCodeHandler);

// POST /api/contest/questions/:id/check — evaluate code
router.post('/:id/check', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const { attempt_id, code } = req.body;
    const questionId = req.params.id;

    if (!attempt_id || typeof code !== 'string') {
      return res.status(400).json({ error: 'attempt_id and code required' });
    }

    // Verify attempt ownership
    const { rows: attemptRows } = await query(
      'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
      [String(attempt_id), req.contestantId]
    );
    if (attemptRows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const attempt = attemptRows[0];

    if (attempt.status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: 'Contest is not in progress' });
    }

    if (isAttemptExpired(attempt)) {
      return res.status(403).json({ error: 'Contest has expired', expired: true });
    }

    // Verify question belongs to this attempt's language
    const { rows: qRows } = await query(
      'SELECT id, language FROM questions WHERE id = $1 AND contest_id = $2 AND language = $3',
      [questionId, attempt.contest_id, attempt.language]
    );
    if (qRows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Save code first
    await query(
      `INSERT INTO answers (attempt_id, question_id, code, status, last_saved_at)
       VALUES ($1, $2, $3, 'CHECKED', NOW())
       ON CONFLICT (attempt_id, question_id)
       DO UPDATE SET code = EXCLUDED.code, status = 'CHECKED',
                     last_saved_at = NOW(), last_checked_at = NOW(), updated_at = NOW()`,
      [String(attempt_id), questionId, code]
    );

    // Get hidden test cases
    const { rows: testCases } = await query(
      'SELECT * FROM test_cases WHERE question_id = $1',
      [questionId]
    );

    // Evaluate code in sandbox
    let result;
    try {
      result = await evaluateCode(attempt.language, code, testCases);
    } catch (evalErr) {
      console.error('Judge evaluation error:', evalErr);
      return res.status(503).json({
        error: 'Code evaluation service temporarily unavailable. Please try again.',
        safeMessage: 'Evaluation service unavailable. Your code has been saved.',
      });
    }

    // Update answer with evaluation result
    await query(
      `UPDATE answers
       SET evaluation_result = $1, last_checked_at = NOW(), updated_at = NOW()
       WHERE attempt_id = $2 AND question_id = $3`,
      [
        JSON.stringify({
          status: result.status,
          passedTests: result.passedTests,
          totalTests: result.totalTests,
          compilationError: result.compilationError,
        }),
        String(attempt_id),
        questionId,
      ]
    );

    // IMPORTANT: Never expose test data, input, or expected output to frontend
    return res.json({
      compilationError: result.compilationError,
      safeMessage: result.safeMessage,
    });
  } catch (err) {
    console.error('POST /questions/:id/check error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
