import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Send cookies
  timeout: 30000,
});

// Response interceptor — normalize errors
api.interceptors.response.use(
  response => response,
  error => {
    const message =
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

// ============================================================
// Auth
// ============================================================

export const authApi = {
  login: (registration_number: string, password: string) =>
    api.post('/auth/login', { registration_number, password }),

  logout: () => api.post('/auth/logout'),

  me: () => api.get('/auth/me'),

  adminLogin: (username: string, password: string) =>
    api.post('/admin/login', { username, password }),

  adminLogout: () => api.post('/admin/logout'),
};

// ============================================================
// Contest
// ============================================================

export const contestApi = {
  getContest: () => api.get('/contest'),

  startContest: () => api.post('/contest/start'),

  setLanguage: (attempt_id: string, language: string) =>
    api.post('/contest/language', { attempt_id, language }),

  heartbeat: (attempt_id: string) =>
    api.post('/contest/heartbeat', { attempt_id }),

  getAttempt: () => api.get('/contest/attempt'),

  submit: (attempt_id: string) =>
    api.post('/contest/submit', { attempt_id }),
};

// ============================================================
// Questions
// ============================================================

export const questionApi = {
  getQuestions: (attempt_id: string) =>
    api.get('/contest/questions', { params: { attempt_id } }),

  getQuestion: (question_id: string, attempt_id: string) =>
    api.get(`/contest/questions/${question_id}`, { params: { attempt_id } }),
};

// ============================================================
// Answers
// ============================================================

export const answerApi = {
  saveCode: (question_id: string, attempt_id: string, code: string) =>
    api.post(`/contest/questions/${question_id}/save`, { attempt_id, code })
      .catch(() => api.put(`/contest/questions/${question_id}/code`, { attempt_id, code })),

  checkCode: (question_id: string, attempt_id: string, code: string) =>
    api.post(`/contest/questions/${question_id}/check`, { attempt_id, code }),
};

// ============================================================
// Security
// ============================================================

export const securityApi = {
  reportEvent: (
    attempt_id: string,
    event_type: string,
    question_id?: string,
    metadata?: Record<string, any>
  ) =>
    api.post('/contest/security-event', {
      attempt_id,
      event_type,
      question_id,
      metadata,
    }),
};

// ============================================================
// Admin
// ============================================================

export const adminApi = {
  getDashboard: () => api.get('/admin/dashboard'),
  getContestants: () => api.get('/admin/contestants'),
  addContestant: (data: any) => api.post('/admin/contestants', data),
  deleteContestant: (id: string) =>
    api.delete(`/admin/contestants/${encodeURIComponent(id)}`)
      .catch(() => api.post(`/admin/contestants/${encodeURIComponent(id)}/delete`)),
  resetContestantAttempt: (id: string) => api.post(`/admin/contestants/${id}/reset`),
  resetAttemptByRegNo: (registration_number: string) =>
    api.post('/admin/contestants/reset-by-regno', { registration_number }),
  bulkImport: (contestants: any[]) => api.post('/admin/contestants/bulk', { contestants }),
  toggleContestant: (id: string, is_active: boolean) =>
    api.patch(`/admin/contestants/${id}`, { is_active }),
  getAttempts: () => api.get('/admin/attempts'),
  getLeaderboard: () => api.get('/admin/leaderboard'),
  getViolations: () => api.get('/admin/violations'),
  getResults: () => api.get('/admin/results'),
  getQuestions: (contest_id?: string) =>
    api.get('/admin/questions', { params: { contest_id } }),
  createQuestion: (data: any) => api.post('/admin/questions', data),
  updateQuestion: (id: string, data: any) => api.put(`/admin/questions/${id}`, data),
  deleteQuestion: (id: string) => api.delete(`/admin/questions/${id}`),
};

export default api;
