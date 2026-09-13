# Security Design and Limitations

## Debugging Contest Platform — Security Documentation

This document describes the security mechanisms implemented, their technical basis, and their honest limitations.

---

## 1. Authentication Security

### Implementation
- Passwords hashed with **bcrypt** (cost factor 12) — resistant to brute force
- Never store plaintext passwords
- JWT tokens stored in **HTTP-only, SameSite=Strict cookies** — not accessible via JavaScript
- Token expiry: 8 hours for contestants, 12 hours for admins
- Login rate-limited: 20 attempts per 15 minutes per IP
- Distinct cookie names for contestant (`token`) and admin (`adminToken`) — no privilege escalation

### Limitations
- JWTs are not revocable before expiry without a token blacklist (not implemented for simplicity — log out invalidates client cookie but doesn't block the token server-side)

---

## 2. One-Attempt Enforcement

### Implementation
- Database-level **UNIQUE(contest_id, contestant_id)** constraint
- Server enforces this on every `POST /api/contest/start` and `POST /api/contest/submit`
- Statuses: NOT_STARTED → IN_PROGRESS → SUBMITTED / AUTO_SUBMITTED
- Once SUBMITTED or AUTO_SUBMITTED, any start request returns 409
- No frontend state can override this — enforced purely in PostgreSQL

### Limitations
- Race conditions handled via database unique constraints and atomic updates

---

## 3. Tab Switching Detection

### Implementation
- Monitors `document.visibilitychange` event
- Monitors `window.blur` event
- **Debouncing**: Same violation type within 3 seconds is ignored (server-side) to prevent double-counting
- Each genuine violation increments `attempts.violation_count`
- At 4th violation (> 3 max), `autoSubmitAttempt()` is triggered server-side
- All violations stored in `violations` table with timestamp

### Limitations
- `blur` events do not trigger for every possible focus loss scenario (e.g., OS-level task switcher in some configurations)
- Some browser/OS combinations may not fire visibility events reliably
- Opening a new window in the same browser profile may not always fire blur
- Cannot detect switching to another physical monitor

---

## 4. Fullscreen Detection

### Implementation
- Requests `document.documentElement.requestFullscreen()` before contest start
- Monitors `fullscreenchange` event
- On exit: logs `FULLSCREEN_EXIT` violation, attempts to re-request fullscreen
- If re-request fails: shows warning to user to manually use F11

### Limitations
- **JavaScript cannot force fullscreen against the user's will** — browsers restrict this for UX/security reasons
- F11 or Esc can exit fullscreen at any time; we detect this but cannot prevent it
- Some browsers (e.g., Firefox in certain modes) may not support the Fullscreen API

---

## 5. Clipboard Restrictions

### Implementation
- `copy`, `cut`, `paste` events are intercepted and prevented on document level
- `contextmenu` (right-click) is blocked on the document
- `dragstart`, `selectstart` are blocked outside the Monaco editor
- Editor interactions are **not blocked** — only events outside the editor container
- Blocked events are logged as security events

### Limitations
- A sophisticated user can use browser extensions that inject clipboard functionality
- OS-level clipboard tools operate completely outside the browser's event system
- These restrictions are a deterrent and audit trail, not cryptographic enforcement

---

## 6. Keyboard Shortcut Blocking

### Blocked shortcuts
| Shortcut | Action |
|---|---|
| F12 | DevTools — blocked + logged |
| Ctrl+Shift+I | DevTools — blocked + logged |
| Ctrl+Shift+J | DevTools Console — blocked + logged |
| Ctrl+Shift+C | DevTools Inspector — blocked + logged |
| Ctrl+U | View Source — blocked + logged |
| Ctrl+P | Print — blocked + logged |
| Ctrl+S | Save (no-op) — blocked |
| PrintScreen | Screenshot attempt — blocked (browser key event only) + logged |

### Limitations
- `keydown` interception in JavaScript only affects browser-received events
- **OS-level** shortcuts (e.g., Win+PrintScreen on Windows, Cmd+Shift+4 on macOS) cannot be intercepted by any web page
- DevTools opened via the browser menu is not detectable
- Chrome's `--disable-extensions` flag cannot be set by a web page

---

## 7. Screenshot Limitations

**A web application cannot prevent screenshots.** We do not claim otherwise.

What we do:
- Log `PrintScreen` key press attempts when the browser exposes the event
- This creates an audit trail

What we cannot do:
- Prevent OS-level screenshot tools
- Prevent phone camera photos of the screen
- Prevent external screen capture software

**Recommendation**: Physical invigilation + controlled lab environment

---

## 8. AI Extension Detection

**We do not claim to detect all AI browser extensions.**

Common AI extensions (Monica, Copilot, ChatGPT, Gemini) operate at the browser extension level, which has privileged access beyond what page JavaScript can observe.

What we implement:
- Clipboard copy/paste blocking (reduces easy prompt extraction)
- Text selection blocking outside the editor (harder to copy question text)
- Security event logging for suspicious focus changes

What we cannot detect:
- Extensions that read page content via the Chrome Extension API
- Screenshot-based AI tools
- Screen reader-based AI extraction

**Recommendation**: Use a dedicated browser profile with extensions disabled. Chrome's `--disable-extensions` flag is the most reliable approach for controlled environments.

---

## 9. Code Execution Sandbox

### Implementation
- Contestant code is **never executed on the main API server**
- All execution is delegated to **Judge0 CE** — an isolated sandbox
- Judge0 applies:
  - CPU time limit: 5 seconds
  - Wall time limit: 10 seconds
  - Memory limit: 128 MB
  - Network: disabled
  - Filesystem: isolated container
  - Non-root execution

### Hidden Test Cases
- Test case input/output is stored in the database as server-side data only
- The API **never sends test case data to the frontend**
- The contestant sees only: "Compilation successful", "Compilation failed", or "Hidden tests failed/passed"
- No partial output, no expected output, no input values are exposed

---

## 10. Server-Side Enforcement (Anti-Tampering)

The server is the **single source of truth** for:

| Data | Enforcement |
|---|---|
| Contest start time | Set by server at `POST /contest/language` |
| Contest expiry | `expires_at = started_at + duration_minutes` (server-calculated) |
| Score | Calculated server-side from judge results |
| Violation count | Stored and incremented server-side |
| Language | Set once; changing it via API returns 409 |
| Submission status | PostgreSQL status + UNIQUE constraint |
| Attempt ownership | Every API verifies `contestant_id = token.sub` |

The frontend timer is **display only** and has no authority. Server expiry is verified on every heartbeat and API call.

---

## 11. Recommendations for Production Deployment

For a real examination:

1. **Controlled lab**: Use dedicated computers, not personal devices
2. **Disable extensions**: Use `google-chrome --disable-extensions` or similar
3. **Lock browser**: Use Chrome's Managed Session or Kiosk mode
4. **Network control**: Block external sites at the network/router level
5. **Invigilation**: Physical supervision is the most effective deterrent
6. **No personal phones**: Collect phones before the exam
7. **HTTPS**: Deploy with valid TLS certificates
8. **Change default passwords**: Replace seed credentials before any real contest
9. **Rotate JWT_SECRET**: Use a strong, randomly generated secret in production
10. **Database backups**: Take snapshots before the contest starts
