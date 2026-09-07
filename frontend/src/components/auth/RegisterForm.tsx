import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    nombre: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(true);

  const setAuth = useAuthStore((state) => state.setAuth);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim() || !formData.username.trim() || !formData.email.trim() || !formData.password) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (!acceptTerms) {
      toast.error('Debes aceptar los términos de uso');
      return;
    }

    try {
      setLoading(true);
      const data = await authApi.register({
        nombre: formData.nombre.trim(),
        username: formData.username.trim().toLowerCase(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      setAuth(data.user, data.token);
      toast.success(`¡Cuenta creada con éxito! Bienvenido, ${data.user.nombre}`);
    } catch (err: any) {
      const responseData = err?.response?.data;
      if (responseData) {
        if (responseData.email) {
          toast.error(responseData.email[0] || 'Error con el correo');
        } else if (responseData.username) {
          toast.error(responseData.username[0] || 'Error con el nombre de usuario');
        } else if (responseData.password) {
          toast.error(responseData.password[0] || 'Error con la contraseña');
        } else {
          toast.error('Error al registrar usuario. Verifica los datos.');
        }
      } else {
        toast.error('No se pudo conectar con el servidor. Revisa si el backend está activo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <h2 className="form-title">Crear Cuenta</h2>
        <p className="form-subtitle">Comienza a modelar diagramas de clases profesionales</p>
      </div>

      <div className="form-grid-two">
        <div className="input-group">
          <label className="input-label" htmlFor="register-nombre">
            Nombre Completo
          </label>
          <div className="input-field-wrapper">
            <span className="input-icon">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <input
              id="register-nombre"
              name="nombre"
              type="text"
              className="form-input"
              placeholder="Juan Pérez"
              value={formData.nombre}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="register-username">
            Usuario
          </label>
          <div className="input-field-wrapper">
            <span className="input-icon">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </span>
            <input
              id="register-username"
              name="username"
              type="text"
              className="form-input"
              placeholder="juanperez"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>
        </div>
      </div>

      <div className="input-group">
        <label className="input-label" htmlFor="register-email">
          Correo Electrónico
        </label>
        <div className="input-field-wrapper">
          <span className="input-icon">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
            </svg>
          </span>
          <input
            id="register-email"
            name="email"
            type="email"
            className="form-input"
            placeholder="juan@ejemplo.com"
            value={formData.email}
            onChange={handleChange}
            required
            autoComplete="email"
          />
        </div>
      </div>

      <div className="form-grid-two">
        <div className="input-group">
          <label className="input-label" htmlFor="register-password">
            Contraseña
          </label>
          <div className="input-field-wrapper">
            <span className="input-icon">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <input
              id="register-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Min. 6 carac."
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="toggle-password-btn"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Ocultar' : 'Ver'}
            >
              {showPassword ? (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="register-confirm-password">
            Confirmar Contraseña
          </label>
          <div className="input-field-wrapper">
            <span className="input-icon">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </span>
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Repite la contraseña"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
            />
          </div>
        </div>
      </div>

      <div className="remember-row">
        <label className="checkbox-container">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
          />
          <span className="checkbox-custom"></span>
          <span className="checkbox-label">
            Acepto los términos de servicio y la política de privacidad
          </span>
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
            Creando tu cuenta...
          </span>
        ) : (
          <span className="btn-text">
            <span>Crear Cuenta & Comenzar</span>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </span>
        )}
      </button>

      <div className="form-footer">
        <span>¿Ya tienes una cuenta?</span>{' '}
        <button type="button" className="switch-auth-link" onClick={onSwitchToLogin}>
          Inicia sesión aquí
        </button>
      </div>
    </form>
  );
};
