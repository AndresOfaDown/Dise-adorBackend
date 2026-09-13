import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { useDiagramStore } from '../../store/diagramStore';
import type { UmlRelationType } from '../../store/diagramStore';

// Tipado del SpeechRecognition del navegador
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
  resultIndex: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: any[];
  actionsApplied?: boolean;
  timestamp: Date;
}

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  // Scroll automático al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
            type: (action.data.type || 'association') as UmlRelationType,
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
            const edge = state.edges.find(
              (e) =>
                (e.source === sourceNode.id && e.target === targetNode.id) ||
                (e.source === targetNode.id && e.target === sourceNode.id)
            );

            if (edge) {
              const isReverse = edge.source === targetNode.id;
              const normSource = (action.data.sourceMultiplicity || '').replace(/\.{2,}/g, '..').trim();
              const normTarget = (action.data.targetMultiplicity || '').replace(/\.{2,}/g, '..').trim();

              const partialData: any = {};
              if (action.data.newType) partialData.relationType = action.data.newType;
              if (action.data.sourceMultiplicity !== undefined) {
                partialData.sourceMultiplicity = isReverse ? normTarget : normSource;
              }
              if (action.data.targetMultiplicity !== undefined) {
                partialData.targetMultiplicity = isReverse ? normSource : normTarget;
              }
              if (action.data.label !== undefined) partialData.label = action.data.label;

              useDiagramStore.getState().updateEdgeData(edge.id, partialData);
              toast.success(`Relación entre "${sourceName}" y "${targetName}" actualizada`);
            } else {
              toast.error(`No se encontró una relación entre "${sourceName}" y "${targetName}"`);
            }
          } else {
            toast.error(`No se encontraron las clases "${sourceName}" o "${targetName}"`);
          }
          break;
        }

        case 'modifyNode': {
          const targetName = action.data.targetName;
          const existingNode = nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === targetName?.toLowerCase()
          );

          if (existingNode) {
            const currentData = existingNode.data;
            let updatedAttributes = [...(currentData.attributes || [])];
            let updatedMethods = [...(currentData.methods || [])];

            // Agregar nuevos atributos
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

            // Eliminar atributos
            if (action.data.removeAttributes) {
              updatedAttributes = updatedAttributes.filter(
                (a: any) => !action.data.removeAttributes.includes(a.name)
              );
            }

            // Agregar nuevos métodos
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

            // Eliminar métodos
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
          } else {
            toast.error(`No se encontró la clase "${targetName}" para eliminar`);
          }
          break;
        }

        case 'deleteEdge': {
          const sourceName = action.data.source;
          const targetName = action.data.target;
          const state = useDiagramStore.getState();

          // Buscar los IDs de los nodos por nombre
          const sourceNode = state.nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === sourceName?.toLowerCase()
          );
          const targetNode = state.nodes.find(
            (n) => n.type === 'umlClass' && n.data?.name?.toLowerCase() === targetName?.toLowerCase()
          );

          if (sourceNode && targetNode) {
            // Buscar la relación entre ambos nodos (en cualquier dirección)
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
            } else {
              toast.error(`No se encontró una relación entre "${sourceName}" y "${targetName}"`);
            }
          } else {
            toast.error(`No se encontraron las clases "${sourceName}" o "${targetName}"`);
          }
          break;
        }
      }
    }

    // Aplicar addNode y addEdge en lote usando importDiagramFromAi
    if (addNodeActions.length > 0 || addEdgeActions.length > 0) {
      importDiagramFromAi(addNodeActions, addEdgeActions, 'append');
      if (addNodeActions.length > 0 && addEdgeActions.length > 0) {
        const names = addNodeActions.map((a) => a.name).join(', ');
        toast.success(`Clases creadas (${names}) y relaciones vinculadas`);
      } else if (addNodeActions.length > 0) {
        const names = addNodeActions.map((a) => a.name).join(', ');
        toast.success(`Clases creadas: ${names}`);
      } else {
        toast.success('Relaciones actualizadas / creadas');
      }
    }
  }, [nodes, importDiagramFromAi, updateNodeData, deleteNode]);

  // Enviar mensaje al backend
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const diagramContext = buildDiagramContext();
      const response = await apiClient.post('/api/ia/chat/', {
        message: text,
        diagramContext,
      });

      const data = response.data;

      if (data.success) {
        const assistantMessage: ChatMessage = {
          id: `msg_${Date.now()}_ai`,
          role: 'assistant',
          text: data.reply || 'Entendido.',
          actions: data.actions,
          actionsApplied: false,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Aplicar acciones automáticamente
        if (data.actions && data.actions.length > 0) {
          setTimeout(() => {
            applyActions(data.actions);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessage.id ? { ...m, actionsApplied: true } : m
              )
            );
          }, 500);
        }
      } else {
        toast.error(data.error || 'Error al obtener respuesta de la IA');
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.error || 'Error de conexión con el servidor';
      toast.error(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_err`,
          role: 'assistant',
          text: `Error: ${errMsg}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, buildDiagramContext, applyActions]);

  // Reconocimiento de voz con Web Speech API
  const toggleVoice = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }

    // Si ya está escuchando, detener manualmente
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = true;
    recognition.continuous = true; // No se apaga solo, el usuario controla cuándo parar

    let finalTranscript = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < Object.keys(event.results).length; i++) {
        const result = event.results[i];
        if ((result as any).isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      setInputText((finalTranscript + interim).trim());
    };

    recognition.onend = () => {
      // En modo continuo, el navegador puede detener la sesión internamente.
      // Si el usuario no pidió parar, reiniciar automáticamente.
      if (recognitionRef.current && isListening) {
        try {
          recognition.start();
        } catch (_) {
          setIsListening(false);
          recognitionRef.current = null;
        }
      } else {
        setIsListening(false);
        recognitionRef.current = null;
      }
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' y 'aborted' son normales, no mostrar error
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setIsListening(false);
      recognitionRef.current = null;
      toast.error('Error en el reconocimiento de voz');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    toast.success('Micrófono activado. Habla y pulsa Stop cuando termines.');
  }, [isListening]);

  // Limpiar historial
  const handleClear = () => {
    setMessages([]);
    toast.success('Historial del asistente limpiado');
  };

  // Manejar teclas en el textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`ai-assistant-panel ${isOpen ? 'open' : ''}`}>
      {/* Cabecera del panel */}
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2H10a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
            <line x1="10" y1="22" x2="14" y2="22" />
          </svg>
          <span>Asistente IA</span>
        </div>
        <div className="ai-panel-header-actions">
          <button
            type="button"
            className="ai-panel-clear-btn"
            onClick={handleClear}
            title="Limpiar historial"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            type="button"
            className="ai-panel-close-btn"
            onClick={onClose}
            title="Cerrar asistente"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Área de mensajes */}
      <div className="ai-panel-messages">
        {messages.length === 0 && (
          <div className="ai-panel-empty">
            <div className="ai-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <p className="ai-empty-title">¿En qué puedo ayudarte?</p>
            <p className="ai-empty-hint">
              Puedo crear clases, agregar atributos, crear relaciones, o responder preguntas sobre UML.
            </p>
            <div className="ai-empty-examples">
              <button type="button" onClick={() => setInputText('Crea una clase Producto con atributos id, nombre y precio')}>
                Crear una clase Producto
              </button>
              <button type="button" onClick={() => setInputText('¿Cuántas clases tengo en mi diagrama?')}>
                ¿Cuántas clases tengo?
              </button>
              <button type="button" onClick={() => setInputText('Revisa mi diagrama y sugiere mejoras')}>
                Sugerir mejoras
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`ai-message ${msg.role}`}>
            <div className="ai-message-bubble">
              <p className="ai-message-text">{msg.text}</p>
              {msg.actions && msg.actions.length > 0 && (
                <div className={`ai-actions-badge ${msg.actionsApplied ? 'applied' : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {msg.actionsApplied ? (
                      <path d="M20 6L9 17l-5-5" />
                    ) : (
                      <path d="M12 5v14M5 12h14" />
                    )}
                  </svg>
                  <span>
                    {msg.actionsApplied
                      ? `${msg.actions.length} acción(es) aplicada(s)`
                      : `Aplicando ${msg.actions.length} acción(es)...`}
                  </span>
                </div>
              )}
            </div>
            <span className="ai-message-time">
              {msg.timestamp.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="ai-message assistant">
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
            placeholder="Escribe un mensaje o usa el micrófono..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
          />
          <div className="ai-input-actions">
            <button
              type="button"
              className={`ai-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleVoice}
              title={isListening ? 'Detener grabación' : 'Iniciar reconocimiento de voz'}
              disabled={isLoading}
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
              disabled={!inputText.trim() || isLoading}
              title="Enviar mensaje"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
