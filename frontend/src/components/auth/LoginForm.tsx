import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      toast.error('Por favor ingresa tu correo y contraseña');
      return;
    }

    try {
      setLoading(true);
      const data = await authApi.login({ email: email.trim(), password });
      setAuth(data.user, data.token);
      toast.success(`¡Bienvenido de nuevo, ${data.user.nombre || data.user.username}!`);
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.non_field_errors?.[0] ||
        err?.response?.data?.detail ||
        'Error al iniciar sesión. Verifica tus credenciales.';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <h2 className="form-title">Iniciar Sesión</h2>
        <p className="form-subtitle">Ingresa a tu espacio de trabajo de diagramación UML</p>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="login-email">
          Correo Electrónico
        </label>
        <div className="input-field-wrapper">
          <span className="input-icon">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
            </svg>
          </span>
          <input
            id="login-email"
            type="email"
            className="form-input"
            placeholder="ejemplo@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
      </div>

      <div className="input-group">
        <div className="label-row">
          <label className="input-label" htmlFor="login-password">
            Contraseña
          </label>
          <a
            href="#recuperar"
            className="forgot-password-link"
            onClick={(e) => {
              e.preventDefault();
              toast('Función de recuperación en desarrollo', { icon: 'ℹ️' });
            }}
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
        <div className="input-field-wrapper">
          <span className="input-icon">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </span>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            className="form-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button
            type="button"
            className="toggle-password-btn"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
          >
            {showPassword ? (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
              </svg>
            ) : (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="remember-row">
        <label className="checkbox-container">
          <input type="checkbox" defaultChecked />
          <span className="checkbox-custom"></span>
          <span className="checkbox-label">Recordar mi sesión</span>
        </label>
      </div>

      <button
        type="submit"
        className={`auth-submit-btn ${loading ? 'btn-loading' : ''}`}
        disabled={loading}
      >
        {loading ? (
          <span className="btn-spinner-content">
            <span className="spinner"></span>
            Verificando credenciales...
          </span>
        ) : (
          <span className="btn-text">
            <span>Iniciar Sesión</span>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </span>
        )}
      </button>

      <div className="form-footer">
        <span>¿Aún no tienes una cuenta?</span>{' '}
        <button type="button" className="switch-auth-link" onClick={onSwitchToRegister}>
          Regístrate gratis
        </button>
      </div>
    </form>
  );
};
