import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useNavigationStore } from '../../store/navigationStore';
import { projectsApi, type Proyecto } from '../../api/projects';

export const ProjectsListPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { navigateToDashboard, navigateToEditor } = useNavigationStore();

  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Estados de Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingProject, setEditingProject] = useState<Proyecto | null>(null);
  const [editName, setEditName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deletingProject, setDeletingProject] = useState<Proyecto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cargar lista de proyectos
  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const data = await projectsApi.list();
      setProjects(data);
    } catch (err) {
      toast.error('Error al cargar la lista de proyectos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Crear proyecto con nombre personalizado
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      toast.error('Por favor ingresa un nombre para el proyecto');
      return;
    }

    try {
      setIsCreating(true);
      const res = await projectsApi.create(trimmed);
      toast.success(`Proyecto "${trimmed}" creado con éxito`);
      setIsCreateModalOpen(false);
      setNewProjectName('');
      // Abrir inmediatamente el diseñador para este nuevo proyecto
      navigateToEditor(res.proyecto.id);
    } catch (err) {
      toast.error('Error al crear el proyecto');
    } finally {
      setIsCreating(false);
    }
  };

  // Renombrar proyecto
  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error('El nombre no puede estar vacío');
      return;
    }

    try {
      setIsSavingEdit(true);
      const updated = await projectsApi.update(editingProject.id, trimmed);
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, package_base: updated.package_base } : p))
      );
      toast.success('Nombre del proyecto actualizado');
      setEditingProject(null);
    } catch (err) {
      toast.error('Error al renombrar el proyecto');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Eliminar proyecto
  const handleConfirmDelete = async () => {
    if (!deletingProject) return;

    try {
      setIsDeleting(true);
      await projectsApi.delete(deletingProject.id);
      setProjects((prev) => prev.filter((p) => p.id !== deletingProject.id));
      toast.success('Proyecto eliminado correctamente');
      setDeletingProject(null);
    } catch (err) {
      toast.error('Error al eliminar el proyecto');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.package_base.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="projects-page-container">
      {/* Top Header */}
      <header className="dashboard-header">
        <div className="dash-brand">
          <button
            type="button"
            className="editor-back-btn"
            onClick={navigateToDashboard}
            title="Volver al panel principal"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Dashboard</span>
          </button>
          <div className="editor-brand-divider"></div>
          <span className="brand-name">Gestión de Proyectos (CU01)</span>
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
          <button className="logout-btn" onClick={logout} title="Cerrar sesión">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="projects-page-main">
        <div className="projects-hero-bar">
          <div>
            <span className="projects-hero-tag">CU01: Gestionar Proyecto</span>
            <h1 className="projects-hero-title">Mis Proyectos de Diseño de Software</h1>
            <p className="projects-hero-desc">
              Crea nuevos proyectos con nombres personalizados, explora tus modelos UML guardados, renómbralos y continúa diseñando en cualquier momento.
            </p>
          </div>

          <button
            type="button"
            className="btn-create-project-primary"
            onClick={() => {
              setNewProjectName(`Sistema_${projects.length + 1}`);
              setIsCreateModalOpen(true);
            }}
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Crear Nuevo Proyecto</span>
          </button>
        </div>

        {/* Barra de Filtro y Búsqueda */}
        <div className="projects-filter-bar">
          <div className="search-input-wrapper">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#64748b">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar proyecto por nombre o package..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="projects-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
              >
                ×
              </button>
            )}
          </div>

          <div className="projects-count-badge">
            Total: <strong>{filteredProjects.length}</strong> {filteredProjects.length === 1 ? 'proyecto' : 'proyectos'}
          </div>
        </div>

        {/* Lista o Grid de Proyectos */}
        {isLoading ? (
          <div className="projects-loading-state">
            <div className="spinner-large"></div>
            <p>Cargando tus proyectos desde PostgreSQL...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="projects-empty-state">
            <div className="empty-icon-box">📁</div>
            {searchQuery ? (
              <>
                <h3>No se encontraron proyectos para "{searchQuery}"</h3>
                <p>Intenta con otro término de búsqueda o limpia el filtro.</p>
                <button
                  type="button"
                  className="card-action-btn"
                  onClick={() => setSearchQuery('')}
                >
                  Limpiar búsqueda
                </button>
              </>
            ) : (
              <>
                <h3>No tienes ningún proyecto creado todavía</h3>
                <p>Crea tu primer proyecto de software para comenzar a modelar diagramas de clases UML.</p>
                <button
                  type="button"
                  className="btn-create-project-primary"
                  onClick={() => {
                    setNewProjectName('SistemaGestion');
                    setIsCreateModalOpen(true);
                  }}
                >
                  + Crear Mi Primer Proyecto
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="projects-cards-grid">
            {filteredProjects.map((project) => (
              <div key={project.id} className="project-management-card">
                <div className="proj-card-top">
                  <div className="proj-card-icon">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth="2" stroke="#2563eb" fill="#eff6ff" />
                      <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth="2" stroke="#06b6d4" fill="#ecfeff" />
                      <path d="M10 6.5h7a1.5 1.5 0 011.5 1.5V14" strokeWidth="1.5" stroke="#64748b" strokeDasharray="2 2" />
                    </svg>
                  </div>

                  <div className="proj-card-info">
                    <div className="proj-card-title-row">
                      <h3
                        className="proj-card-name"
                        title={project.package_base}
                        onClick={() => navigateToEditor(project.id)}
                      >
                        {project.package_base}
                      </h3>
                      <button
                        type="button"
                        className="proj-rename-quick-btn"
                        title="Renombrar proyecto"
                        onClick={() => {
                          setEditingProject(project);
                          setEditName(project.package_base);
                        }}
                      >
                        ✎
                      </button>
                    </div>

                    <div className="proj-card-dates">
                      <span>ID: #{project.id}</span>
                      <span>•</span>
                      <span>
                        Modificado:{' '}
                        {project.last_edited_at
                          ? new Date(project.last_edited_at).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Reciente'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="proj-card-actions">
                  <button
                    type="button"
                    className="btn-proj-action-primary"
                    onClick={() => navigateToEditor(project.id)}
                    title="Abrir diagrama de clases en el editor"
                  >
                    <span>Diseñar</span>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="btn-proj-action-secondary"
                    onClick={() => {
                      setEditingProject(project);
                      setEditName(project.package_base);
                    }}
                    title="Cambiar el nombre del proyecto"
                  >
                    Renombrar
                  </button>

                  <button
                    type="button"
                    className="btn-proj-action-danger"
                    onClick={() => setDeletingProject(project)}
                    title="Eliminar este proyecto"
                  >
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal: Crear Nuevo Proyecto */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => !isCreating && setIsCreateModalOpen(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-icon-title">
                <span className="modal-icon-badge">✨</span>
                <h2>Crear Nuevo Proyecto</h2>
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

            <form onSubmit={handleCreateProject}>
              <div className="modal-body">
                <p className="modal-description">
                  Ingresa el nombre o paquete base que deseas para tu nuevo proyecto de diseño de software (ej. <code>SistemaClinico</code> o <code>com.empresa.ventas</code>).
                </p>

                <div className="form-group-modal">
                  <label htmlFor="projectNameInput">Nombre del Proyecto / Package Base:</label>
                  <input
                    id="projectNameInput"
                    type="text"
                    className="modal-text-input"
                    value={newProjectName}
                    autoFocus
                    placeholder="ej: SistemaVentas o com.empresa.crm"
                    onChange={(e) => setNewProjectName(e.target.value)}
                    disabled={isCreating}
                  />
                  <span className="input-field-hint">Podrás renombrarlo en cualquier momento desde esta lista o dentro del diseñador.</span>
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
                  disabled={isCreating || !newProjectName.trim()}
                >
                  {isCreating ? 'Creando proyecto...' : 'Crear y Abrir Diseñador →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Renombrar Proyecto */}
      {editingProject && (
        <div className="modal-overlay" onClick={() => !isSavingEdit && setEditingProject(null)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-icon-title">
                <span className="modal-icon-badge">✎</span>
                <h2>Renombrar Proyecto</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingProject(null)}
                disabled={isSavingEdit}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveRename}>
              <div className="modal-body">
                <p className="modal-description">
                  Cambia el nombre o package base del proyecto <strong>#{editingProject.id}</strong>.
                </p>

                <div className="form-group-modal">
                  <label htmlFor="editProjectNameInput">Nuevo Nombre:</label>
                  <input
                    id="editProjectNameInput"
                    type="text"
                    className="modal-text-input"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={isSavingEdit}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setEditingProject(null)}
                  disabled={isSavingEdit}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-modal-confirm"
                  disabled={isSavingEdit || !editName.trim()}
                >
                  {isSavingEdit ? 'Guardando...' : 'Guardar Nuevo Nombre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación de Proyecto */}
      {deletingProject && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeletingProject(null)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-icon-title">
                <span className="modal-icon-badge danger">🗑</span>
                <h2>Eliminar Proyecto</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeletingProject(null)}
                disabled={isDeleting}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">
                ¿Estás seguro de que deseas eliminar el proyecto <strong>"{deletingProject.package_base}"</strong>?
              </p>
              <div className="alert-danger-box">
                Esta acción es permanente y eliminará todas las clases UML, entidades y relaciones asociadas en la base de datos PostgreSQL.
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setDeletingProject(null)}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-modal-danger-confirm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Eliminando...' : 'Sí, Eliminar Proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
