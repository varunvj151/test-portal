import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import RulesPage from './pages/RulesPage';
import LanguageSelectionPage from './pages/LanguageSelectionPage';
import ContestPage from './pages/ContestPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  return (
    <>
      {/* Mobile block overlay */}
      <div className="mobile-block">
        <div style={{ fontSize: '2rem' }}>🖥️</div>
        <h2>Desktop Required</h2>
        <p className="text-muted">
          This contest requires a desktop or laptop screen.<br />
          Please use a computer to participate.
        </p>
      </div>

      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/language" element={<LanguageSelectionPage />} />
          <Route path="/contest" element={<ContestPage />} />
          <Route path="/admin" element={<AdminLoginPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
