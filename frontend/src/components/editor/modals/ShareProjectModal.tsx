import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../api/client';
import { useDiagramStore } from '../../../store/diagramStore';
import { copyToClipboardRobust } from '../../../utils/clipboard';

interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number | null;
  projectName: string;
}

interface CollaboratorUser {
  id: number;
  username: string;
  email: string;
}

export const ShareProjectModal: React.FC<ShareProjectModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
}) => {
  const { collaborators, isSocketConnected } = useDiagramStore();

  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [collaboratorsList, setCollaboratorsList] = useState<CollaboratorUser[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'link' | 'invite'>('code');

  // Enlace directo de colaboración
  const shareUrl = projectId
    ? `${window.location.origin}${window.location.pathname}?project=${projectId}`
    : window.location.href;

  // Cargar lista de colaboradores registrados del backend
  useEffect(() => {
    if (isOpen && projectId) {
      setIsLoadingCollaborators(true);
      apiClient
        .get(`/api/projects/${projectId}/colaboradores/`)
        .then((res) => {
          setCollaboratorsList(res.data.colaboradores || []);
        })
        .catch(() => {
          // Si no es el dueño o no hay colaboradores
        })
        .finally(() => {
          setIsLoadingCollaborators(false);
        });
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  // Copiar código de proyecto
  const handleCopyCode = async () => {
    if (!projectId) return;
    const ok = await copyToClipboardRobust(String(projectId));
    if (ok) {
      toast.success(`¡Código #${projectId} copiado al portapapeles!`);
    } else {
      toast.error('No se pudo copiar automáticamente. Puedes seleccionarlo manualmente.');
    }
  };

  // Copiar enlace completo
  const handleCopyLink = async () => {
    const ok = await copyToClipboardRobust(shareUrl);
    if (ok) {
      toast.success('¡Enlace de colaboración copiado al portapapeles!');
    } else {
      toast.error('No se pudo copiar automáticamente. Puedes seleccionar el enlace manualmente.');
    }
  };

  // Invitar usuario por correo o username
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteIdentifier.trim() || !projectId) return;

    setIsInviting(true);
    try {
      const res = await apiClient.post(`/api/projects/${projectId}/colaboradores/`, {
        identifier: inviteIdentifier.trim(),
      });
      toast.success(res.data.message || 'Colaborador añadido exitosamente');
      setInviteIdentifier('');
      if (res.data.colaboradores) {
        setCollaboratorsList(res.data.colaboradores);
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'No se pudo añadir al colaborador';
      toast.error(msg);
    } finally {
      setIsInviting(false);
    }
  };

  // Remover colaborador
  const handleRemoveCollaborator = async (userId: number, username: string) => {
    if (!projectId) return;
    if (!window.confirm(`¿Remover a ${username} de este proyecto?`)) return;

    try {
      await apiClient.delete(`/api/projects/${projectId}/colaboradores/`, {
        data: { user_id: userId },
      });
      toast.success(`Colaborador ${username} removido`);
      setCollaboratorsList((prev) => prev.filter((c) => c.id !== userId));
    } catch (err) {
      toast.error('Error al remover colaborador');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        style={{ maxWidth: '640px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal */}
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
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="modal-title">Compartir y Colaboración en Vivo</h2>
              <p className="modal-subtitle">
                Proyecto: <strong>{projectName}</strong> (ID: #{projectId})
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar ventana">
            ×
          </button>
        </div>

        {/* Estado en vivo de la conexión */}
        <div
          style={{
            margin: '0 24px 16px 24px',
            padding: '10px 16px',
            borderRadius: '10px',
            backgroundColor: isSocketConnected ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${isSocketConnected ? '#bbf7d0' : '#fde68a'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: isSocketConnected ? '#22c55e' : '#f59e0b',
                boxShadow: isSocketConnected ? '0 0 8px #22c55e' : 'none',
              }}
            ></span>
            <span style={{ fontWeight: 600, color: isSocketConnected ? '#166534' : '#b45309' }}>
              {isSocketConnected ? 'Sincronización en Tiempo Real Activa' : 'Conectando al servidor...'}
            </span>
          </div>
          <span style={{ color: '#64748b', fontSize: '12px' }}>
            {collaborators.length} {collaborators.length === 1 ? 'usuario en la sala' : 'usuarios en la sala'}
          </span>
        </div>

        {/* Pestañas de método de compartir */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 24px', marginBottom: '16px' }}>
          <button
            type="button"
            className={`tab-pill-btn ${activeTab === 'code' ? 'active' : ''}`}
            onClick={() => setActiveTab('code')}
            style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
          >
            <strong>1. Código de Sala</strong>
          </button>
          <button
            type="button"
            className={`tab-pill-btn ${activeTab === 'link' ? 'active' : ''}`}
            onClick={() => setActiveTab('link')}
            style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
          >
            <strong>2. Enlace Directo</strong>
          </button>
          <button
            type="button"
            className={`tab-pill-btn ${activeTab === 'invite' ? 'active' : ''}`}
            onClick={() => setActiveTab('invite')}
            style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
          >
            <strong>3. Invitar Usuario</strong>
          </button>
        </div>

        {/* Contenido según pestaña */}
        <div className="modal-body" style={{ paddingTop: 0 }}>
          {/* PESTAÑA 1: CÓDIGO DE SALA */}
          {activeTab === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                  Código para unirse a este diagrama:
                </div>
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: 800,
                    letterSpacing: '3px',
                    color: '#1d4ed8',
                    fontFamily: 'monospace',
                    marginBottom: '12px',
                    userSelect: 'all',
                  }}
                >
                  {projectId}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '8px 20px', fontSize: '13px' }}
                    onClick={handleCopyCode}
                  >
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Copiar Código</span>
                  </button>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '13px',
                  color: '#1e40af',
                }}
              >
                <strong>¿Cómo usarlo?</strong> Tu compañero solo debe abrir la plataforma, presionar{' '}
                <strong>"Unirse a Proyecto"</strong> en el Dashboard o lista de proyectos, e ingresar el código{' '}
                <code>{projectId}</code>. ¡Entrará inmediatamente al mismo diagrama!
              </div>
            </div>
          )}

          {/* PESTAÑA 2: ENLACE DIRECTO */}
          {activeTab === 'link' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>
                Comparte este enlace directo con tu compañero para que ingrese directamente desde su navegador:
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    backgroundColor: '#f8fafc',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleCopyLink}
                  style={{ padding: '8px 18px', whiteSpace: 'nowrap' }}
                >
                  Copiar Enlace
                </button>
              </div>

              <div
                style={{
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '12px',
                  color: '#475569',
                }}
              >
                💡 <strong>Nota:</strong> Si estás en red local (LAN), ambos usuarios deben estar conectados a la misma
                red WiFi o IP del servidor.
              </div>
            </div>
          )}

          {/* PESTAÑA 3: INVITAR USUARIO */}
          {activeTab === 'invite' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <form onSubmit={handleInvite} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Nombre de usuario o correo del compañero..."
                  value={inviteIdentifier}
                  onChange={(e) => setInviteIdentifier(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                  required
                />
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isInviting || !inviteIdentifier.trim()}
                  style={{ padding: '8px 18px', whiteSpace: 'nowrap' }}
                >
                  {isInviting ? 'Invitando...' : 'Invitar'}
                </button>
              </form>

              {/* Lista de colaboradores registrados */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                  Colaboradores del proyecto:
                </div>
                {isLoadingCollaborators ? (
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>Cargando colaboradores...</div>
                ) : collaboratorsList.length === 0 ? (
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px dashed #cbd5e1',
                      fontSize: '13px',
                      color: '#64748b',
                      textAlign: 'center',
                    }}
                  >
                    Aún no has invitado a ningún colaborador. Invita a un usuario registrado para que este proyecto le
                    aparezca en su lista.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {collaboratorsList.map((collab) => (
                      <div
                        key={collab.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          backgroundColor: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: '#3b82f6',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold',
                            }}
                          >
                            {collab.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                              {collab.username}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{collab.email}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCollaborator(collab.id, collab.username)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '4px 8px',
                          }}
                          title="Remover colaborador"
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Participantes en línea actualmente en este momento */}
          {collaborators.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                Usuarios conectados en este lienzo ahora mismo ({collaborators.length}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {collaborators.map((c, i) => (
                  <div
                    key={c.clientId || i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '20px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: c.color || '#3b82f6',
                      }}
                    ></span>
                    <span style={{ fontWeight: 500 }}>{c.username}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn-primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
