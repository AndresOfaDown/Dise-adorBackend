import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { useDiagramStore } from '../../store/diagramStore';
import { useAuthStore } from '../../store/authStore';
import type { TeamAiMessage } from '../../hooks/useDiagramSocket';
import { DiagramHistoryAuditPanel } from './DiagramHistoryAuditPanel';

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
  resultIndex: number;
}

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  teamMessages: TeamAiMessage[];
  setTeamMessages: React.Dispatch<React.SetStateAction<TeamAiMessage[]>>;
  isAiTyping: boolean;
  aiTypingFor: string | null;
  onSendTeamMessage: (message: string, diagramContext: any) => boolean;
  projectId: number | null;
  activeTab?: 'chat' | 'history';
  onSwitchTab?: (tab: 'chat' | 'history') => void;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  isOpen,
  onClose,
  teamMessages,
  setTeamMessages,
  isAiTyping,
  aiTypingFor,
  onSendTeamMessage,
  projectId,
  activeTab = 'chat',
  onSwitchTab,
}) => {
  const { user } = useAuthStore();
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const {
    nodes,
    edges,
    importDiagramFromAi,
    updateNodeData,
    deleteNode,
  } = useDiagramStore();

  const currentUsername = user?.username || user?.nombre || user?.email?.split('@')[0] || 'Tú';

  // Cargar historial previo de la base de datos al abrir el panel por primera vez
  useEffect(() => {
    if (projectId && teamMessages.length === 0) {
      apiClient.get(`/api/ia/historial/${projectId}/`)
        .then((res) => {
          if (res.data?.success && Array.isArray(res.data.messages)) {
            const mapped = res.data.messages.map((m: any) => ({
              id: `msg_db_${m.id}`,
              role: m.role,
              senderName: m.sender_name || 'Colaborador',
              senderColor: m.sender_color || '#2563eb',
              text: m.text,
              actions: m.actions,
              timestamp: m.created_at
            }));
            setTeamMessages(mapped);
          }
        })
        .catch((err) => {
          console.warn("No se pudo cargar historial de sala previo:", err);
        });
    }
  }, [projectId]);

  // Scroll automático al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [teamMessages, isAiTyping]);

  // Focus en el input cuando se abre el panel
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Construir contexto del diagrama actual para enviar a la IA
  const buildDiagramContext = useCallback(() => {
    const classNodes = nodes.filter((n) => n.type === 'umlClass');
    const classes = classNodes.map((n) => ({
      name: n.data?.name || 'SinNombre',
      attributes: (n.data?.attributes || []).map(
        (a: any) => `${a.visibility} ${a.name}: ${a.type}`
      ),
      methods: (n.data?.methods || []).map(
        (m: any) => `${m.visibility} ${m.name}(${m.parameters || ''}): ${m.returnType || 'void'}`
      ),
      position: n.position || { x: 100, y: 100 }
    }));

    const relations = edges.map((e) => {
      const sourceNode = classNodes.find((n) => n.id === e.source);
      const targetNode = classNodes.find((n) => n.id === e.target);
      const assocClassNode = e.data?.associationClassId
        ? classNodes.find((n) => n.id === e.data.associationClassId)
        : null;
      return {
        source: sourceNode?.data?.name || e.source,
        target: targetNode?.data?.name || e.target,
        type: e.data?.relationType || 'association',
        sourceMultiplicity: e.data?.sourceMultiplicity || '',
        targetMultiplicity: e.data?.targetMultiplicity || '',
        associationClassName: assocClassNode?.data?.name || '',
      };
    });

    return { classes, relations };
  }, [nodes, edges]);

  // Aplicar acciones de la IA automáticamente
  const applyActions = useCallback((actions: any[]) => {
    if (!actions || actions.length === 0) return;

    const addNodeActions: any[] = [];
    const addEdgeActions: any[] = [];

    for (const action of actions) {
      switch (action.type) {
        case 'addNode': {
          addNodeActions.push({
            name: action.data.name,
            stereotype: action.data.stereotype || '',
            attributes: action.data.attributes || [],
            methods: action.data.methods || [],
            position: action.data.position,
          });
          break;
        }

        case 'addEdge': {
          addEdgeActions.push({
            source: action.data.source,
            target: action.data.target,
            type: action.data.type || 'association',
            sourceMultiplicity: action.data.sourceMultiplicity || '',
            targetMultiplicity: action.data.targetMultiplicity || '',
            label: action.data.label || '',
            associationClassName: action.data.associationClassName || '',
          });
          break;
        }

        case 'modifyEdge': {
          const sourceName = action.data.source;
          const targetName = action.data.target;
          const state = useDiagramStore.getState();

          const sourceNode = state.nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === sourceName?.toLowerCase()
          );
          const targetNode = state.nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === targetName?.toLowerCase()
          );

          if (sourceNode && targetNode) {
            const edgeIndex = state.edges.findIndex(
              (e) =>
                (e.source === sourceNode.id && e.target === targetNode.id) ||
                (e.source === targetNode.id && e.target === sourceNode.id)
            );

            if (edgeIndex !== -1) {
              const currentEdge = state.edges[edgeIndex];
              const isReverse = currentEdge.source === targetNode.id;
              const updatedEdges = [...state.edges];

              const newSourceMult = isReverse
                ? (action.data.targetMultiplicity ?? currentEdge.data?.sourceMultiplicity)
                : (action.data.sourceMultiplicity ?? currentEdge.data?.sourceMultiplicity);
              const newTargetMult = isReverse
                ? (action.data.sourceMultiplicity ?? currentEdge.data?.targetMultiplicity)
                : (action.data.targetMultiplicity ?? currentEdge.data?.targetMultiplicity);

              updatedEdges[edgeIndex] = {
                ...currentEdge,
                data: {
                  ...currentEdge.data,
                  relationType: action.data.newType || currentEdge.data?.relationType || 'association',
                  sourceMultiplicity: newSourceMult ?? '',
                  targetMultiplicity: newTargetMult ?? '',
                  label: action.data.label !== undefined ? action.data.label : (currentEdge.data?.label || ''),
                },
              };

              useDiagramStore.setState({ edges: updatedEdges, hasUnsavedChanges: true });
              toast.success(`Relación entre "${sourceName}" y "${targetName}" actualizada`);
            } else {
              toast.error(`No se encontró la relación entre "${sourceName}" y "${targetName}"`);
            }
          }
          break;
        }

        case 'modifyNode': {
          const targetName = action.data.targetName;
          const existingNode = nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === targetName?.toLowerCase()
          );

          if (existingNode) {
            let updatedAttributes = [...(existingNode.data?.attributes || [])];
            let updatedMethods = [...(existingNode.data?.methods || [])];

            if (action.data.addAttributes) {
              for (const attrStr of action.data.addAttributes) {
                let visibility: '+' | '-' | '#' | '~' = '+';
                let cleanStr = attrStr.trim();
                if (['+', '-', '#', '~'].includes(cleanStr[0])) {
                  visibility = cleanStr[0] as any;
                  cleanStr = cleanStr.slice(1).trim();
                }
                const parts = cleanStr.split(':');
                updatedAttributes.push({
                  id: `attr_ai_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                  visibility,
                  name: parts[0]?.trim() || cleanStr,
                  type: parts[1]?.trim() || 'string',
                });
              }
            }

            if (action.data.removeAttributes) {
              updatedAttributes = updatedAttributes.filter(
                (a: any) => !action.data.removeAttributes.includes(a.name)
              );
            }

            if (action.data.addMethods) {
              for (const methStr of action.data.addMethods) {
                let visibility: '+' | '-' | '#' | '~' = '+';
                let cleanStr = methStr.trim();
                if (['+', '-', '#', '~'].includes(cleanStr[0])) {
                  visibility = cleanStr[0] as any;
                  cleanStr = cleanStr.slice(1).trim();
                }
                updatedMethods.push({
                  id: `meth_ai_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                  visibility,
                  name: cleanStr.replace(/;$/, '').trim(),
                  parameters: '',
                  returnType: '',
                });
              }
            }

            if (action.data.removeMethods) {
              updatedMethods = updatedMethods.filter(
                (m: any) => !action.data.removeMethods.includes(m.name)
              );
            }

            const partialUpdate: any = {
              attributes: updatedAttributes,
              methods: updatedMethods,
            };

            if (action.data.newName) {
              partialUpdate.name = action.data.newName;
            }

            updateNodeData(existingNode.id, partialUpdate);
            toast.success(`Clase "${targetName}" modificada`);
          } else {
            toast.error(`No se encontró la clase "${targetName}" para modificar`);
          }
          break;
        }

        case 'deleteNode': {
          const targetName = action.data.targetName;
          const nodeToDelete = nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === targetName?.toLowerCase()
          );
          if (nodeToDelete) {
            deleteNode(nodeToDelete.id);
            toast.success(`Clase "${targetName}" eliminada`);
          }
          break;
        }

        case 'deleteEdge': {
          const sourceName = action.data.source;
          const targetName = action.data.target;
          const state = useDiagramStore.getState();

          const sourceNode = state.nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === sourceName?.toLowerCase()
          );
          const targetNode = state.nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === targetName?.toLowerCase()
          );

          if (sourceNode && targetNode) {
            const edgeToDelete = state.edges.find(
              (e) =>
                (e.source === sourceNode.id && e.target === targetNode.id) ||
                (e.source === targetNode.id && e.target === sourceNode.id)
            );

            if (edgeToDelete) {
              useDiagramStore.setState({
                edges: state.edges.filter((e) => e.id !== edgeToDelete.id),
                hasUnsavedChanges: true,
              });
              toast.success(`Relación entre "${sourceName}" y "${targetName}" eliminada`);
            }
          }
          break;
        }
      }
    }

    if (addNodeActions.length > 0 || addEdgeActions.length > 0) {
      importDiagramFromAi(addNodeActions, addEdgeActions, 'append');
      const names = addNodeActions.map((a) => a.name).join(', ');
      if (names) {
        toast.success(`Clases creadas por la IA: ${names}`);
      }
    }
  }, [nodes, importDiagramFromAi, updateNodeData, deleteNode]);

  // Escuchar evento global de acciones transmitidas por WebSocket (CU-11)
  useEffect(() => {
    const handleApplyEvent = (event: any) => {
      if (event.detail && Array.isArray(event.detail)) {
        applyActions(event.detail);
      }
    };
    window.addEventListener('apply_ai_actions', handleApplyEvent);
    return () => window.removeEventListener('apply_ai_actions', handleApplyEvent);
  }, [applyActions]);

  // Enviar mensaje al canal WebSocket colaborativo
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isAiTyping) return;

    const diagramContext = buildDiagramContext();
    const sent = onSendTeamMessage(text, diagramContext);

    if (sent) {
      setInputText('');
    } else {
      // Fallback HTTP si el socket estuviese reconectando
      try {
        const res = await apiClient.post('/api/ia/chat/', {
          message: text,
          diagramContext,
          sender_name: currentUsername,
          project_id: projectId
        });
        if (res.data?.success) {
          setInputText('');
          if (res.data.actions && res.data.actions.length > 0) {
            applyActions(res.data.actions);
          }
        }
      } catch (err) {
        toast.error("Error al enviar mensaje");
      }
    }
  }, [inputText, isAiTyping, buildDiagramContext, onSendTeamMessage, currentUsername, projectId, applyActions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Reconocimiento de voz
  const toggleVoice = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        toast('Escuchando...', { icon: '🎙️', duration: 2000 });
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < Object.keys(event.results).length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Error reconocimiento de voz:', event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') {
          toast.error(`Error de voz: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      console.error('Error iniciando reconocimiento de voz:', error);
      setIsListening(false);
    }
  }, [isListening]);

  // Agrupamiento y conteo de sesiones continuas (CU-12)
  const sessionDaysCount = React.useMemo(() => {
    const dates = new Set<string>();
    teamMessages.forEach((m) => {
      if (m.timestamp) {
        try {
          dates.add(new Date(m.timestamp).toDateString());
        } catch (_) {}
      }
    });
    return Math.max(1, dates.size);
  }, [teamMessages]);

  const getSessionDateLabel = (dateStr?: string) => {
    if (!dateStr) return 'Sesión de Trabajo';
    try {
      const d = new Date(dateStr);
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      };
      const formatted = d.toLocaleDateString('es-ES', options);
      const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);

      if (isToday) return `Hoy — ${capitalized}`;
      if (isYesterday) return `Ayer — ${capitalized}`;
      return `Sesión: ${capitalized}`;
    } catch {
      return 'Sesión de Trabajo';
    }
  };

  return (
    <aside className={`ai-assistant-panel ${isOpen ? 'open' : ''}`}>
      {/* Header compacto con título dinámico */}
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          {activeTab === 'history' ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Historial de Cambios (CU-12)</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2H10a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
                <line x1="10" y1="22" x2="14" y2="22" />
              </svg>
              <span>IA Senior Colaborativa</span>
            </>
          )}
        </div>
        <div className="ai-panel-header-actions">
          <button
            type="button"
            className="ai-panel-close-btn"
            onClick={onClose}
            title="Cerrar panel lateral"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Selector de pestañas: Chat IA Senior vs Historial de Cambios */}
      <div className="panel-tab-switcher">
        <button
          type="button"
          className={`panel-switch-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => onSwitchTab?.('chat')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <span>Chat IA Senior</span>
        </button>
        <button
          type="button"
          className={`panel-switch-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onSwitchTab?.('history')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Historial Diagrama (CU-12)</span>
        </button>
      </div>

      {activeTab === 'history' ? (
        <DiagramHistoryAuditPanel projectId={projectId} />
      ) : (
        <>
          {/* CU-12: Barra de Auditoría de Sesión Continua */}
          <div className="ai-panel-audit-bar">
            <div className="ai-audit-status" title="Persistencia continua en tiempo real activada (CU-12)">
              <span className="ai-audit-pulse"></span>
              <span>CU-12: Sesión Continua</span>
            </div>
            <div className="ai-audit-stats">
              <span>Sala #{projectId ?? '1'}</span>
              <span>•</span>
              <span>{sessionDaysCount} jornada{sessionDaysCount > 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{teamMessages.length} evento{teamMessages.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

      {/* Lista de mensajes */}
      <div className="ai-panel-messages">
        {teamMessages.length === 0 && (
          <div className="ai-panel-empty">
            <div className="ai-empty-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <p className="ai-empty-title">¡Bienvenidos a la sesión colaborativa!</p>
            <p className="ai-empty-hint">
              Soy su <strong>Arquitecto Senior</strong>. Puedo resolver dudas conceptuales,
              explicar cuándo usar agregación vs composición, o construir y refactorizar clases en vivo para todo el equipo.
            </p>
            <div className="ai-empty-examples">
              <button
                type="button"
                onClick={() => setInputText('¿Qué diferencia hay entre composición y agregación en nuestro diagrama?')}
              >
                Composición vs Agregación
              </button>
              <button
                type="button"
                onClick={() => setInputText('Crea la clase Pago con id, monto y fecha, y asóciala 1 a 1 con Pedido.')}
              >
                Agregar clase y relación
              </button>
              <button
                type="button"
                onClick={() => setInputText('¿Qué avances o elementos tiene actualmente nuestro diagrama?')}
              >
                Resumen de avance
              </button>
            </div>
          </div>
        )}

        {teamMessages.map((msg, index) => {
          const isMe = msg.role === 'user' && msg.senderName === currentUsername;
          const isAi = msg.role === 'assistant';
          const authorColor = isAi ? '#059669' : (msg.senderColor || '#2563eb');

          const prevMsg = index > 0 ? teamMessages[index - 1] : null;
          const currentDateStr = msg.timestamp ? new Date(msg.timestamp).toDateString() : '';
          const prevDateStr = prevMsg?.timestamp ? new Date(prevMsg.timestamp).toDateString() : '';
          const isNewSessionDay = index === 0 || currentDateStr !== prevDateStr;

          return (
            <React.Fragment key={msg.id}>
              {isNewSessionDay && (
                <div className="session-timeline-divider">
                  <div className="session-divider-line" />
                  <div className="session-divider-badge">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>{getSessionDateLabel(msg.timestamp)}</span>
                  </div>
                  <div className="session-divider-line" />
                </div>
              )}

              <div
                className={`ai-message ${isAi ? 'assistant' : 'user'}`}
                style={{
                  alignSelf: isMe ? 'flex-end' : isAi ? 'stretch' : 'flex-start',
                  alignItems: isMe ? 'flex-end' : 'flex-start'
                }}
              >
                {/* Encabezado con autor visible y legible */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '3px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: '#f1f5f9',
                  border: `1px solid ${authorColor}40`,
                  fontSize: '11px',
                  fontWeight: 700,
                  color: authorColor
                }}>
                  <span>{isAi ? '🤖 IA Senior (Arquitecto)' : (msg.senderName || 'Colaborador')}</span>
                  {isMe && <span style={{ color: '#64748b', fontWeight: 500 }}>(Tú)</span>}
                </div>

                <div
                  className="ai-message-bubble"
                  style={{
                    borderLeft: isAi ? '4px solid #10b981' : `4px solid ${authorColor}`,
                    background: isAi ? '#f0fdf4' : (isMe ? '#eff6ff' : '#ffffff'),
                    color: '#0f172a',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}
                >
                  <p className="ai-message-text" style={{ whiteSpace: 'pre-wrap', color: '#0f172a' }}>{msg.text}</p>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="ai-actions-badge applied">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span>{msg.actions.length} cambio(s) aplicado(s) al canvas del equipo</span>
                    </div>
                  )}
                </div>

                <div className="ai-message-footer">
                  <span className="ai-message-time" title={msg.timestamp ? new Date(msg.timestamp).toLocaleString('es') : ''}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 3, verticalAlign: 'middle' }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                  </span>
                  {msg.timestamp && (
                    <span className="ai-message-date-chip" title="Fecha persistida en BD">
                      {new Date(msg.timestamp).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {isAiTyping && (
          <div className="ai-message assistant">
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700, marginBottom: '3px' }}>
              🤖 IA Senior analizando {aiTypingFor ? `la consulta de ${aiTypingFor}` : 'para el equipo'}...
            </div>
            <div className="ai-message-bubble loading">
              <span className="ai-typing-dot"></span>
              <span className="ai-typing-dot"></span>
              <span className="ai-typing-dot"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input de texto y micrófono */}
      <div className="ai-panel-input-area">
        <div className="ai-input-wrapper">
          <textarea
            ref={inputRef}
            className="ai-input-text"
            placeholder="Pregunta o pide cambios para el equipo (Enter para enviar)..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isAiTyping}
          />
          <div className="ai-input-actions">
            <button
              type="button"
              className={`ai-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleVoice}
              title={isListening ? 'Detener grabación' : 'Voz'}
              disabled={isAiTyping}
            >
              {isListening ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="ai-send-btn"
              onClick={handleSend}
              disabled={!inputText.trim() || isAiTyping}
              title="Enviar mensaje a la sala"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      </>
      )}
    </aside>
  );
};
