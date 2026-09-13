import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';

import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import toast from 'react-hot-toast';

import { useDiagramStore } from '../../store/diagramStore';
import { useNavigationStore } from '../../store/navigationStore';
import { EditorHeader } from './EditorHeader';
import { AiAssistantPanel } from './AiAssistantPanel';
import { ToolSidebar } from './ToolSidebar';
import { UmlClassNode } from './nodes/UmlClassNode';
import { UmlTextNode } from './nodes/UmlTextNode';
import { UmlEdge } from './edges/UmlEdge';
import { useAutoSave } from '../../hooks/useAutoSave';
import { distributeEdgeHandles } from '../../utils/edgeRouting';
import { useDiagramSocket } from '../../hooks/useDiagramSocket';
import { RemoteCursors } from './RemoteCursors';

const nodeTypes: NodeTypes = {
  umlClass: UmlClassNode,
  umlText: UmlTextNode,
};

const edgeTypes: EdgeTypes = {
  umlEdge: UmlEdge,
};

const EditorCanvas: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project } = useReactFlow();
  const { activeProjectId } = useNavigationStore();

  const {
    remoteCursors,
    broadcastDiagramChange,
    broadcastCursor,
  } = useDiagramSocket(activeProjectId);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addClassNode,
    addTextNode,
    selectedTool,
    setSelectedTool,
    connectingSourceNodeId,
    setConnectingSourceNodeId,
    hoveredNodeId,
    setHoveredNodeId,
  } = useDiagramStore();

  const isRelationActive = selectedTool !== 'select' && selectedTool !== 'class' && selectedTool !== 'text';

  // Posición del cursor para trazar la línea elástica estilo StarUML
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Menú contextual flotante al hacer clic derecho en una relación
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    edgeId: string;
    label?: string;
  } | null>(null);

  // Menú contextual al hacer clic derecho en un texto
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
  } | null>(null);

  const { deleteNode } = useDiagramStore();

  // Cancelar modo de conexión o menús contextuales con la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTool('select');
        setConnectingSourceNodeId(null);
        setHoveredNodeId(null);
        setMousePos(null);
        setContextMenu(null);
        setNodeContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedTool, setConnectingSourceNodeId, setHoveredNodeId]);

  // Permitir soltar la clase o texto arrastrado desde el sidebar al canvas
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      if (type === 'class') {
        addClassNode(position);
      } else if (type === 'text') {
        addTextNode(position);
      }
    },
    [project, addClassNode, addTextNode]
  );

  // Clic en canvas
  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      setContextMenu(null);
      setNodeContextMenu(null);
      if (selectedTool === 'class' && reactFlowWrapper.current) {
        const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
        const position = project({
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        });
        addClassNode(position);
      } else if (selectedTool === 'text' && reactFlowWrapper.current) {
        const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
        const position = project({
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        });
        addTextNode(position);
        setSelectedTool('select');
      } else {
        // Si no se hizo clic en una clase o se hizo clic en el lienzo vacío, se desactiva sola
        if (selectedTool !== 'select') {
          setSelectedTool('select');
        }
        if (connectingSourceNodeId) {
          setConnectingSourceNodeId(null);
        }
        setHoveredNodeId(null);
        setMousePos(null);
      }
    },
    [selectedTool, project, addClassNode, addTextNode, setSelectedTool, connectingSourceNodeId, setConnectingSourceNodeId, setHoveredNodeId]
  );

  // Clic derecho en una relación
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: any) => {
    event.preventDefault();
    setNodeContextMenu(null);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      edgeId: edge.id,
      label: edge.data?.label || '',
    });
  }, []);

  // Clic derecho en un nodo (especialmente texto)
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: any) => {
    if (node.type === 'umlText') {
      event.preventDefault();
      setContextMenu(null);
      setNodeContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    }
  }, []);

  // Eliminar relación desde menú contextual
  const handleDeleteEdgeFromContext = (edgeId: string) => {
    onEdgesChange([{ id: edgeId, type: 'remove' }]);
    setContextMenu(null);
    toast.success('Relación eliminada');
  };

  // Eliminar texto desde menú contextual
  const handleDeleteNodeFromContext = (nodeId: string) => {
    deleteNode(nodeId);
    setNodeContextMenu(null);
    toast.success('Texto eliminado');
  };

  // Al hacer clic en un nodo, garantizar que solo se seleccione ese nodo
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      setContextMenu(null);
      onNodesChange(
        nodes.map((n) => ({
          id: n.id,
          type: 'select',
          selected: n.id === node.id,
        }))
      );
    },
    [nodes, onNodesChange]
  );

  // Al hacer clic en una relación, garantizar su selección y mostrar sus manijas interactivas
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: any) => {
      setContextMenu(null);
      onEdgesChange(
        edges.map((e) => ({
          id: e.id,
          type: 'select',
          selected: e.id === edge.id,
        }))
      );
    },
    [edges, onEdgesChange]
  );

  // Al mover cualquier clase, distribuir dinámicamente los handles
  // para que múltiples relaciones nunca converjan en el mismo punto ni compartan flecha
  const onNodeDrag = useCallback(() => {
    const currentNodes = useDiagramStore.getState().nodes;
    const currentEdges = useDiagramStore.getState().edges;
    const updatedEdges = distributeEdgeHandles(currentEdges, currentNodes);

    const hasChanges = updatedEdges.some((e, i) => {
      const orig = currentEdges[i];
      return !orig || orig.sourceHandle !== e.sourceHandle || orig.targetHandle !== e.targetHandle;
    });

    if (hasChanges) {
      useDiagramStore.setState({ edges: updatedEdges });
    }
  }, []);

  // Transmitir cambios en el diagrama a los colaboradores en tiempo real
  const isInitialDiagramLoad = useRef(true);
  useEffect(() => {
    if (isInitialDiagramLoad.current) {
      if (nodes.length > 0 || edges.length > 0) {
        isInitialDiagramLoad.current = false;
      }
      return;
    }
    broadcastDiagramChange(nodes, edges);
  }, [nodes, edges, broadcastDiagramChange]);

  // Seguimiento de movimiento del cursor sobre el lienzo en modo conexión y colaboración
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const rawX = e.clientX - bounds.left;
    const rawY = e.clientY - bounds.top;

    if (connectingSourceNodeId) {
      setMousePos({
        x: rawX,
        y: rawY,
      });
    }

    // Transmitir posición del cursor a los colaboradores
    const flowCoords = project({ x: rawX, y: rawY });
    broadcastCursor(flowCoords.x, flowCoords.y);
  };

  // Escuchar movimiento global (mousemove y pointermove) para mantener la línea elástica reactiva
  useEffect(() => {
    if (!connectingSourceNodeId) return;

    const onGlobalMove = (e: MouseEvent | PointerEvent) => {
      if (!reactFlowWrapper.current) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });
    };

    window.addEventListener('mousemove', onGlobalMove);
    window.addEventListener('pointermove', onGlobalMove);
    return () => {
      window.removeEventListener('mousemove', onGlobalMove);
      window.removeEventListener('pointermove', onGlobalMove);
    };
  }, [connectingSourceNodeId]);

  // Coordenadas en pantalla del centro del nodo origen
  const sourceCenter = useMemo(() => {
    if (!connectingSourceNodeId || !reactFlowWrapper.current) return null;
    const sourceEl = document.querySelector(`.react-flow__node[data-id="${connectingSourceNodeId}"]`);
    if (!sourceEl) return null;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const sRect = sourceEl.getBoundingClientRect();
    return {
      x: sRect.left - bounds.left + sRect.width / 2,
      y: sRect.top - bounds.top + sRect.height / 2,
    };
  }, [connectingSourceNodeId, mousePos]);

  // Coordenadas en pantalla del centro del nodo destino hovered
  const targetCenter = useMemo(() => {
    if (!hoveredNodeId || !reactFlowWrapper.current || hoveredNodeId === connectingSourceNodeId) return null;
    const targetEl = document.querySelector(`.react-flow__node[data-id="${hoveredNodeId}"]`);
    if (!targetEl) return null;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    return {
      x: tRect.left - bounds.left + tRect.width / 2,
      y: tRect.top - bounds.top + tRect.height / 2,
    };
  }, [hoveredNodeId, connectingSourceNodeId, mousePos]);

  const rubberEndX = targetCenter ? targetCenter.x : (mousePos ? mousePos.x : (sourceCenter ? sourceCenter.x : 0));
  const rubberEndY = targetCenter ? targetCenter.y : (mousePos ? mousePos.y : (sourceCenter ? sourceCenter.y : 0));

  return (
    <div
      className={`editor-canvas-wrapper ${isRelationActive ? 'in-relation-mode' : ''}`}
      ref={reactFlowWrapper}
      onClick={() => setContextMenu(null)}
      onPointerMove={onCanvasPointerMove}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDrag={onNodeDrag}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2.5}
        // Desplazamiento arriba/abajo con rueda del ratón (sin hacer zoom completo)
        panOnScroll={true}
        panOnScrollSpeed={1.2}
        zoomOnScroll={false}
        zoomOnPinch={true}
        // Configuración para arrastre individual y libre de clases
        panOnDrag={[1, 2]} // Clic derecho o rueda para mover el lienzo
        selectionOnDrag={false} // Evita multi-selección accidental al arrastrar
        selectNodesOnDrag={false}
        nodesDraggable={true} // Permite mover la clase libremente a cualquier lado
        elementsSelectable={true}
        connectionRadius={35}
        connectionLineStyle={{ stroke: '#000000', strokeWidth: 1.8 }}
        defaultEdgeOptions={{
          type: 'umlEdge',
        }}
      >
        <Background color="#cbd5e1" gap={24} size={1.2} />
        <Controls position="bottom-right" className="editor-flow-controls" />
        <RemoteCursors cursors={remoteCursors} />
      </ReactFlow>

      {/* Capa de conexión interactiva en tiempo real estilo StarUML */}
      {connectingSourceNodeId && sourceCenter && (
        <svg
          className="staruml-connection-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          {/* Línea elástica azul */}
          <line
            x1={sourceCenter.x}
            y1={sourceCenter.y}
            x2={rubberEndX}
            y2={rubberEndY}
            stroke="#3b82f6"
            strokeWidth="1.8"
          />

          {/* Círculo azul en el centro de la clase origen */}
          <circle
            cx={sourceCenter.x}
            cy={sourceCenter.y}
            r="6"
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="2"
          />

          {/* Círculo azul en el extremo de la línea (o centro de la clase destino) */}
          <circle
            cx={rubberEndX}
            cy={rubberEndY}
            r="6"
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth="2"
          />
        </svg>
      )}

      {/* Menú contextual al hacer clic derecho en una relación */}
      {contextMenu && (
        <div
          className="edge-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            <span>Relación {contextMenu.label ? `(${contextMenu.label})` : 'UML'}</span>
          </div>
          <button
            type="button"
            className="context-menu-item delete"
            onClick={() => handleDeleteEdgeFromContext(contextMenu.edgeId)}
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Eliminar relación</span>
          </button>
        </div>
      )}

      {/* Menú contextual al hacer clic derecho en un texto */}
      {nodeContextMenu && (
        <div
          className="edge-context-menu"
          style={{ top: nodeContextMenu.y, left: nodeContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            <span>Texto</span>
          </div>
          <button
            type="button"
            className="context-menu-item delete"
            onClick={() => handleDeleteNodeFromContext(nodeContextMenu.nodeId)}
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Eliminar texto</span>
          </button>
        </div>
      )}
    </div>
  );
};

