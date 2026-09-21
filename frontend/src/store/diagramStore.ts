import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import { projectsApi } from '../api/projects';
import { distributeEdgeHandles } from '../utils/edgeRouting';
import toast from 'react-hot-toast';

export type UmlRelationType =
  | 'association'
  | 'aggregation'
  | 'composition'
  | 'dependency'
  | 'generalization'
  | 'inheritance'
  | 'associationClass';

export type ToolType =
  | 'select'
  | 'class'
  | 'text'
  | UmlRelationType;

export interface UmlAttribute {
  id: string;
  visibility: '+' | '-' | '#' | '~';
  name: string;
  type: string;
}

export interface UmlMethod {
  id: string;
  visibility: '+' | '-' | '#' | '~';
  name: string;
  parameters: string;
  returnType: string;
}

export interface UmlClassNodeData {
  name: string;
  stereotype: string;
  attributes: UmlAttribute[];
  methods: UmlMethod[];
}

export interface UmlTextNodeData {
  text: string;
}

export interface Collaborator {
  clientId: string;
  username: string;
  color: string;
}

interface DiagramState {
  projectId: number | null;
  projectName: string;
  nodes: Node<any>[];
  edges: Edge[];
  selectedTool: ToolType;
  connectingSourceNodeId: string | null;
  hoveredNodeId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  isAutoSaving: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
  collaborators: Collaborator[];
  isSocketConnected: boolean;

  // Actions
  setProjectId: (id: number) => void;
  setProjectName: (name: string) => void;
  setSelectedTool: (tool: ToolType) => void;
  setConnectingSourceNodeId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  setCollaborators: (collaborators: Collaborator[]) => void;
  setIsSocketConnected: (isConnected: boolean) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  connectTwoNodes: (sourceId: string, targetId: string) => void;
  updateEdgeData: (edgeId: string, partial: any) => void;
  addClassNode: (position: { x: number; y: number }) => void;
  addTextNode: (position: { x: number; y: number }, initialText?: string) => void;
  updateNodeData: (nodeId: string, partialData: Partial<UmlClassNodeData>) => void;
  updateTextNodeData: (nodeId: string, text: string) => void;
  deleteNode: (nodeId: string) => void;
  loadProjectDiagram: (projectId: number) => Promise<void>;
  saveCurrentDiagram: (isAutoSave?: boolean) => Promise<void>;
  resetDiagram: () => void;
  clearDiagram: () => void;
  importDiagramFromAi: (
    detectedClasses: { name: string; stereotype?: string; attributes: string[]; methods: string[]; position?: { x: number; y: number } }[],
    detectedRelations?: { source: string; target: string; type?: UmlRelationType; sourceMultiplicity?: string; targetMultiplicity?: string; label?: string; associationClassName?: string }[],
    mode?: 'replace' | 'append'
  ) => void;
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  projectId: null,
  projectName: 'com.example.uml',
  nodes: [],
  edges: [],
  selectedTool: 'select',
  connectingSourceNodeId: null,
  hoveredNodeId: null,
  isLoading: false,
  isSaving: false,
  isAutoSaving: false,
  hasUnsavedChanges: false,
  lastSaved: null,
  collaborators: [],
  isSocketConnected: false,

  setProjectId: (id) => set({ projectId: id }),
  setProjectName: (name) => set({ projectName: name }),
  setSelectedTool: (tool) => set({ selectedTool: tool, connectingSourceNodeId: null, hoveredNodeId: null }),
  setConnectingSourceNodeId: (id) => set({ connectingSourceNodeId: id }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setHasUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
  setCollaborators: (collaborators) => set({ collaborators }),
  setIsSocketConnected: (isSocketConnected) => set({ isSocketConnected }),

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection) => {
    if (!connection.source || !connection.target) return;

    const { selectedTool, connectTwoNodes } = get();

    if (selectedTool === 'associationClass') {
      connectTwoNodes(connection.source, connection.target);
      return;
    }

    const relationType: UmlRelationType =
      selectedTool === 'select' || selectedTool === 'class' || selectedTool === 'text'
        ? 'association'
        : (selectedTool as UmlRelationType);

    const newEdge: Edge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      type: 'umlEdge',
      data: {
        relationType,
        sourceMultiplicity: '',
        targetMultiplicity: '',
        label: '',
      },
    };

