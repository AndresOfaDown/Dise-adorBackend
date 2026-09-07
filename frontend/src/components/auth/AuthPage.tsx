import React, { useState } from 'react';
import { UmlShowcase } from './UmlShowcase';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

export const AuthPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  return (
    <div className="auth-page-root">
      {/* Background ambient lighting */}
      <div className="ambient-glow glow-indigo"></div>
      <div className="ambient-glow glow-cyan"></div>

      {/* Top Navbar */}
      <header className="auth-top-nav">
        <div className="nav-brand">
          <div className="brand-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth="2" stroke="#818cf8" fill="rgba(129, 140, 248, 0.15)" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth="2" stroke="#06b6d4" fill="rgba(6, 182, 212, 0.15)" />
              <path d="M10 6.5h7a1.5 1.5 0 011.5 1.5V14" strokeWidth="1.5" stroke="#94a3b8" strokeDasharray="2 2" />
            </svg>
          </div>
          <div className="brand-titles">
            <span className="brand-name">UML<span className="brand-highlight">Craft</span></span>
            <span className="brand-version">v1.0</span>
          </div>
        </div>

        <div className="nav-actions">
          <span className="nav-status-indicator">
            <span className="status-dot"></span>
            Backend API Online
          </span>
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="auth-main-container">
        {/* Left Side: UML Presentation Showcase */}
        <section className="auth-showcase-section">
          <UmlShowcase />
        </section>

        {/* Right Side: Auth Form with Glassmorphism */}
        <section className="auth-card-section">
          <div className="auth-card-glass">
            {/* Tab Navigation Pill */}
            <div className="auth-tabs-pill">
              <button
                type="button"
                className={`tab-pill-btn ${activeTab === 'login' ? 'active' : ''}`}
                onClick={() => setActiveTab('login')}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span>Iniciar Sesión</span>
              </button>
              <button
                type="button"
                className={`tab-pill-btn ${activeTab === 'register' ? 'active' : ''}`}
                onClick={() => setActiveTab('register')}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span>Registrarse</span>
              </button>
            </div>

            {/* Forms */}
            <div className="form-content-area">
              {activeTab === 'login' ? (
                <LoginForm onSwitchToRegister={() => setActiveTab('register')} />
              ) : (
                <RegisterForm onSwitchToLogin={() => setActiveTab('login')} />
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="auth-footer">
        <p>© 2026 UMLCraft Studio - Diseñador de Diagramas de Clases Orientado a Objetos</p>
      </footer>
    </div>
  );
};
