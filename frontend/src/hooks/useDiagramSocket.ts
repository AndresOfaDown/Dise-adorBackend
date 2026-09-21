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

const COLLAB_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#d97706'];

export function useDiagramSocket(projectId: number | null) {
  const { user } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});

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
      return;
    }

    let isMounted = true;

    const connectSocket = () => {
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Si el frontend está corriendo en el puerto 5173 (Vite) o en entorno local/LAN, el backend Django Channels está en el puerto 8000
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

          // Ignorar ecos propios
          if (payload.senderId === clientIdRef.current) {
            return;
          }

          // 2. Movimiento de Cursor remoto
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

          // 3. Actualización de Diagrama (Clases, Métodos, Atributos, Relaciones)
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

          // 4. Renombrado de Proyecto en vivo
          if (payload.type === 'project_rename') {
            if (payload.name) {
              useDiagramStore.setState({ projectName: payload.name });
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
        // Reconectar tras 3 segundos
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted) connectSocket();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.warn('WebSocket error:', err);
      };
    };

    connectSocket();

    // Limpieza de cursores inactivos cada 4 segundos
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

  // Transmitir posición del cursor flotante (coordenadas en el lienzo de ReactFlow)
  const lastCursorSendRef = useRef<number>(0);
  const broadcastCursor = useCallback(
    (flowX: number, flowY: number) => {
      const now = Date.now();
      // Throttle a 40ms (~25 fps) para no saturar el canal
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

  return {
    isConnected,
    collaborators,
    remoteCursors: Object.values(remoteCursors),
    broadcastDiagramChange,
    broadcastCursor,
    broadcastRename,
    myClientId: clientIdRef.current,
    myColor: userColorRef.current,
  };
}