    const combined = addEdge(newEdge, get().edges);
    const distributed = distributeEdgeHandles(combined, get().nodes);

    set({
      edges: distributed,
      connectingSourceNodeId: null,
      selectedTool: 'select',
    });
  },

  connectTwoNodes: (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;

    const { selectedTool, edges, nodes } = get();

    // Caso especial: Asociación de clases (UML canónico: línea directa entre las 2 clases y rama discontinua hacia la clase intermedia)
    if (selectedTool === 'associationClass') {
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);
      if (!sourceNode || !targetNode) return;

      const sourceName = sourceNode.data?.name || 'clase1';
      const targetName = targetNode.data?.name || 'clase2';
      const assocCount = nodes.filter(
        (n) => n.data?.name?.startsWith('AssociationClass') || n.data?.name?.includes('_')
      ).length + 1;
      const intermediateId = `class_assoc_${Date.now()}`;
      const intermediateName = `AssociationClass${assocCount}`;

      // Posicionar la clase intermedia centrada abajo de la relación entre ambas entidades
      const midX = Math.round((sourceNode.position.x + targetNode.position.x) / 2);
      const midY = Math.round(Math.max(sourceNode.position.y, targetNode.position.y) + 160);

      const intermediateNode: Node<UmlClassNodeData> = {
        id: intermediateId,
        type: 'umlClass',
        position: { x: midX, y: midY },
        data: {
          name: intermediateName,
          stereotype: '',
          attributes: [
            { id: `attr_${Date.now()}_1`, visibility: '+', name: 'id', type: 'int' },
            { id: `attr_${Date.now()}_2`, visibility: '+', name: `${sourceName.toLowerCase()}_id`, type: 'int' },
            { id: `attr_${Date.now()}_3`, visibility: '+', name: `${targetName.toLowerCase()}_id`, type: 'int' },
          ],
          methods: [],
        },
      };

      const dx = targetNode.position.x - sourceNode.position.x;
      const dy = targetNode.position.y - sourceNode.position.y;
      let sourceHandle = 'right-s';
      let targetHandle = 'left-t';

      if (Math.abs(dx) >= Math.abs(dy)) {
        sourceHandle = dx >= 0 ? 'right-s' : 'left-s';
        targetHandle = dx >= 0 ? 'left-t' : 'right-t';
      } else {
        sourceHandle = dy >= 0 ? 'bottom-s' : 'top-s';
        targetHandle = dy >= 0 ? 'top-t' : 'bottom-t';
      }

      // Línea principal entre las dos clases, con referencia a la clase intermedia
      const mainEdge: Edge = {
        id: `edge_assoc_${Date.now()}`,
        source: sourceId,
        target: targetId,
        sourceHandle,
        targetHandle,
        type: 'umlEdge',
        data: {
          relationType: 'associationClass',
          associationClassId: intermediateId,
          sourceMultiplicity: '',
          targetMultiplicity: '',
          label: '',
        },
      };

      toast.success(`Clase de asociación "${intermediateName}" generada`);

      const allNodes = [...nodes, intermediateNode];
      const combined = addEdge(mainEdge, edges);
      const distributed = distributeEdgeHandles(combined, allNodes);

      set({
        nodes: allNodes,
        edges: distributed,
        connectingSourceNodeId: null,
        selectedTool: 'select',
      });
      return;
    }

    const relationType: UmlRelationType =
      selectedTool === 'select' || selectedTool === 'class' || selectedTool === 'text'
        ? 'association'
        : (selectedTool as UmlRelationType);

    const sourceNode = nodes.find((n) => n.id === sourceId);
    const targetNode = nodes.find((n) => n.id === targetId);

    let sourceHandle = 'right-s';
    let targetHandle = 'left-t';

    if (sourceNode && targetNode) {
      const dx = targetNode.position.x - sourceNode.position.x;
      const dy = targetNode.position.y - sourceNode.position.y;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      if (angle >= -22.5 && angle < 22.5) {
        sourceHandle = 'right-s';
        targetHandle = 'left-t';
      } else if (angle >= 22.5 && angle < 67.5) {
        sourceHandle = 'bottom-right-s';
        targetHandle = 'top-left-t';
      } else if (angle >= 67.5 && angle < 112.5) {
        sourceHandle = 'bottom-s';
        targetHandle = 'top-t';
      } else if (angle >= 112.5 && angle < 157.5) {
        sourceHandle = 'bottom-left-s';
        targetHandle = 'top-right-t';
      } else if (angle >= -67.5 && angle < -22.5) {
        sourceHandle = 'top-right-s';
        targetHandle = 'bottom-left-t';
      } else if (angle >= -112.5 && angle < -67.5) {
        sourceHandle = 'top-s';
        targetHandle = 'bottom-t';
      } else if (angle >= -157.5 && angle < -112.5) {
        sourceHandle = 'top-left-s';
        targetHandle = 'bottom-right-t';
      } else {
        sourceHandle = 'left-s';
        targetHandle = 'right-t';
      }
    }

    const newEdge: Edge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      source: sourceId,
      target: targetId,
      sourceHandle,
      targetHandle,
      type: 'umlEdge',
      data: {
        relationType,
        sourceMultiplicity: '',
        targetMultiplicity: '',
        label: '',
      },
    };

    const combined = [...edges, newEdge];
    const distributed = distributeEdgeHandles(combined, nodes);

    set({
      edges: distributed,
      connectingSourceNodeId: null,
      hoveredNodeId: null,
      selectedTool: 'select',
      hasUnsavedChanges: true,
    });
  },

  updateEdgeData: (edgeId: string, partial: any) => {
    set({
      edges: get().edges.map((e) =>
        e.id === edgeId ? { ...e, data: { ...e.data, ...partial } } : e
      ),
    });
  },

  addClassNode: (position) => {
    const newId = `class_${Date.now()}`;
    const classCount = get().nodes.filter((n) => n.type === 'umlClass').length + 1;
    const newNode: Node<UmlClassNodeData> = {
      id: newId,
      type: 'umlClass',
      position,
      data: {
        name: classCount === 1 ? 'Entidad' : `Entidad${classCount}`,
        stereotype: '',
        attributes: [
          { id: '1', visibility: '+', name: 'id', type: 'int' },
          { id: '2', visibility: '+', name: 'nombre', type: 'string' },
        ],
        methods: [
          { id: '1', visibility: '+', name: 'crear', parameters: '', returnType: '' },
          { id: '2', visibility: '+', name: 'eliminar', parameters: '', returnType: '' },
        ],
      },
    };

    set({
      nodes: [...get().nodes, newNode],
      selectedTool: 'select', // Vuelve al modo seleccionar tras agregar
    });
  },

  addTextNode: (position, initialText = 'texto') => {
    const newId = `text_${Date.now()}`;
    const unselectedNodes = get().nodes.map((n) => ({ ...n, selected: false }));
    const newNode: Node<UmlTextNodeData> = {
      id: newId,
      type: 'umlText',
      position,
      selected: true,
      data: {
        text: initialText,
      },
    };

    set({
      nodes: [...unselectedNodes, newNode],
      selectedTool: 'select',
    });
  },

  updateTextNodeData: (nodeId, text) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              text,
            },
          };
        }
        return node;
      }),
    });
  },

  updateNodeData: (nodeId, partialData) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, ...partialData },
          };
        }
        return node;
      }),
    });
  },

  deleteNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    });
  },

  loadProjectDiagram: async (projectId: number) => {
    try {
      set({ isLoading: true, projectId });
      const data = await projectsApi.getDiagrama(projectId);
      const diagram = data.diagrama;
      const loadedNodes = diagram.nodes || [];
      const loadedEdges = distributeEdgeHandles(diagram.edges || [], loadedNodes);
      set({
        projectName: data.proyecto.package_base,
        nodes: loadedNodes,
        edges: loadedEdges,
        isLoading: false,
        lastSaved: new Date(),
        hasUnsavedChanges: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  saveCurrentDiagram: async (isAutoSave: boolean = false) => {
    let { projectId, nodes, edges, projectName } = get();
    if (!projectId) {
      try {
        const created = await projectsApi.create(projectName || 'com.example.uml');
        projectId = created.proyecto.id;
        set({ projectId: created.proyecto.id });
      } catch (error) {
        return;
      }
    }

    try {
      if (isAutoSave) {
        set({ isAutoSaving: true });
      } else {
        set({ isSaving: true });
      }

      await projectsApi.saveDiagrama(projectId, {
        nodes,
        edges,
        package_base: projectName,
      });

      set({
        isSaving: false,
        isAutoSaving: false,
        lastSaved: new Date(),
        hasUnsavedChanges: false,
      });
    } catch (error) {
      set({ isSaving: false, isAutoSaving: false });
      throw error;
    }
  },

  resetDiagram: () => {
    set({
      projectId: null,
      projectName: 'com.example.uml',
      nodes: [],
      edges: [],
      selectedTool: 'select',
      lastSaved: null,
      isAutoSaving: false,
      hasUnsavedChanges: false,
    });
  },

  clearDiagram: () => {
    set({
      nodes: [],
      edges: [],
      connectingSourceNodeId: null,
      hoveredNodeId: null,
      selectedTool: 'select',
      hasUnsavedChanges: true,
    });
  },

  importDiagramFromAi: (detectedClasses, detectedRelations = [], mode = 'replace') => {
    const state = get();
    const classIdMap: Record<string, string> = {};
    const newNodes: Node<UmlClassNodeData>[] = [];

    // Si es modo append, pre-poblar classIdMap con las clases existentes
    if (mode === 'append') {
      state.nodes.forEach((n) => {
        if (n.type === 'umlClass' && n.data?.name) {
          classIdMap[n.data.name.toLowerCase().trim()] = n.id;
        }
      });
    }

    // Si es modo append, calculamos el offset respecto a los nodos existentes
    let offsetX = 100;
    let offsetY = 100;
    if (mode === 'append' && state.nodes.length > 0) {
      const maxX = Math.max(...state.nodes.map((n) => n.position.x));
      offsetX = maxX + 360;
    }

    detectedClasses.forEach((cls, index) => {
      const nodeId = `class_ai_${Date.now()}_${index}`;
      classIdMap[cls.name.toLowerCase().trim()] = nodeId;

      let x = offsetX;
      let y = offsetY;

      if (cls.position && typeof cls.position.x === 'number' && typeof cls.position.y === 'number') {
        x = offsetX + (cls.position.x - 100);
        y = offsetY + (cls.position.y - 100);
      } else {
        const col = index % 2;
        const row = Math.floor(index / 2);
        x = offsetX + col * 360;
        y = offsetY + row * 260;
      }

      const formattedAttributes: UmlAttribute[] = (cls.attributes || []).map((attrStr, aIdx) => {
        let visibility: '+' | '-' | '#' | '~' = '+';
        let cleanStr = attrStr.trim();
        if (cleanStr.startsWith('+') || cleanStr.startsWith('-') || cleanStr.startsWith('#') || cleanStr.startsWith('~')) {
          visibility = cleanStr[0] as any;
          cleanStr = cleanStr.slice(1).trim();
        }
        const colonIdx = cleanStr.indexOf(':');
        const rawName = colonIdx !== -1 ? cleanStr.substring(0, colonIdx).trim() : cleanStr;
        let rawType = colonIdx !== -1 ? cleanStr.substring(colonIdx + 1).trim() : 'string';
        if (!rawType || rawType.toLowerCase() === 'uml' || rawType.toLowerCase().startsWith('uml:')) {
          rawType = 'string';
        }
        return {
          id: `attr_${aIdx}_${Date.now()}`,
          visibility,
          name: rawName,
          type: rawType,
        };
      });

      const formattedMethods: UmlMethod[] = (cls.methods || []).map((methodStr, mIdx) => {
        let visibility: '+' | '-' | '#' | '~' = '+';
        let cleanStr = methodStr.trim();
        if (cleanStr.startsWith('+') || cleanStr.startsWith('-') || cleanStr.startsWith('#') || cleanStr.startsWith('~')) {
          visibility = cleanStr[0] as any;
          cleanStr = cleanStr.slice(1).trim();
        }
        return {
          id: `meth_${mIdx}_${Date.now()}`,
          visibility,
          name: cleanStr.replace(/;$/, '').trim(),
          parameters: '',
          returnType: '',
        };
      });

      newNodes.push({
        id: nodeId,
        type: 'umlClass',
        position: { x, y },
        data: {
          name: cls.name,
          stereotype: cls.stereotype || '',
          attributes: formattedAttributes,
          methods: formattedMethods,
        },
      });
    });

    const workingEdges = mode === 'append' ? [...state.edges] : [];
    const newEdges: Edge[] = [];

    detectedRelations.forEach((rel, index) => {
      const sourceId = classIdMap[rel.source.toLowerCase().trim()];
      const targetId = classIdMap[rel.target.toLowerCase().trim()];

      if (sourceId && targetId) {
        let intermediateId = rel.associationClassName
          ? classIdMap[rel.associationClassName.toLowerCase().trim()]
          : undefined;

        // Si es una relación de muchos a muchos (associationClass) y no existe la clase intermedia, generarla automáticamente
        if (rel.type === 'associationClass' && !intermediateId) {
          const allNodesSoFar = mode === 'append' ? [...state.nodes, ...newNodes] : newNodes;
          const sourceNode = allNodesSoFar.find((n) => n.id === sourceId);
          const targetNode = allNodesSoFar.find((n) => n.id === targetId);
          const sourceName = sourceNode?.data?.name || rel.source;
          const targetName = targetNode?.data?.name || rel.target;
          const intermediateName = rel.associationClassName || `${sourceName}_${targetName}`;

          intermediateId = `class_assoc_${Date.now()}_${index}`;
          classIdMap[intermediateName.toLowerCase().trim()] = intermediateId;

          const midX = sourceNode && targetNode ? Math.round((sourceNode.position.x + targetNode.position.x) / 2) : 350;
          const midY = sourceNode && targetNode ? Math.round(Math.max(sourceNode.position.y, targetNode.position.y) + 160) : 350;

          newNodes.push({
            id: intermediateId,
            type: 'umlClass',
            position: { x: midX, y: midY },
            data: {
              name: intermediateName,
              stereotype: '',
              attributes: [
                { id: `attr_${Date.now()}_1`, visibility: '+', name: 'id', type: 'int' },
                { id: `attr_${Date.now()}_2`, visibility: '+', name: `${sourceName.toLowerCase()}_id`, type: 'int' },
                { id: `attr_${Date.now()}_3`, visibility: '+', name: `${targetName.toLowerCase()}_id`, type: 'int' },
              ],
              methods: [],
            },
          });
        }

        // Normalizar multiplicidades (por ejemplo: '1...*' -> '1..*', '*....*' -> '*..*')
        const normSourceMult = (rel.sourceMultiplicity || '').replace(/\.{2,}/g, '..').trim();
        const normTargetMult = (rel.targetMultiplicity || '').replace(/\.{2,}/g, '..').trim();

        // Verificar si ya existe una relación previa entre estos dos nodos en append mode
        const existingIdx = mode === 'append'
          ? workingEdges.findIndex(
              (e) =>
                (e.source === sourceId && e.target === targetId) ||
                (e.source === targetId && e.target === sourceId)
            )
          : -1;

        if (existingIdx !== -1) {
          const existing = workingEdges[existingIdx];
          const isReverse = existing.source === targetId && existing.target === sourceId;
          workingEdges[existingIdx] = {
            ...existing,
            data: {
              ...existing.data,
              relationType: rel.type || existing.data?.relationType || 'association',
              associationClassId: intermediateId !== undefined ? intermediateId : existing.data?.associationClassId,
              sourceMultiplicity: isReverse
                ? normTargetMult || existing.data?.sourceMultiplicity || ''
                : normSourceMult || existing.data?.sourceMultiplicity || '',
              targetMultiplicity: isReverse
                ? normSourceMult || existing.data?.targetMultiplicity || ''
                : normTargetMult || existing.data?.targetMultiplicity || '',
              label: rel.label !== undefined && rel.label !== '' ? rel.label : existing.data?.label || '',
            },
          };
        } else {
          newEdges.push({
            id: `edge_ai_${Date.now()}_${index}`,
            source: sourceId,
            target: targetId,
            type: 'umlEdge',
            data: {
              relationType: rel.type || 'association',
              associationClassId: intermediateId,
              sourceMultiplicity: normSourceMult,
              targetMultiplicity: normTargetMult,
              label: rel.label || '',
            },
          });
        }
      }
    });

    const finalNodes = mode === 'append' ? [...state.nodes, ...newNodes] : newNodes;
    const finalEdges = mode === 'append' ? [...workingEdges, ...newEdges] : newEdges;
    const distributedEdges = distributeEdgeHandles(finalEdges, finalNodes);

    set({
      nodes: finalNodes,
      edges: distributedEdges,
      hasUnsavedChanges: true,
    });
  },
}));


