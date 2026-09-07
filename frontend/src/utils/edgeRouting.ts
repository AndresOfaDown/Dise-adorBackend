import type { Edge, Node } from 'reactflow';
import { getNodeDimensions } from './edgeGeometry';

/**
 * Distribuye inteligentemente los puntos de anclaje (handles) de origen y destino
 * para todas las relaciones del diagrama UML.
 *
 * Resuelve el problema donde múltiples relaciones hacia una misma clase
 * convergen en el mismo punto central y se superponen o comparten flecha.
 *
 * Garantiza:
 * 1. Múltiples relaciones que llegan o salen del mismo lado (arriba, abajo, izquierda, derecha)
 *    se distribuyen entre las esquinas y el centro (left, center, right).
 * 2. Cada relación mantiene su propio punto de entrada exclusivo, su propia flecha y multiplicidad.
 * 3. Las líneas de relaciones distintas no se enciman ni se funden entre sí.
 */
export function distributeEdgeHandles(edges: Edge[], nodes: Node[]): Edge[] {
  if (!edges || edges.length === 0 || !nodes || nodes.length === 0) {
    return edges;
  }

  // Mapa rápido de nodos por ID
  const nodeMap = new Map<string, Node>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // 1. Agrupar edges por nodo destino y por lado de llegada
  // targetNodeId -> side ('top' | 'bottom' | 'left' | 'right') -> Edge[]
  const targetSideGroups = new Map<string, Map<'top' | 'bottom' | 'left' | 'right', Edge[]>>();

  // 2. Agrupar edges por nodo origen y por lado de salida
  // sourceNodeId -> side ('top' | 'bottom' | 'left' | 'right') -> Edge[]
  const sourceSideGroups = new Map<string, Map<'top' | 'bottom' | 'left' | 'right', Edge[]>>();

  // Clasificar cada edge según la dirección geométrica entre source y target
  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceDims = getNodeDimensions(sourceNode);
    const targetDims = getNodeDimensions(targetNode);

    const sourceCenterX = sourceNode.position.x + sourceDims.width / 2;
    const sourceCenterY = sourceNode.position.y + sourceDims.height / 2;
    const targetCenterX = targetNode.position.x + targetDims.width / 2;
    const targetCenterY = targetNode.position.y + targetDims.height / 2;

    const dx = targetCenterX - sourceCenterX; // positivo: target está a la derecha de source
    const dy = targetCenterY - sourceCenterY; // positivo: target está debajo de source

    // Lado por el que entra al TARGET:
    // Si dy < 0 (source está debajo de target): entra por 'bottom' del target
    // Si dy > 0 (source está arriba de target): entra por 'top' del target
    // Si dx < 0 (source está a la derecha de target): entra por 'right' del target
    // Si dx > 0 (source está a la izquierda de target): entra por 'left' del target
    let targetSide: 'top' | 'bottom' | 'left' | 'right';
    let sourceSide: 'top' | 'bottom' | 'left' | 'right';

    if (Math.abs(dy) * 1.1 >= Math.abs(dx)) {
      if (dy < 0) {
        targetSide = 'bottom';
        sourceSide = 'top';
      } else {
        targetSide = 'top';
        sourceSide = 'bottom';
      }
    } else {
      if (dx < 0) {
        targetSide = 'right';
        sourceSide = 'left';
      } else {
        targetSide = 'left';
        sourceSide = 'right';
      }
    }

    // Registrar en targetSideGroups
    if (!targetSideGroups.has(targetNode.id)) {
      targetSideGroups.set(targetNode.id, new Map());
    }
    const tMap = targetSideGroups.get(targetNode.id)!;
    if (!tMap.has(targetSide)) {
      tMap.set(targetSide, []);
    }
    tMap.get(targetSide)!.push(edge);

    // Registrar en sourceSideGroups
    if (!sourceSideGroups.has(sourceNode.id)) {
      sourceSideGroups.set(sourceNode.id, new Map());
    }
    const sMap = sourceSideGroups.get(sourceNode.id)!;
    if (!sMap.has(sourceSide)) {
      sMap.set(sourceSide, []);
    }
    sMap.get(sourceSide)!.push(edge);
  }

  // Mapa de asignaciones finales: edgeId -> { sourceHandle, targetHandle }
  const assignedHandles = new Map<string, { sourceHandle?: string; targetHandle?: string }>();

  // Asignar TARGET handles distribuidos
  targetSideGroups.forEach((sideMap, targetNodeId) => {
    const targetNode = nodeMap.get(targetNodeId);
    if (!targetNode) return;
    const targetDims = getNodeDimensions(targetNode);
    const targetWidth = targetDims.width;
    const targetCenterX = targetNode.position.x + targetWidth / 2;
    const targetHeight = targetDims.height;
    const targetCenterY = targetNode.position.y + targetHeight / 2;

    sideMap.forEach((groupEdges, side) => {
      if (side === 'bottom' || side === 'top') {
        // Ordenar los edges por posición X del nodo origen (de izquierda a derecha)
        groupEdges.sort((a, b) => {
          const sA = nodeMap.get(a.source);
          const sB = nodeMap.get(b.source);
          const xA = sA ? sA.position.x : 0;
          const xB = sB ? sB.position.x : 0;
          return xA - xB;
        });

        const prefix = side === 'bottom' ? 'bottom' : 'top';

        if (groupEdges.length === 1) {
          const s = nodeMap.get(groupEdges[0].source);
          const sDims = s ? getNodeDimensions(s) : null;
          const sX = s && sDims ? s.position.x + sDims.width / 2 : targetCenterX;
          const diffX = sX - targetCenterX;
          let h = `${prefix}-t`;
          if (diffX < -35) h = `${prefix}-left-t`;
          else if (diffX > 35) h = `${prefix}-right-t`;

          const existing = assignedHandles.get(groupEdges[0].id) || {};
          assignedHandles.set(groupEdges[0].id, { ...existing, targetHandle: h });
        } else if (groupEdges.length === 2) {
          // El de la izquierda a la esquina izquierda, el de la derecha a la esquina derecha
          const leftHandle = `${prefix}-left-t`;
          const rightHandle = `${prefix}-right-t`;

          const existing0 = assignedHandles.get(groupEdges[0].id) || {};
          assignedHandles.set(groupEdges[0].id, { ...existing0, targetHandle: leftHandle });

          const existing1 = assignedHandles.get(groupEdges[1].id) || {};
          assignedHandles.set(groupEdges[1].id, { ...existing1, targetHandle: rightHandle });
        } else {
          // 3 o más edges en el mismo lado
          const leftHandle = `${prefix}-left-t`;
          const centerHandle = `${prefix}-t`;
          const rightHandle = `${prefix}-right-t`;

          groupEdges.forEach((e, idx) => {
            let h = centerHandle;
            if (idx === 0) h = leftHandle;
            else if (idx === groupEdges.length - 1) h = rightHandle;
            else h = centerHandle;

            const existing = assignedHandles.get(e.id) || {};
            assignedHandles.set(e.id, { ...existing, targetHandle: h });
          });
        }
      } else {
        // side === 'left' || side === 'right'
        // Ordenar los edges por posición Y del nodo origen (de arriba a abajo)
        groupEdges.sort((a, b) => {
          const sA = nodeMap.get(a.source);
          const sB = nodeMap.get(b.source);
          const yA = sA ? sA.position.y : 0;
          const yB = sB ? sB.position.y : 0;
          return yA - yB;
        });

        const isLeft = side === 'left';

        if (groupEdges.length === 1) {
          const s = nodeMap.get(groupEdges[0].source);
          const sDims = s ? getNodeDimensions(s) : null;
          const sY = s && sDims ? s.position.y + sDims.height / 2 : targetCenterY;
          const diffY = sY - targetCenterY;
          let h = isLeft ? 'left-t' : 'right-t';
          if (diffY < -35) h = isLeft ? 'top-left-t' : 'top-right-t';
          else if (diffY > 35) h = isLeft ? 'bottom-left-t' : 'bottom-right-t';

          const existing = assignedHandles.get(groupEdges[0].id) || {};
          assignedHandles.set(groupEdges[0].id, { ...existing, targetHandle: h });
        } else if (groupEdges.length === 2) {
          const topH = isLeft ? 'top-left-t' : 'top-right-t';
          const bottomH = isLeft ? 'bottom-left-t' : 'bottom-right-t';

          const existing0 = assignedHandles.get(groupEdges[0].id) || {};
          assignedHandles.set(groupEdges[0].id, { ...existing0, targetHandle: topH });

          const existing1 = assignedHandles.get(groupEdges[1].id) || {};
          assignedHandles.set(groupEdges[1].id, { ...existing1, targetHandle: bottomH });
        } else {
          const topH = isLeft ? 'top-left-t' : 'top-right-t';
          const midH = isLeft ? 'left-t' : 'right-t';
          const bottomH = isLeft ? 'bottom-left-t' : 'bottom-right-t';

          groupEdges.forEach((e, idx) => {
            let h = midH;
            if (idx === 0) h = topH;
            else if (idx === groupEdges.length - 1) h = bottomH;
            else h = midH;

            const existing = assignedHandles.get(e.id) || {};
            assignedHandles.set(e.id, { ...existing, targetHandle: h });
          });
        }
      }
    });
  });

  // Asignar SOURCE handles distribuidos
  sourceSideGroups.forEach((sideMap, sourceNodeId) => {
    const sourceNode = nodeMap.get(sourceNodeId);
    if (!sourceNode) return;
    const sourceDims = getNodeDimensions(sourceNode);
    const sourceWidth = sourceDims.width;
    const sourceCenterX = sourceNode.position.x + sourceWidth / 2;
    const sourceHeight = sourceDims.height;
    const sourceCenterY = sourceNode.position.y + sourceHeight / 2;

    sideMap.forEach((groupEdges, side) => {
      if (side === 'top' || side === 'bottom') {
        // Ordenar por posición X del target (de izquierda a derecha)
        groupEdges.sort((a, b) => {
          const tA = nodeMap.get(a.target);
          const tB = nodeMap.get(b.target);
          const xA = tA ? tA.position.x : 0;
          const xB = tB ? tB.position.x : 0;
          return xA - xB;
        });

        const prefix = side === 'top' ? 'top' : 'bottom';

        if (groupEdges.length === 1) {
          const t = nodeMap.get(groupEdges[0].target);
          const tDims = t ? getNodeDimensions(t) : null;
          const tX = t && tDims ? t.position.x + tDims.width / 2 : sourceCenterX;
          const diffX = tX - sourceCenterX;
          let h = `${prefix}-s`;
          if (diffX < -35) h = `${prefix}-left-s`;
          else if (diffX > 35) h = `${prefix}-right-s`;

          const existing = assignedHandles.get(groupEdges[0].id) || {};
          assignedHandles.set(groupEdges[0].id, { ...existing, sourceHandle: h });
        } else if (groupEdges.length === 2) {
          const leftH = `${prefix}-left-s`;
          const rightH = `${prefix}-right-s`;

          const existing0 = assignedHandles.get(groupEdges[0].id) || {};
          assignedHandles.set(groupEdges[0].id, { ...existing0, sourceHandle: leftH });

          const existing1 = assignedHandles.get(groupEdges[1].id) || {};
          assignedHandles.set(groupEdges[1].id, { ...existing1, sourceHandle: rightH });
        } else {
          const leftH = `${prefix}-left-s`;
          const midH = `${prefix}-s`;
          const rightH = `${prefix}-right-s`;

          groupEdges.forEach((e, idx) => {
            let h = midH;
            if (idx === 0) h = leftH;
            else if (idx === groupEdges.length - 1) h = rightH;
            else h = midH;

            const existing = assignedHandles.get(e.id) || {};
            assignedHandles.set(e.id, { ...existing, sourceHandle: h });
          });
        }
      } else {
        // side === 'left' || side === 'right'
        // Ordenar por posición Y del target (de arriba a abajo)
        groupEdges.sort((a, b) => {
          const tA = nodeMap.get(a.target);
          const tB = nodeMap.get(b.target);
          const yA = tA ? tA.position.y : 0;
          const yB = tB ? tB.position.y : 0;
          return yA - yB;
        });

        const isLeft = side === 'left';

        if (groupEdges.length === 1) {
          const t = nodeMap.get(groupEdges[0].target);
          const tDims = t ? getNodeDimensions(t) : null;
          const tY = t && tDims ? t.position.y + tDims.height / 2 : sourceCenterY;
          const diffY = tY - sourceCenterY;
          let h = isLeft ? 'left-s' : 'right-s';
          if (diffY < -35) h = isLeft ? 'top-left-s' : 'top-right-s';
          else if (diffY > 35) h = isLeft ? 'bottom-left-s' : 'bottom-right-s';

          const existing = assignedHandles.get(groupEdges[0].id) || {};
          assignedHandles.set(groupEdges[0].id, { ...existing, sourceHandle: h });
        } else if (groupEdges.length === 2) {
          const topH = isLeft ? 'top-left-s' : 'top-right-s';
          const bottomH = isLeft ? 'bottom-left-s' : 'bottom-right-s';

          const existing0 = assignedHandles.get(groupEdges[0].id) || {};
          assignedHandles.set(groupEdges[0].id, { ...existing0, sourceHandle: topH });

          const existing1 = assignedHandles.get(groupEdges[1].id) || {};
          assignedHandles.set(groupEdges[1].id, { ...existing1, sourceHandle: bottomH });
        } else {
          const topH = isLeft ? 'top-left-s' : 'top-right-s';
          const midH = isLeft ? 'left-s' : 'right-s';
          const bottomH = isLeft ? 'bottom-left-s' : 'bottom-right-s';

          groupEdges.forEach((e, idx) => {
            let h = midH;
            if (idx === 0) h = topH;
            else if (idx === groupEdges.length - 1) h = bottomH;
            else h = midH;

            const existing = assignedHandles.get(e.id) || {};
            assignedHandles.set(e.id, { ...existing, sourceHandle: h });
          });
        }
      }
    });
  });

  // Retornar edges actualizados con los handles no superpuestos
  return edges.map((e) => {
    const assigned = assignedHandles.get(e.id);
    if (!assigned) return e;

    const sourceHandle = assigned.sourceHandle || e.sourceHandle || 'right-s';
    const targetHandle = assigned.targetHandle || e.targetHandle || 'left-t';

    if (e.sourceHandle !== sourceHandle || e.targetHandle !== targetHandle) {
      return {
        ...e,
        sourceHandle,
        targetHandle,
      };
    }
    return e;
  });
}
