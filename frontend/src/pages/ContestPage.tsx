import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { marked } from 'marked';
import { contestApi, questionApi, answerApi, securityApi } from '../services/api';

// ============================================================
// Types
// ============================================================

interface Question {
  id: string;
  question_number: number;
  title: string;
  description: string;
  language: string;
  points: number;
  code: string;
  starter_code?: string;
  answer_status: string;
}

interface SecurityWarning {
  count: number;
  message: string;
  autoSubmitted?: boolean;
}

interface CheckResult {
  compilationError: boolean;
  safeMessage: string;
}

// ============================================================
// Language ID map for Monaco
// ============================================================

const MONACO_LANGUAGE: Record<string, string> = {
  C: 'c',
  JAVA: 'java',
  PYTHON: 'python',
};

// ============================================================
// Timer Component
// ============================================================

function Timer({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState<number>(0);
  const expiredRef = useRef(false);

  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      const exp = new Date(expiresAt).getTime();
      return Math.max(0, Math.floor((exp - now) / 1000));
    };

    setRemaining(compute());

    const interval = setInterval(() => {
      const r = compute();
      setRemaining(r);
      if (r === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const cls = remaining <= 300
    ? 'timer timer--critical'
    : remaining <= 600
    ? 'timer timer--warning'
    : 'timer';

  return <span className={cls} aria-label={`Time remaining: ${formatted}`}>{formatted}</span>;
}

// ============================================================
// Main Contest Page
// ============================================================

export default function ContestPage() {
  const navigate = useNavigate();
  const [attemptId, setAttemptId] = useState<string>('');
  const [attempt, setAttempt] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [answerStatuses, setAnswerStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'idle'>('idle');
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [securityWarning, setSecurityWarning] = useState<SecurityWarning | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [contestExpired, setContestExpired] = useState(false);
  const [fullscreenBlocked, setFullscreenBlocked] = useState(false);

  // Refs for debouncing
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const securityWarningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmitted = useRef(false);

  // ============================================================
  // Initialize
  // ============================================================

  // Prevent browser back button / swipe back navigation during contest
  useEffect(() => {
    // Push state so back navigation is trapped on the contest page
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      if (!isSubmitted.current) {
        window.history.pushState(null, '', window.location.href);
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSubmitted.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const id = sessionStorage.getItem('attempt_id');
    if (!id) {
      navigate('/home', { replace: true });
      return;
    }
    setAttemptId(id);
    loadContest(id);
  }, []);

  const loadContest = async (id: string) => {
    try {
      const [attemptResp, questionsResp] = await Promise.all([
        contestApi.getAttempt(),
        questionApi.getQuestions(id),
      ]);

      const att = attemptResp.data.attempt;
      setAttempt(att);
      setViolationCount(att.violation_count || 0);

      if (att.status === 'SUBMITTED' || att.status === 'AUTO_SUBMITTED') {
        navigate('/home', { replace: true });
        return;
      }

      const qs: Question[] = questionsResp.data.questions;
      setQuestions(qs);

      // Initialize codes from loaded questions
      const codeMap: Record<string, string> = {};
      const statusMap: Record<string, string> = {};
      for (const q of qs) {
        codeMap[q.id] = q.code || '';
        statusMap[q.id] = q.answer_status || 'NOT_VISITED';
      }
      setCodes(codeMap);
      setAnswerStatuses(statusMap);
    } catch (err: any) {
      if (err.message.includes('401')) {
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Heartbeat
  // ============================================================

  useEffect(() => {
    if (!attemptId) return;

    heartbeatTimer.current = setInterval(async () => {
      if (isSubmitted.current) return;
      try {
        const resp = await contestApi.heartbeat(attemptId);
        const data = resp.data;
        setViolationCount(data.violation_count || 0);

        if (data.status === 'AUTO_SUBMITTED' || data.status === 'SUBMITTED' || data.expired) {
          handleContestEnd('TIME_EXPIRED');
        }
      } catch {
        // Network error — don't panic, try again
      }
    }, 30000); // every 30 seconds

    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, [attemptId]);

  // ============================================================
  // Security monitoring
  // ============================================================

  const reportSecurityEvent = useCallback(
    async (eventType: string, meta?: Record<string, any>) => {
      if (!attemptId || isSubmitted.current) return;
      try {
        const currentQ = questions[currentIndex];
        const resp = await securityApi.reportEvent(
          attemptId,
          eventType,
          currentQ?.id,
          meta
        );
        const data = resp.data;
        const newCount = data.violation_count ?? violationCount;
        setViolationCount(newCount);

        if (data.auto_submitted) {
          handleContestEnd('VIOLATION_LIMIT');
          return;
        }

        // Show warning for violation types
        const violationTypes = ['TAB_SWITCH', 'FULLSCREEN_EXIT', 'PRINTSCREEN_ATTEMPT'];
        if (violationTypes.includes(eventType) && !data.auto_submitted) {
          showSecurityWarning(newCount, eventType);
        }
      } catch {
        // Network error on security event — don't crash
      }
    },
    [attemptId, currentIndex, questions, violationCount]
  );

  const showSecurityWarning = (count: number, type: string) => {
    let message = 'A security violation was detected.';
    if (type === 'TAB_SWITCH') message = 'You left the contest window.';
    if (type === 'FULLSCREEN_EXIT') message = 'You exited fullscreen mode.';
    if (type === 'PRINTSCREEN_ATTEMPT') message = 'A screenshot shortcut was detected.';

    setSecurityWarning({ count, message });

    if (securityWarningTimer.current) clearTimeout(securityWarningTimer.current);
    securityWarningTimer.current = setTimeout(() => setSecurityWarning(null), 6000);
  };

  // Tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isSubmitted.current) {
        if (tabSwitchTimer.current) clearTimeout(tabSwitchTimer.current);
        tabSwitchTimer.current = setTimeout(() => {
          reportSecurityEvent('TAB_SWITCH', { trigger: 'visibility_change' });
        }, 500);
      }
    };

    const handleBlur = () => {
      if (!isSubmitted.current) {
        if (tabSwitchTimer.current) clearTimeout(tabSwitchTimer.current);
        tabSwitchTimer.current = setTimeout(() => {
          reportSecurityEvent('TAB_SWITCH', { trigger: 'window_blur' });
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [reportSecurityEvent]);

  // Fullscreen monitoring
  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout>;

    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        setFullscreenBlocked(false);
      } else if (!isSubmitted.current) {
        if (tabSwitchTimer.current) clearTimeout(tabSwitchTimer.current);
        tabSwitchTimer.current = setTimeout(() => {
          reportSecurityEvent('FULLSCREEN_EXIT', { trigger: 'fullscreen_change' });
          setFullscreenBlocked(true);

          // Auto-hide the warning toast after 8 seconds
          clearTimeout(dismissTimer);
          dismissTimer = setTimeout(() => {
            setFullscreenBlocked(false);
          }, 8000);
        }, 500);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      clearTimeout(dismissTimer);
    };
  }, [reportSecurityEvent]);

  // Keyboard shortcuts monitoring
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitted.current) return;

      // Block print
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        reportSecurityEvent('PRINT_ATTEMPT', { key: 'Ctrl+P' });
        return;
      }

      // Block DevTools shortcuts
      if (e.key === 'F12') {
        e.preventDefault();
        reportSecurityEvent('DEVTOOLS_SHORTCUT', { key: 'F12' });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) {
        e.preventDefault();
        reportSecurityEvent('DEVTOOLS_SHORTCUT', { key: `Ctrl+Shift+${e.key}` });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        reportSecurityEvent('DEVTOOLS_SHORTCUT', { key: 'Ctrl+U' });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        return;
      }

      // PrintScreen detection (browser may not fully block OS-level)
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        reportSecurityEvent('PRINTSCREEN_ATTEMPT', { key: 'PrintScreen' });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [reportSecurityEvent]);

  // Block copy/cut/paste/contextmenu/drag OUTSIDE the editor
  useEffect(() => {
    const isInsideEditor = (target: EventTarget | null) => {
      if (!target) return false;
      const el = target as Element;
      return (
        el.closest('.monaco-editor') !== null ||
        el.closest('[class*="monaco"]') !== null ||
        el.closest('[role="textbox"]') !== null
      );
    };

    const blockEvent = (e: Event) => {
      if (isSubmitted.current) return;
      if (isInsideEditor(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const type = e.type.toUpperCase() + '_ATTEMPT';
      if (['COPY_ATTEMPT', 'CUT_ATTEMPT', 'PASTE_ATTEMPT'].includes(type)) {
        reportSecurityEvent(type);
      }
      if (e.type === 'contextmenu') {
        reportSecurityEvent('CONTEXT_MENU_ATTEMPT');
      }
    };

    const preventSelectStart = (e: Event) => {
      if (isSubmitted.current) return;
      if (isInsideEditor(e.target)) return;
      e.preventDefault();
    };

    document.addEventListener('copy', blockEvent, true);
    document.addEventListener('cut', blockEvent, true);
    document.addEventListener('paste', blockEvent, true);
    document.addEventListener('contextmenu', blockEvent, true);
    document.addEventListener('dragstart', blockEvent, true);
    document.addEventListener('selectstart', preventSelectStart, true);

    return () => {
      document.removeEventListener('copy', blockEvent, true);
      document.removeEventListener('cut', blockEvent, true);
      document.removeEventListener('paste', blockEvent, true);
      document.removeEventListener('contextmenu', blockEvent, true);
      document.removeEventListener('dragstart', blockEvent, true);
      document.removeEventListener('selectstart', preventSelectStart, true);
    };
  }, [reportSecurityEvent]);

  // ============================================================
  // Autosave
  // ============================================================

  const triggerAutosave = useCallback(
    (questionId: string, code: string, retryCount = 0) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(async () => {
        if (isSubmitted.current || !attemptId) return;
        setSaveStatus('saving');
        try {
          await answerApi.saveCode(questionId, attemptId, code);
          setSaveStatus('saved');
          setAnswerStatuses(prev => ({
            ...prev,
            [questionId]: prev[questionId] === 'NOT_VISITED' ? 'SAVED' : prev[questionId] === 'CHECKED' ? 'CHECKED' : 'SAVED',
          }));
        } catch {
          setSaveStatus('error');
          // Retry failed save up to 2 times with backoff
          if (retryCount < 2 && !isSubmitted.current) {
            setTimeout(() => {
              triggerAutosave(questionId, code, retryCount + 1);
            }, 2000);
          }
        }
      }, retryCount > 0 ? 0 : 1500); // 1.5s debounce, immediate on retry
    },
    [attemptId]
  );

  // Periodic autosave every 60 seconds
  useEffect(() => {
    const periodicTimer = setInterval(() => {
      const q = questions[currentIndex];
      if (q && codes[q.id] && !isSubmitted.current && attemptId) {
        const isModified = codes[q.id].trim() !== (q.starter_code || '').trim();
        const isChecked = answerStatuses[q.id] === 'CHECKED';
        if (isModified || isChecked) {
          answerApi.saveCode(q.id, attemptId, codes[q.id]).catch(() => {});
        }
      }
    }, 60000);

    return () => clearInterval(periodicTimer);
  }, [questions, currentIndex, codes, answerStatuses, attemptId]);

  // Save code for current question on question change
  const handleQuestionChange = async (newIndex: number) => {
    if (newIndex === currentIndex) return;

    // Save current code immediately ONLY if modified or checked
    const currentQ = questions[currentIndex];
    if (currentQ && codes[currentQ.id] !== undefined && !isSubmitted.current) {
      const currentCode = codes[currentQ.id];
      const isModified = currentCode.trim() !== (currentQ.starter_code || '').trim();
      const isChecked = answerStatuses[currentQ.id] === 'CHECKED';

      if (isModified || isChecked) {
        try {
          await answerApi.saveCode(currentQ.id, attemptId, currentCode);
          setAnswerStatuses(prev => ({
            ...prev,
            [currentQ.id]: isChecked ? 'CHECKED' : 'SAVED',
          }));
        } catch {}
      }
    }

    setCurrentIndex(newIndex);
    setCheckResult(null);
  };

  const handleCodeChange = (newCode: string | undefined) => {
    const q = questions[currentIndex];
    if (!q || isSubmitted.current) return;
    const code = newCode ?? '';
    setCodes(prev => ({ ...prev, [q.id]: code }));
    setSaveStatus('idle');

    const isModified = code.trim() !== (q.starter_code || '').trim();
    const isChecked = answerStatuses[q.id] === 'CHECKED';

    if (isModified || isChecked) {
      triggerAutosave(q.id, code);
    } else {
      setAnswerStatuses(prev => ({
        ...prev,
        [q.id]: 'VISITED',
      }));
    }
  };

  // ============================================================
  // Check Code
  // ============================================================

  const handleCheckCode = async () => {
    const q = questions[currentIndex];
    if (!q || checking || isSubmitted.current) return;

    setChecking(true);
    setCheckResult(null);

    try {
      const resp = await answerApi.checkCode(q.id, attemptId, codes[q.id] || '');
      const result: CheckResult = resp.data;
      setCheckResult({
        compilationError: result.compilationError,
        safeMessage: result.compilationError ? 'Compiled with error' : 'Compiled without error',
      });
      setAnswerStatuses(prev => ({ ...prev, [q.id]: 'CHECKED' }));
    } catch {
      setCheckResult({
        compilationError: true,
        safeMessage: 'Compiled with error',
      });
    } finally {
      setChecking(false);
    }
  };

  // ============================================================
  // Contest end (expiry or auto-submit)
  // ============================================================

  const handleContestEnd = async (reason: string) => {
    if (isSubmitted.current) return;
    isSubmitted.current = true;
    setContestExpired(true);
    setAttempt((prev: any) => ({ ...prev, status: 'AUTO_SUBMITTED' }));

    if (reason === 'VIOLATION_LIMIT') {
      setSecurityWarning({
        count: 4,
        message: 'Maximum security violations exceeded. Your contest is being submitted automatically.',
        autoSubmitted: true,
      });
    }

    // Save all codes before redirect
    for (const q of questions) {
      try {
        await answerApi.saveCode(q.id, attemptId, codes[q.id] || '');
      } catch {}
    }

    setTimeout(() => {
      sessionStorage.removeItem('attempt_id');
      navigate('/home', { replace: true });
    }, 4000);
  };

  // ============================================================
  // Final Submit
  // ============================================================

  const handleSubmitConfirm = async () => {
    if (isSubmitted.current || submitting) return;
    setSubmitting(true);

    // Save only modified or checked codes first
    for (const q of questions) {
      const code = codes[q.id];
      const isModified = code && code.trim() !== (q.starter_code || '').trim();
      const isChecked = answerStatuses[q.id] === 'CHECKED';
      if (isModified || isChecked) {
        try {
          await answerApi.saveCode(q.id, attemptId, code || '');
        } catch {}
      }
    }

    try {
      await contestApi.submit(attemptId);
      isSubmitted.current = true;
      setShowSubmitModal(false);
      sessionStorage.removeItem('attempt_id');
      navigate('/home', { replace: true });
    } catch (err: any) {
      if (err.message.includes('already submitted')) {
        sessionStorage.removeItem('attempt_id');
        navigate('/home', { replace: true });
      } else {
        setSubmitting(false);
        setShowSubmitModal(false);
        alert('Submission failed: ' + err.message);
      }
    }
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="page-center">
        <p className="loading-text">Loading contest...</p>
      </div>
    );
  }

  if (!attempt || questions.length === 0) {
    return (
      <div className="page-center">
        <div className="text-center">
          <p className="text-muted mb-4">No contest data found.</p>
          <button className="btn btn-primary" onClick={() => navigate('/home')}>
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const answeredCount = questions.filter(q => {
    const code = codes[q.id];
    const isChecked = answerStatuses[q.id] === 'CHECKED';
    const isSaved = answerStatuses[q.id] === 'SAVED';
    const isModified = Boolean(code && code.trim() !== (q.starter_code || '').trim());
    return isChecked || (isSaved && isModified) || isModified;
  }).length;

  return (
    <div style={{ userSelect: 'none' }}>
      {/* ---- TOP BAR ---- */}
      <div className="topbar">
        <span className="topbar__title">Debugging Contest</span>
        <div className="topbar__center">
          {attempt?.expires_at && (
            <Timer
              expiresAt={attempt.expires_at}
              onExpire={() => handleContestEnd('TIME_EXPIRED')}
            />
          )}
          <span style={{
            fontSize: 'var(--font-size-xs)',
            color: violationCount > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)',
            fontWeight: violationCount > 0 ? 600 : 400,
          }}>
            Violations: {violationCount} / 3
          </span>
        </div>
        <div className="topbar__right">
          <button
            className="btn btn-danger btn-sm"
            onClick={() => !isSubmitted.current && setShowSubmitModal(true)}
            disabled={isSubmitted.current || submitting}
            id="submit-test-btn"
          >
            Submit Test
          </button>
        </div>
      </div>

      {/* ---- CONTEST LAYOUT ---- */}
      <div className="contest-layout">
        {/* Sidebar */}
        <div className="contest-sidebar">
          <div className="qnav__title">Questions</div>
          {questions.map((q, i) => {
            const rawStatus = answerStatuses[q.id] || 'NOT_VISITED';
            const code = codes[q.id];
            const isChecked = rawStatus === 'CHECKED';
            const isModified = Boolean(code && code.trim() !== (q.starter_code || '').trim());
            const isSaved = (rawStatus === 'SAVED' && isModified) || isModified;

            return (
              <div
                key={q.id}
                className={`qnav__item ${i === currentIndex ? 'qnav__item--active' : ''} ${isChecked ? 'qnav__item--checked' : isSaved ? 'qnav__item--saved' : ''}`}
                onClick={() => handleQuestionChange(i)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && handleQuestionChange(i)}
                aria-label={`Question ${q.question_number}: ${q.title}`}
                id={`qnav-q${q.question_number}`}
              >
                <span className={`qnav__dot ${i === currentIndex ? 'qnav__dot--active' : isChecked ? 'qnav__dot--checked' : isSaved ? 'qnav__dot--saved' : ''}`} />
                <span style={{ fontSize: 'var(--font-size-xs)' }}>Q{q.question_number}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--font-size-xs)' }}>
                  {q.title}
                </span>
              </div>
            );
          })}

          {/* Save status */}
          <div style={{ padding: 'var(--space-4)', marginTop: 'auto' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              {saveStatus === 'saving' && '● Saving...'}
              {saveStatus === 'saved' && '● Saved'}
              {saveStatus === 'error' && <span style={{ color: 'var(--color-danger)' }}>● Save failed</span>}
            </div>
          </div>
        </div>

        {/* Main panel */}
        <div className="contest-main">
          <div className="qpanel">
            {/* Left side: Problem Description & Sample Cases (Scrollable Markdown) */}
            <div className="qpanel__statement-panel">
              <div className="qpanel__meta">
                <span className="qpanel__number">Question {currentQ.question_number} of {questions.length}</span>
                <span className="badge badge-info">{currentQ.language}</span>
                <span className="badge badge-neutral">{currentQ.points} pts</span>
                {answerStatuses[currentQ.id] === 'CHECKED' && (
                  <span className="badge badge-info">Checked</span>
                )}
                {answerStatuses[currentQ.id] === 'SAVED' && Boolean(codes[currentQ.id] && codes[currentQ.id].trim() !== (currentQ.starter_code || '').trim()) && (
                  <span className="badge badge-success">Saved</span>
                )}
              </div>
              <h2 className="qpanel__title">{currentQ.title}</h2>
              <div
                className="qpanel__description markdown-body"
                dangerouslySetInnerHTML={{ __html: marked.parse(currentQ.description || '') as string }}
              />
            </div>

            {/* Right side: Monaco Code Editor & Actions */}
            <div className="qpanel__code-panel">
              <div className="qpanel__editor-area">
                <Editor
                  height="100%"
                  language={MONACO_LANGUAGE[currentQ.language] || 'c'}
                  value={codes[currentQ.id] ?? ''}
                  onChange={handleCodeChange}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    tabSize: 4,
                    lineNumbers: 'on',
                    folding: true,
                    readOnly: isSubmitted.current || contestExpired,
                    contextmenu: false, // disable Monaco's right-click menu
                  }}
                  theme="light"
                />
              </div>

              {/* Action bar */}
              <div className="qpanel__actions">
                <div className="qpanel__status-bar">
                  {saveStatus === 'saving' && <span>Saving...</span>}
                  {saveStatus === 'saved' && <span style={{ color: 'var(--color-success)' }}>● Code saved</span>}
                  {saveStatus === 'error' && <span style={{ color: 'var(--color-danger)' }}>● Save failed — retry</span>}
                  {checkResult && (
                    <span className={`eval-result ${checkResult.compilationError ? 'eval-result--compile-error' : 'eval-result--success'}`}>
                      {checkResult.compilationError ? 'Compiled with error' : 'Compiled without error'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  {currentIndex > 0 && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleQuestionChange(currentIndex - 1)}>
                      ← Prev
                    </button>
                  )}
                  {currentIndex < questions.length - 1 && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleQuestionChange(currentIndex + 1)}>
                      Next →
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={handleCheckCode}
                    disabled={checking || isSubmitted.current || contestExpired}
                    id="check-code-btn"
                  >
                    {checking ? 'Checking...' : 'Check Code'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- SUBMIT MODAL ---- */}
      {showSubmitModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="submit-modal-title">
          <div className="modal">
            <h2 className="modal__title" id="submit-modal-title">Submit Contest?</h2>
            <div className="modal__body">
              <p>You cannot make any changes after submission.</p>
              <p style={{ marginTop: 'var(--space-3)' }}>
                <strong>Answered:</strong> {answeredCount} / {questions.length}
              </p>
              <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>
                This action cannot be undone.
              </p>
            </div>
            <div className="modal__actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleSubmitConfirm}
                disabled={submitting}
                id="confirm-submit-btn"
              >
                {submitting ? 'Submitting...' : 'Submit Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- SECURITY WARNING ---- */}
      {securityWarning && (
        <div className="security-overlay" role="alertdialog" aria-live="assertive">
          <div className={`security-modal ${securityWarning.autoSubmitted ? '' : 'security-modal--warning'}`}>
            <div className="security-modal__icon">
              {securityWarning.autoSubmitted ? '🔴' : '⚠️'}
            </div>
            <h2 className="security-modal__title">
              {securityWarning.autoSubmitted ? 'Contest Auto-Submitted' : 'Security Warning'}
            </h2>
            <div className="security-modal__count">
              {securityWarning.autoSubmitted ? 'SUBMITTED' : `${securityWarning.count} / 3`}
            </div>
            <p className="security-modal__message">
              {securityWarning.message}
            </p>
            {!securityWarning.autoSubmitted && (
              <button
                className="btn btn-primary"
                onClick={() => setSecurityWarning(null)}
                id="dismiss-warning-btn"
              >
                Return to Contest
              </button>
            )}
            {securityWarning.autoSubmitted && (
              <p className="text-sm text-muted">Redirecting to home page...</p>
            )}
          </div>
        </div>
      )}

      {/* ---- EXPIRED BANNER ---- */}
      {contestExpired && !securityWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: 'var(--color-danger)',
          color: '#fff',
          padding: 'var(--space-4)',
          textAlign: 'center',
          zIndex: 999,
          fontWeight: 600,
        }}>
          Contest time has expired. Your work is being saved and submitted automatically.
        </div>
      )}

      {/* ---- FULLSCREEN BLOCKED WARNING ---- */}
      {fullscreenBlocked && !document.fullscreenElement && (
        <div className="alert alert-warning" style={{
          position: 'fixed',
          bottom: 'var(--space-4)',
          right: 'var(--space-4)',
          zIndex: 200,
          maxWidth: '400px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          border: '1px solid #ffe083',
          borderRadius: 'var(--radius)',
        }}>
          <div style={{ flex: 1, fontSize: 'var(--font-size-xs)', lineHeight: 1.4 }}>
            ⚠️ <strong>Fullscreen exited.</strong> Please remain in fullscreen during the test.
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen()
                  .then(() => setFullscreenBlocked(false))
                  .catch(() => {});
              }
            }}
            style={{ whiteSpace: 'nowrap', padding: '4px 8px', fontSize: '11px' }}
          >
            Re-enter
          </button>
          <button
            onClick={() => setFullscreenBlocked(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '15px',
              color: 'var(--color-text-muted)',
              padding: '2px 6px',
            }}
            title="Dismiss warning"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
