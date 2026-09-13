import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useDiagramStore } from '../../store/diagramStore';
import { useNavigationStore } from '../../store/navigationStore';

interface EditorHeaderProps {
  isAiPanelOpen?: boolean;
  onToggleAiPanel?: () => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({ isAiPanelOpen, onToggleAiPanel }) => {
  const {
    projectName,
    setProjectName,
    saveCurrentDiagram,
    isSaving,
    collaborators,
    isSocketConnected,
  } = useDiagramStore();
  const { activeProjectId, navigateToDashboard, navigateToProjects } = useNavigationStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(projectName);

  // Copiar enlace directo para colaborar en este proyecto
  const handleShareLink = () => {
    const url = new URL(window.location.href);
    if (activeProjectId) {
      url.searchParams.set('project', String(activeProjectId));
    }
    navigator.clipboard.writeText(url.toString());
    toast.success('¡Enlace de colaboración copiado! Compártelo con otro usuario.');
  };

  React.useEffect(() => {
    setTempName(projectName);
  }, [projectName]);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (tempName.trim()) {
      setProjectName(tempName.trim());
    } else {
      setTempName(projectName);
    }
  };

  const handleSave = async () => {
    try {
      await saveCurrentDiagram();
      toast.success(`¡Proyecto "${projectName}" guardado exitosamente!`);
    } catch (error) {
      toast.error('Error al guardar el diagrama');
    }
  };

  return (
    <header className="editor-top-bar">
      {/* Botón Volver y Marca */}
      <div className="editor-bar-left">
        <button
          type="button"
          className="editor-back-btn"
          onClick={navigateToProjects}
          title="Volver a la lista de proyectos"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Proyectos</span>
        </button>

        <button
          type="button"
          className="editor-back-btn dashboard-btn-subtle"
          onClick={navigateToDashboard}
          title="Ir al inicio / Dashboard"
        >
          Dashboard
        </button>

        <div className="editor-brand-divider"></div>

        {/* Nombre del Proyecto / Package Base editable */}
        <div className="editor-project-title-area">
          <span className="project-label">Proyecto:</span>
          {isEditingName ? (
            <input
              type="text"
              className="project-name-input"
              value={tempName}
              autoFocus
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleNameBlur()}
            />
          ) : (
            <div
              className="project-name-display"
              onClick={() => {
                setTempName(projectName);
                setIsEditingName(true);
              }}
              title="Clic para renombrar el paquete del proyecto"
            >
              <span className="project-name-text">{projectName}</span>
              <span className="edit-pencil-icon">✎</span>
            </div>
          )}
        </div>
      </div>

      {/* Derecha: Botones de Acción y Colaboración en Vivo */}
      <div className="editor-bar-right">
        {/* Sección de Colaboradores en Tiempo Real */}
        <div className="editor-collab-section">
          <div
            className={`editor-live-badge ${isSocketConnected ? 'connected' : 'disconnected'}`}
            title={isSocketConnected ? 'Conectado a la sala en tiempo real' : 'Conectando al servidor...'}
          >
            <span className="live-dot"></span>
            <span className="live-text">{isSocketConnected ? 'En vivo' : 'Conectando...'}</span>
          </div>

          {/* Pila de Avatares de Colaboradores */}
          {collaborators.length > 0 && (
            <div
              className="collaborators-avatar-stack"
              title={`${collaborators.length} usuario(s) editando en esta sala`}
            >
              {collaborators.map((c, i) => {
                const initials = (c.username || 'C').slice(0, 2).toUpperCase();
                return (
                  <div
                    key={c.clientId || i}
                    className="collab-avatar"
                    style={{ backgroundColor: c.color || '#3b82f6' }}
                    title={`${c.username} (en línea)`}
                  >
                    {initials}
                  </div>
                );
              })}
            </div>
          )}

          {/* Botón Compartir Enlace */}
          <button
            type="button"
            className="editor-share-btn"
            onClick={handleShareLink}
            title="Copiar enlace para colaborar en este diagrama"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <span>Compartir</span>
          </button>
        </div>

        <div className="editor-brand-divider"></div>

        {/* Botón Asistente IA - CU05 */}
        <button
          type="button"
          className={`editor-ai-btn ${isAiPanelOpen ? 'active' : ''}`}
          onClick={onToggleAiPanel}
          title="Abrir asistente de modelado IA (voz y texto)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2H10a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
            <line x1="10" y1="22" x2="14" y2="22" />
          </svg>
          <span>Asistente IA</span>
        </button>

        <div className="editor-brand-divider"></div>

        {/* Botón Guardar Diagrama (Manual) */}
        <button
          type="button"
          className={`editor-save-btn ${isSaving ? 'saving' : ''}`}
          onClick={handleSave}
          disabled={isSaving}
          title="Guardar manualmente ahora"
        >
          {isSaving ? (
            <>
              <span className="spinner-small"></span>
              <span>Guardando...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span>Guardar</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};


