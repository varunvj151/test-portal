import { Router, Response } from 'express';
import { query } from '../database/connection';
import { requireContestant, AuthRequest } from '../middleware/auth';
import { autoSubmitAttempt } from '../services/contestService';

const router = Router();

const ALLOWED_EVENT_TYPES = new Set([
  'TAB_SWITCH',
  'FULLSCREEN_EXIT',
  'COPY_ATTEMPT',
  'CUT_ATTEMPT',
  'PASTE_ATTEMPT',
  'PRINT_ATTEMPT',
  'PRINTSCREEN_ATTEMPT',
  'DEVTOOLS_SHORTCUT',
  'CONTEXT_MENU_ATTEMPT',
  'SUSPICIOUS_FOCUS_CHANGE',
  'TIME_EXPIRED',
]);

const VIOLATION_TYPES = new Set([
  'TAB_SWITCH',
  'FULLSCREEN_EXIT',
  'PRINTSCREEN_ATTEMPT',
]);

// POST /api/contest/security-event
router.post('/security-event', requireContestant, async (req: AuthRequest, res: Response) => {
  try {
    const { attempt_id, event_type, question_id, metadata } = req.body;

    if (!attempt_id || !event_type) {
      return res.status(400).json({ error: 'attempt_id and event_type required' });
    }

    // Sanitize event type
    const normalizedType = String(event_type).toUpperCase();
    if (!ALLOWED_EVENT_TYPES.has(normalizedType)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    // Verify attempt ownership
    const { rows: attemptRows } = await query(
      'SELECT * FROM attempts WHERE id = $1 AND contestant_id = $2',
      [String(attempt_id), req.contestantId]
    );
    if (attemptRows.length === 0) return res.status(403).json({ error: 'Access denied' });

    const attempt = attemptRows[0];

    if (attempt.status !== 'IN_PROGRESS') {
      return res.json({ message: 'Contest not active', violation_count: attempt.violation_count });
    }

    // Debounce: check if same violation type was recorded in last 3 seconds
    if (VIOLATION_TYPES.has(normalizedType)) {
      const { rows: recentViolations } = await query(
        `SELECT id FROM violations
         WHERE attempt_id = $1 AND type = $2
           AND timestamp > NOW() - INTERVAL '3 seconds'
         LIMIT 1`,
        [String(attempt_id), normalizedType]
      );

      if (recentViolations.length > 0) {
        // Duplicate within debounce window — ignore
        return res.json({
          message: 'Event debounced',
          violation_count: attempt.violation_count,
          auto_submitted: false,
        });
      }
    }

    // Record event
    await query(
      `INSERT INTO contest_events (attempt_id, event_type, metadata)
       VALUES ($1, $2, $3)`,
      [String(attempt_id), normalizedType, metadata ? JSON.stringify(metadata) : null]
    );

    let newViolationCount = attempt.violation_count;
    let autoSubmitted = false;

    // Increment violation count for serious events
    if (VIOLATION_TYPES.has(normalizedType)) {
      await query(
        `INSERT INTO violations (attempt_id, type, question_id, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          String(attempt_id),
          normalizedType,
          question_id || null,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      const { rows: updated } = await query(
        `UPDATE attempts
         SET violation_count = violation_count + 1, updated_at = NOW()
         WHERE id = $1 AND status = 'IN_PROGRESS'
         RETURNING violation_count`,
        [String(attempt_id)]
      );

      newViolationCount = updated[0]?.violation_count || attempt.violation_count + 1;

      // Auto-submit if limit exceeded
      if (newViolationCount > attempt.max_violations || newViolationCount > 3) {
        try {
          await autoSubmitAttempt(String(attempt_id), 'VIOLATION_LIMIT');
          autoSubmitted = true;
        } catch (e) {
          console.error('Auto-submit on violation error:', e);
        }
      }
    }

    return res.json({
      message: 'Event recorded',
      violation_count: newViolationCount,
      auto_submitted: autoSubmitted,
    });
  } catch (err) {
    console.error('POST /security-event error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
