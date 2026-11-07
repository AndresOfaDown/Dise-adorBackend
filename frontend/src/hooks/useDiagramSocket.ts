import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDiagramStore } from '../store/diagramStore';
import type { Node, Edge } from 'reactflow';

export interface Collaborator {
  clientId: string;
  username: string;
  color: string;
}

export interface RemoteCursor {
  clientId: string;
  username: string;
  color: string;
  x: number;
  y: number;
  lastUpdated: number;
}

export interface TeamAiMessage {
  id: string;
  role: 'user' | 'assistant';
  senderName: string;
  senderColor: string;
  replyToUser?: string;
  text: string;
  actions?: any[];
  timestamp?: string;
  provider?: string;
  model?: string;
}

const COLLAB_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#d97706'];

export function useDiagramSocket(projectId: number | null) {
  const { user } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  
  // CU-11: Estado colaborativo de la IA Senior
  const [teamMessages, setTeamMessages] = useState<TeamAiMessage[]>([]);
  const [isAiTyping, setIsAiTyping] = useState<boolean>(false);
  const [aiTypingFor, setAiTypingFor] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(`client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
  const reconnectTimeoutRef = useRef<any>(null);
  const isSelfUpdateRef = useRef<boolean>(false);

  // Generar o recordar color propio consistente
  const userColorRef = useRef<string>(
    COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)]
  );

  const username = user?.username || user?.email?.split('@')[0] || 'Colaborador';

  useEffect(() => {
    if (!projectId) {
      setIsConnected(false);
      setCollaborators([]);
      setRemoteCursors({});
      setTeamMessages([]);
      return;
    }

    let isMounted = true;

    const connectSocket = () => {
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsHost = window.location.host;
      if (
        window.location.port === '5173' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)
      ) {
        wsHost = `${window.location.hostname}:8000`;
      }

      const customWs = (import.meta as any).env?.VITE_WS_URL;
      const wsBase = customWs || `${wsProto}//${wsHost}`;
      const wsUrl = `${wsBase}/ws/diagrama/${projectId}/?username=${encodeURIComponent(
        username
      )}&clientId=${clientIdRef.current}&color=${encodeURIComponent(userColorRef.current)}`;

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setIsConnected(true);
        useDiagramStore.getState().setIsSocketConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const payload = JSON.parse(event.data);

          // 1. Actualización de Presencia en línea
          if (payload.type === 'presence_update') {
            const users = payload.users || [];
            setCollaborators(users);
            useDiagramStore.getState().setCollaborators(users);
            return;
          }

          // 2. CU-11: Indicador de escritura de la IA Senior
          if (payload.type === 'team_ai_typing') {
            setIsAiTyping(!!payload.isTyping);
            setAiTypingFor(payload.isTyping ? payload.forUser || null : null);
            return;
          }

          // 3. CU-11: Mensaje del equipo o respuesta de la IA Senior
          if (payload.type === 'team_ai_message') {
            const newMsg: TeamAiMessage = {
              id: payload.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              role: payload.role || 'user',
              senderName: payload.senderName || 'Colaborador',
              senderColor: payload.senderColor || '#2563eb',
              replyToUser: payload.replyToUser || payload.reply_to_user,
              text: payload.text || '',
              actions: payload.actions || [],
              provider: payload.provider,
              model: payload.model,
              timestamp: payload.timestamp || new Date().toISOString()
            };

            setTeamMessages((prev) => {
              // Evitar duplicados por id
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });

            // Si es respuesta de la IA con acciones, se despachan automáticamente en el canvas
            if (payload.role === 'assistant' && payload.actions && payload.actions.length > 0) {
              window.dispatchEvent(
                new CustomEvent('apply_ai_actions', { detail: payload.actions })
              );
            }
            return;
          }

          // 3.1 Historial inicial de mensajes de la sala recibido vía WebSocket al conectar
          if (payload.type === 'chat_history') {
            const rawMessages = payload.messages || [];
            const mapped: TeamAiMessage[] = rawMessages.map((m: any) => ({
              id: m.id ? (String(m.id).startsWith('msg_') ? String(m.id) : `msg_db_${m.id}`) : `msg_db_${Math.random()}`,
              role: m.role || 'user',
              senderName: m.sender_name || m.senderName || 'Colaborador',
              senderColor: m.sender_color || m.senderColor || '#2563eb',
              replyToUser: m.reply_to_user || m.replyToUser,
              text: m.text || '',
              actions: m.actions || [],
              timestamp: m.timestamp || m.created_at || new Date().toISOString()
            }));

            setTeamMessages((prev) => {
              if (prev.length === 0) return mapped;
              const existingIds = new Set(prev.map((p) => p.id));
              const missing = mapped.filter((m) => !existingIds.has(m.id));
              if (missing.length === 0) return prev;
              const combined = [...prev, ...missing];
              combined.sort((a, b) => {
                const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return ta - tb;
              });
              return combined;
            });
            return;
          }

          // Ignorar ecos propios para eventos de cursor y diagrama
          if (payload.senderId === clientIdRef.current) {
            return;
          }

          // 4. Movimiento de Cursor remoto
          if (payload.type === 'cursor_move') {
            setRemoteCursors((prev) => ({
              ...prev,
              [payload.senderId]: {
                clientId: payload.senderId,
                username: payload.senderName || 'Colaborador',
                color: payload.color || '#3b82f6',
                x: payload.x,
                y: payload.y,
                lastUpdated: Date.now(),
              },
            }));
            return;
          }

          // 5. Actualización de Diagrama (Clases, Métodos, Atributos, Relaciones)
          if (payload.type === 'diagram_update') {
            isSelfUpdateRef.current = true;
            useDiagramStore.setState({
              nodes: payload.nodes || [],
              edges: payload.edges || [],
              hasUnsavedChanges: false,
            });
            setTimeout(() => {
              isSelfUpdateRef.current = false;
            }, 100);
            return;
          }

          // 6. Renombrado de Proyecto en vivo
          if (payload.type === 'project_rename') {
            if (payload.name) {
              useDiagramStore.setState({ projectName: payload.name });
            }
            return;
          }

          // 7. Evento de Auditoría / Historial de Cambios (CU-12)
          if (payload.type === 'audit_change_event') {
            const change = payload.change;
            if (change) {
              window.dispatchEvent(
                new CustomEvent('audit_change_event', { detail: change })
              );
            }
            return;
          }
        } catch (err) {
          console.error('Error parseando mensaje WebSocket colaborativo:', err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setIsConnected(false);
        useDiagramStore.getState().setIsSocketConnected(false);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted) connectSocket();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.warn('WebSocket error:', err);
      };
    };

    connectSocket();

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((k) => {
          if (now - next[k].lastUpdated > 5000) {
            delete next[k];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(cleanupInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [projectId, username]);

  // Transmitir cambios en el diagrama a los colaboradores
  const broadcastDiagramChange = useCallback(
    (nodes: Node[], edges: Edge[], viewport?: any) => {
      if (
        !socketRef.current ||
        socketRef.current.readyState !== WebSocket.OPEN ||
        isSelfUpdateRef.current
      ) {
        return;
      }

      socketRef.current.send(
        JSON.stringify({
          type: 'diagram_update',
          senderId: clientIdRef.current,
          senderName: username,
          nodes,
          edges,
          viewport,
        })
      );
    },
    [username]
  );

  // Transmitir posición del cursor flotante
  const lastCursorSendRef = useRef<number>(0);
  const broadcastCursor = useCallback(
    (flowX: number, flowY: number) => {
      const now = Date.now();
      if (now - lastCursorSendRef.current < 40) return;
      lastCursorSendRef.current = now;

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

      socketRef.current.send(
        JSON.stringify({
          type: 'cursor_move',
          senderId: clientIdRef.current,
          senderName: username,
          color: userColorRef.current,
          x: Math.round(flowX),
          y: Math.round(flowY),
        })
      );
    },
    [username]
  );

  // Transmitir renombramiento del proyecto
  const broadcastRename = useCallback(
    (newName: string) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
      socketRef.current.send(
        JSON.stringify({
          type: 'project_rename',
          senderId: clientIdRef.current,
          senderName: username,
          name: newName,
        })
      );
    },
    [username]
  );

  // CU-11: Enviar mensaje colaborativo al canal compartido con la IA Senior (soporta modo local/cloud)
  const sendTeamAiMessage = useCallback(
    (message: string, diagramContext: any, provider: string = 'auto', localModel: string = 'llama3.2:3b') => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return false;
      }

      const uniqueId = `msg_u_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nowIso = new Date().toISOString();

      // Renderizado optimista inmediato en la interfaz para que el mensaje del usuario nunca desaparezca
      const optimisticMsg: TeamAiMessage = {
        id: uniqueId,
        role: 'user',
        senderName: username,
        senderColor: userColorRef.current,
        text: message,
        timestamp: nowIso
      };
      setTeamMessages((prev) => {
        if (prev.some((m) => m.id === uniqueId)) return prev;
        return [...prev, optimisticMsg];
      });

      socketRef.current.send(
        JSON.stringify({
          type: 'team_ai_message',
          id: uniqueId,
          senderId: clientIdRef.current,
          senderName: username,
          senderColor: userColorRef.current,
          message,
          diagramContext,
          provider,
          localModel,
          timestamp: nowIso
        })
      );
      return true;
    },
    [username]
  );

  return {
    isConnected,
    collaborators,
    remoteCursors: Object.values(remoteCursors),
    broadcastDiagramChange,
    broadcastCursor,
    broadcastRename,
    // CU-11 Exports
    teamMessages,
    setTeamMessages,
    isAiTyping,
    aiTypingFor,
    sendTeamAiMessage,
    myClientId: clientIdRef.current,
    myColor: userColorRef.current,
  };
}