export const ClassDiagramEditor: React.FC = () => {
  const { activeProjectId } = useNavigationStore();
  const { loadProjectDiagram, isLoading, nodes } = useDiagramStore();
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);

  // Activación del auto-guardado inteligente (debounce de 1500ms)
  useAutoSave(1500);

  useEffect(() => {
    if (activeProjectId) {
      loadProjectDiagram(activeProjectId).catch(() => {
        toast.error('No se pudo cargar el diagrama del proyecto');
      });
    }
  }, [activeProjectId, loadProjectDiagram]);

  if (isLoading && nodes.length === 0) {
    return (
      <div className="editor-loading-screen">
        <div className="spinner"></div>
        <p>Cargando lienzo de modelado UML...</p>
      </div>
    );
  }

  return (
    <div className="uml-editor-root">
      <EditorHeader
        isAiPanelOpen={isAiPanelOpen}
        onToggleAiPanel={() => setIsAiPanelOpen(!isAiPanelOpen)}
      />
      <div className={`editor-body-layout ${isAiPanelOpen ? 'ai-panel-open' : ''}`}>
        <ToolSidebar />
        <ReactFlowProvider>
          <EditorCanvas />
        </ReactFlowProvider>
        <AiAssistantPanel
          isOpen={isAiPanelOpen}
          onClose={() => setIsAiPanelOpen(false)}
        />
      </div>
    </div>
  );
};
