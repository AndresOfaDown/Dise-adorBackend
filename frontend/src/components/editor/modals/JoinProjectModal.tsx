import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../api/client';
import { useNavigationStore } from '../../../store/navigationStore';
import { useDiagramStore } from '../../../store/diagramStore';

interface JoinProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinProjectModal: React.FC<JoinProjectModalProps> = ({ isOpen, onClose }) => {
  const [projectCode, setProjectCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const { navigateToEditor } = useNavigationStore();
  const { loadProjectDiagram } = useDiagramStore();

  if (!isOpen) return null;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = projectCode.trim();
    if (!clean) return;

    setIsJoining(true);
    try {
      const res = await apiClient.post('/api/projects/join/', {
        code: clean,
      });

      const projectId = res.data.proyecto?.id;
      toast.success(res.data.message || '¡Te has unido al proyecto exitosamente!');
      onClose();

      if (projectId) {
        navigateToEditor(projectId);
        await loadProjectDiagram(projectId);
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'No se pudo unir al proyecto. Verifica el código ingresado.';
      toast.error(msg);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        style={{ maxWidth: '480px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                marginBottom: '4px',
              }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <div>
              <h2 className="modal-title">Unirse a un Proyecto</h2>
              <p className="modal-subtitle">
                Ingresa el código o ID de sala compartido por tu compañero.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar ventana">
            ×
          </button>
        </div>

        <form onSubmit={handleJoin}>
          <div className="modal-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Código de Proyecto / ID de Sala:
              </label>
              <input
                type="text"
                placeholder="Ejemplo: 3 o PROJ-3"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                autoFocus
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '16px',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  textAlign: 'center',
                  color: '#1d4ed8',
                }}
                required
              />
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                💡 El creador del proyecto puede ver su código en el botón <strong>"Compartir"</strong> de su editor.
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="modal-cancel-btn" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isJoining || !projectCode.trim()}
              style={{ padding: '8px 24px' }}
            >
              {isJoining ? 'Verificando...' : 'Unirse al Diagrama'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
