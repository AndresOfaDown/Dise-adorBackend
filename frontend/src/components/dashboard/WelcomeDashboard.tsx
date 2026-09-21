import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useNavigationStore } from '../../store/navigationStore';
import { projectsApi, type Proyecto } from '../../api/projects';
import { JoinProjectModal } from '../editor/modals/JoinProjectModal';

export const WelcomeDashboard: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { navigateToEditor, navigateToProjects } = useNavigationStore();

  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [customProjectName, setCustomProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    projectsApi
      .list()
      .then(setProjects)
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    logout();
    toast.success('Sesión cerrada correctamente');
  };

  const handleCreateDiagram = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customProjectName.trim();
    if (!trimmed) {
      toast.error('Por favor escribe un nombre para el proyecto');
      return;
    }

    try {
      setIsCreating(true);
      const res = await projectsApi.create(trimmed);
      toast.success(`¡Proyecto "${trimmed}" creado con éxito!`);
      setIsCreateModalOpen(false);
      setCustomProjectName('');
      navigateToEditor(res.proyecto.id);
    } catch (err) {
      toast.error('Error al crear el nuevo diagrama');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Top Bar */}
      <header className="dashboard-header">
        <div className="dash-brand">
          <div className="brand-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth="2" stroke="#818cf8" fill="rgba(129, 140, 248, 0.15)" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth="2" stroke="#06b6d4" fill="rgba(6, 182, 212, 0.15)" />
              <path d="M10 6.5h7a1.5 1.5 0 011.5 1.5V14" strokeWidth="1.5" stroke="#94a3b8" strokeDasharray="2 2" />
            </svg>
          </div>
          <span className="brand-name">UML</span>
        </div>

        <div className="dash-user-bar">
          <div className="user-profile-badge">
            <div className="avatar-circle">
              {user?.nombre ? user.nombre.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="user-info-text">
              <span className="user-name">{user?.nombre || user?.username}</span>
              <span className="user-email">{user?.email}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="dashboard-main">
        <div className="welcome-banner">
          <div className="banner-content">
            <span className="banner-tag">¡Sesión iniciada con éxito!</span>
            <h1>Hola, <span className="gradient-text">{user?.nombre || user?.username}</span></h1>
            <p>Tu cuenta única de diseñador está lista. Desde aquí podrás crear y administrar tus diagramas de clases UML.</p>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Tarjeta: Crear Nuevo Diagrama */}
          <div className="dash-card highlighted-dash-card">
            <div className="card-icon-box cyan">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3>Crear Nuevo Diagrama</h3>
            <p>Inicia un lienzo en blanco para diseñar entidades, atributos y relaciones UML con el nombre que elijas.</p>
            <button
              className="card-action-btn primary"
              onClick={() => {
                setCustomProjectName(`Nombre del proyecto`);
                setIsCreateModalOpen(true);
              }}
            >
              Nuevo Diagrama →
            </button>
          </div>

          {/* Tarjeta: Mis Proyectos */}
          <div className="dash-card">
            <div className="card-icon-box indigo">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h3>Mis Proyectos ({projects.length})</h3>
            <p>Explora, renombra, edita y administra todos tus proyectos en PostgreSQL.</p>
            <button
              className="card-action-btn"
              onClick={navigateToProjects}
            >
              Explorar Proyectos →
            </button>
          </div>

          {/* Tarjeta: Unirse a Proyecto Compartido */}
          <div className="dash-card">
            <div className="card-icon-box" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3>Unirse a Proyecto</h3>
            <p>Ingresa el código o ID de sala compartido por otro compañero para colaborar en tiempo real.</p>
            <button
              type="button"
              className="card-action-btn"
              style={{ backgroundColor: '#16a34a', color: '#ffffff', borderColor: '#16a34a' }}
              onClick={() => setIsJoinModalOpen(true)}
            >
              Unirse con Código →
            </button>
          </div>
        </div>

        {/* Modal: Unirse a Proyecto */}
        <JoinProjectModal
          isOpen={isJoinModalOpen}
          onClose={() => setIsJoinModalOpen(false)}
        />


        {/* Modal: Crear Nuevo Proyecto con Nombre Personalizado */}
        {isCreateModalOpen && (
          <div className="modal-overlay" onClick={() => !isCreating && setIsCreateModalOpen(false)}>
            <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-header-icon-title">
                  <span className="modal-icon-badge">✨</span>
                  <h2>Nombre del Nuevo Proyecto</h2>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isCreating}
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleCreateDiagram}>
                <div className="modal-body">
                  <p className="modal-description">
                    Escribe el nombre o paquete base que deseas para este proyecto (ej. <code>SistemaVentas</code>, <code>com.empresa.crm</code>).
                  </p>

                  <div className="form-group-modal">
                    <label htmlFor="customProjectInput">Nombre del Proyecto:</label>
                    <input
                      id="customProjectInput"
                      type="text"
                      className="modal-text-input"
                      value={customProjectName}
                      autoFocus
                      placeholder="ej: MiProyectoUML"
                      onChange={(e) => setCustomProjectName(e.target.value)}
                      disabled={isCreating}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    onClick={() => setIsCreateModalOpen(false)}
                    disabled={isCreating}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-modal-confirm"
                    disabled={isCreating || !customProjectName.trim()}
                  >
                    {isCreating ? 'Creando lienzo...' : 'Crear y Abrir Diseñador →'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
