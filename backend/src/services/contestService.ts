import { query } from '../database/connection';
import { evaluateCode } from './judgeService';

/**
 * Evaluate all answers for an attempt and calculate total score.
 * Called on final submission or auto-submit.
 */
export async function evaluateAttempt(attemptId: string): Promise<number> {
  // Get attempt with language
  const { rows: attemptRows } = await query(
    'SELECT * FROM attempts WHERE id = $1',
    [attemptId]
  );
  if (attemptRows.length === 0) throw new Error('Attempt not found');

  const attempt = attemptRows[0];
  const language = attempt.language;

  // Get all answers for this attempt along with starter_code and points
  const { rows: answers } = await query(
    `SELECT a.*, q.id as qid, q.starter_code, q.points as q_points
     FROM answers a
     JOIN questions q ON a.question_id = q.id
     WHERE a.attempt_id = $1
     ORDER BY q.question_number`,
    [attemptId]
  );

  let totalScore = 0;

  for (const answer of answers) {
    const isUnmodified = (answer.code || '').trim() === (answer.starter_code || '').trim();
    const isChecked = answer.status === 'CHECKED';

    if (!answer.code || answer.code.trim() === '' || answer.status === 'NOT_VISITED' || (isUnmodified && !isChecked)) {
      // Question was untouched by contestant — 0 points
      await query(
        `UPDATE answers
         SET status = 'SUBMITTED', points_earned = 0,
             evaluation_result = '{"status":"UNANSWERED","passedTests":0,"totalTests":0}'::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [answer.id]
      );
      continue;
    }

    // Get test cases (hidden only for scoring)
    const { rows: testCases } = await query(
      'SELECT * FROM test_cases WHERE question_id = $1',
      [answer.question_id]
    );

    // Get question points
    const { rows: qRows } = await query(
      'SELECT points FROM questions WHERE id = $1',
      [answer.question_id]
    );
    const maxPoints = qRows[0]?.points || 10;

    let pointsEarned = 0;
    let evalResult: any = {};

    try {
      const result = await evaluateCode(language, answer.code, testCases);
      evalResult = {
        status: result.status,
        passedTests: result.passedTests,
        totalTests: result.totalTests,
        compilationError: result.compilationError,
      };

      if (result.status === 'ACCEPTED') {
        pointsEarned = maxPoints;
      } else if (result.passedTests > 0) {
        // Partial credit proportional to passed tests
        pointsEarned = Math.floor((result.passedTests / result.totalTests) * maxPoints);
      }
    } catch (err) {
      console.error(`Evaluation failed for answer ${answer.id}:`, err);
      evalResult = { status: 'FAILED', error: 'Evaluation error' };
    }

    totalScore += pointsEarned;

    await query(
      `UPDATE answers
       SET status = 'SUBMITTED', points_earned = $1, evaluation_result = $2,
           last_checked_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [pointsEarned, JSON.stringify(evalResult), answer.id]
    );

    // Record evaluation run
    await query(
      `INSERT INTO evaluation_runs
       (attempt_id, question_id, submitted_code, language, status, score, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [attemptId, answer.question_id, answer.code, language,
       evalResult.status || 'FAILED', pointsEarned]
    );
  }

  return totalScore;
}

/**
 * Check if attempt has expired server-side.
 */
export function isAttemptExpired(attempt: any): boolean {
  if (!attempt.expires_at) return false;
  return new Date() > new Date(attempt.expires_at);
}

/**
 * Auto-submit an expired or violated attempt.
 */
export async function autoSubmitAttempt(
  attemptId: string,
  reason: 'TIME_EXPIRED' | 'VIOLATION_LIMIT'
): Promise<void> {
  // Mark as auto-submitted first to prevent race conditions
  await query(
    `UPDATE attempts
     SET status = 'AUTO_SUBMITTED', submitted_at = NOW(), auto_submit_reason = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'IN_PROGRESS'`,
    [reason, attemptId]
  );

  const score = await evaluateAttempt(attemptId);

  await query(
    `UPDATE attempts SET score = $1, updated_at = NOW() WHERE id = $2`,
    [score, attemptId]
  );

  console.log(`Auto-submitted attempt ${attemptId} (reason: ${reason}) — score: ${score}`);
}
