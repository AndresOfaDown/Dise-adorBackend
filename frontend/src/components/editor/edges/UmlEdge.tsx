import React, { useMemo, useState } from 'react';
import {
  type EdgeProps,
  EdgeLabelRenderer,
  useReactFlow,
} from 'reactflow';
import { useDiagramStore, type UmlRelationType } from '../../../store/diagramStore';
import {
  type Point,
  type Waypoint,
  buildStraightPathFromPoints,
  getNodeDimensions,
  getNodePerimeterIntersection,
  snapPointToNodePerimeter,
  distanceToSegment,
} from '../../../utils/edgeGeometry';
import toast from 'react-hot-toast';

export const UmlEdge: React.FC<EdgeProps> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}) => {
  const { project } = useReactFlow();
  const { onEdgesChange, updateEdgeData } = useDiagramStore();
  const nodes = useDiagramStore((state) => state.nodes);
  const edges = useDiagramStore((state) => state.edges);

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);

  const waypoints: Waypoint[] = data?.waypoints || [];
  const sourceAnchor: any = data?.sourceAnchor;
  const targetAnchor: any = data?.targetAnchor;

  // Estado para arrastre interactivo con vista previa punteada azul (como en StarUML)
  const [draggingState, setDraggingState] = useState<{
    type: 'waypoint' | 'anchor' | 'new-waypoint';
    previewPoints: Point[];
    previewPos?: Point;
  } | null>(null);

  // Por defecto la relación es 100% recta y directa (SIN esquinas ortogonales automáticas).
  // Solo tiene quiebres si el usuario ha modificado la línea agregando waypoints.
  const effectiveWaypoints: Waypoint[] = useMemo(() => {
    return waypoints || [];
  }, [waypoints]);

  // Helper para resolver anclajes (soporta relativos al mover el nodo o absolutos)
  const getResolvedAnchor = (anchor: any, node: any): Point => {
    if (!anchor) return { x: 0, y: 0 };
    if (typeof anchor.relX === 'number' && typeof anchor.relY === 'number' && node) {
      return { x: node.position.x + anchor.relX, y: node.position.y + anchor.relY };
    }
    if (typeof anchor.x === 'number' && typeof anchor.y === 'number') {
      return { x: anchor.x, y: anchor.y };
    }
    return { x: 0, y: 0 };
  };

  // Puntos base por defecto (en caso de que no haya nodos en el canvas)
  let startPoint: Point = { x: sourceX, y: sourceY };
  let endPoint: Point = { x: targetX, y: targetY };

  if (sourceNode && targetNode) {
    const sDims = getNodeDimensions(sourceNode);
    const tDims = getNodeDimensions(targetNode);
    const sCenter = {
      x: sourceNode.position.x + sDims.width / 2,
      y: sourceNode.position.y + sDims.height / 2,
    };
    const tCenter = {
      x: targetNode.position.x + tDims.width / 2,
      y: targetNode.position.y + tDims.height / 2,
    };

    // Punto de origen: anclaje manual > hacia primer waypoint > directo hacia el centro del destino
    if (sourceAnchor) {
      startPoint = getResolvedAnchor(sourceAnchor, sourceNode);
    } else if (effectiveWaypoints.length > 0) {
      startPoint = getNodePerimeterIntersection(sourceNode, effectiveWaypoints[0]);
    } else {
      startPoint = getNodePerimeterIntersection(sourceNode, tCenter);
    }

    // Punto de destino: anclaje manual > hacia último waypoint > directo hacia el centro del origen
    if (targetAnchor) {
      endPoint = getResolvedAnchor(targetAnchor, targetNode);
    } else if (effectiveWaypoints.length > 0) {
      endPoint = getNodePerimeterIntersection(targetNode, effectiveWaypoints[effectiveWaypoints.length - 1]);
    } else {
      endPoint = getNodePerimeterIntersection(targetNode, sCenter);
    }

    // Si existen múltiples relaciones entre el mismo par de clases, separarlas paralelamente
    // para que no se superpongan ni compartan la misma flecha
    const siblingEdges = edges.filter(
      (e) =>
        (e.source === source && e.target === target) ||
        (e.source === target && e.target === source)
    );

    if (
      siblingEdges.length > 1 &&
      !sourceAnchor &&
      !targetAnchor &&
      effectiveWaypoints.length === 0
    ) {
      const edgeIdx = siblingEdges.findIndex((e) => e.id === id);
      if (edgeIdx !== -1) {
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        const dist = Math.hypot(dx, dy) || 1;
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const offset = (edgeIdx - (siblingEdges.length - 1) / 2) * 26;
        startPoint = { x: Math.round(startPoint.x + perpX * offset), y: Math.round(startPoint.y + perpY * offset) };
        endPoint = { x: Math.round(endPoint.x + perpX * offset), y: Math.round(endPoint.y + perpY * offset) };
      }
    }
  } else {
    if (sourceAnchor && sourceNode) startPoint = getResolvedAnchor(sourceAnchor, sourceNode);
    if (targetAnchor && targetNode) endPoint = getResolvedAnchor(targetAnchor, targetNode);
  }

  // Lista ordenada de todos los puntos de la línea: [inicio, ...waypoints, fin]
  const allPoints: Point[] = useMemo(() => {
    return [startPoint, ...effectiveWaypoints, endPoint];
  }, [startPoint, effectiveWaypoints, endPoint]);

  // Construcción de la ruta recta continua y cálculo de punto medio para la etiqueta
  const { path: edgePath, midX: labelX, midY: labelY } = useMemo(() => {
    return buildStraightPathFromPoints(allPoints);
  }, [allPoints]);

  const relationType: UmlRelationType = data?.relationType || 'association';
  const sourceMult = data?.sourceMultiplicity || '';
  const targetMult = data?.targetMultiplicity || '';
  const label = data?.label || '';

  // Buscar clase de asociación vinculada (si aplica)
  const assocNode = data?.associationClassId
    ? nodes.find((n) => n.id === data.associationClassId)
    : null;

  let assocX = labelX;
  let assocY = labelY;
  if (assocNode) {
    const cardWidth = (assocNode as any).measured?.width || 200;
    const cardHeight = (assocNode as any).measured?.height || 110;
    const centerX = assocNode.position.x + cardWidth / 2;

    if (assocNode.position.y >= labelY) {
      assocX = centerX;
      assocY = assocNode.position.y;
    } else {
      assocX = centerX;
      assocY = assocNode.position.y + cardHeight;
    }
  }

  const isDashed = relationType === 'dependency';

  const handleDeleteEdge = () => {
    onEdgesChange([{ id, type: 'remove' }]);
  };

  // Iniciar creación y arrastre interactivo de un nuevo punto de quiebre (como en la Imagen 1)
  const startCreatingWaypointAt = (
    e: React.PointerEvent,
    initialFlowPos: Point,
    segmentIdx: number
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const bounds = document.querySelector('.react-flow')?.getBoundingClientRect();
    if (!bounds) return;

    const newWpId = `wp_${Date.now()}`;
    let currentPos: Point = {
      x: Math.round(initialFlowPos.x),
      y: Math.round(initialFlowPos.y),
    };

    const initialWps = [...effectiveWaypoints];
    let previewWps = [...initialWps];
    previewWps.splice(segmentIdx, 0, { id: newWpId, ...currentPos });

    setDraggingState({
      type: 'new-waypoint',
      previewPoints: [startPoint, ...previewWps, endPoint],
      previewPos: currentPos,
    });

    const onPointerMove = (moveEvt: PointerEvent) => {
      const flowPos = project({
        x: moveEvt.clientX - bounds.left,
        y: moveEvt.clientY - bounds.top,
      });
      currentPos = { x: Math.round(flowPos.x), y: Math.round(flowPos.y) };

      const updatedWps = [...initialWps];
      updatedWps.splice(segmentIdx, 0, { id: newWpId, ...currentPos });

      setDraggingState({
        type: 'new-waypoint',
        previewPoints: [startPoint, ...updatedWps, endPoint],
        previewPos: currentPos,
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      setDraggingState(null);

      const finalWps = [...initialWps];
      finalWps.splice(segmentIdx, 0, { id: newWpId, ...currentPos });
      updateEdgeData(id, { waypoints: finalWps });
      toast.success('Relación modificada');
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Arrastrar waypoint existente con el ratón mostrando vista previa
  const startDraggingWaypoint = (e: React.PointerEvent, wpId: string) => {
    e.stopPropagation();
    e.preventDefault();

    const bounds = document.querySelector('.react-flow')?.getBoundingClientRect();
    if (!bounds) return;

    const wpIndex = effectiveWaypoints.findIndex((w) => w.id === wpId);
    if (wpIndex === -1) return;

    let currentWps = [...effectiveWaypoints];
    let currentPt = { x: currentWps[wpIndex].x, y: currentWps[wpIndex].y };

    setDraggingState({
      type: 'waypoint',
      previewPoints: [startPoint, ...currentWps, endPoint],
      previewPos: currentPt,
    });

    const onPointerMove = (moveEvt: PointerEvent) => {
      const flowPos = project({
        x: moveEvt.clientX - bounds.left,
        y: moveEvt.clientY - bounds.top,
      });
      currentPt = { x: Math.round(flowPos.x), y: Math.round(flowPos.y) };

      currentWps = currentWps.map((w, idx) =>
        idx === wpIndex ? { ...w, ...currentPt } : w
      );

      setDraggingState({
        type: 'waypoint',
        previewPoints: [startPoint, ...currentWps, endPoint],
        previewPos: currentPt,
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      setDraggingState(null);
      updateEdgeData(id, { waypoints: currentWps });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Arrastrar punto de anclaje (en el perímetro de la clase)
  const startDraggingAnchor = (e: React.PointerEvent, type: 'source' | 'target') => {
    e.stopPropagation();
    e.preventDefault();

    const nodeObj = type === 'source' ? sourceNode : targetNode;
    if (!nodeObj) return;

    const bounds = document.querySelector('.react-flow')?.getBoundingClientRect();
    if (!bounds) return;

    let lastSnapped = type === 'source' ? startPoint : endPoint;

    setDraggingState({
      type: 'anchor',
      previewPoints: [
        type === 'source' ? lastSnapped : startPoint,
        ...effectiveWaypoints,
        type === 'target' ? lastSnapped : endPoint,
      ],
      previewPos: lastSnapped,
    });

    const onPointerMove = (moveEvt: PointerEvent) => {
      const flowPos = project({
        x: moveEvt.clientX - bounds.left,
        y: moveEvt.clientY - bounds.top,
      });

      const snapped = snapPointToNodePerimeter(nodeObj, flowPos);
      lastSnapped = { x: Math.round(snapped.x), y: Math.round(snapped.y) };

      const pStart = type === 'source' ? lastSnapped : startPoint;
      const pEnd = type === 'target' ? lastSnapped : endPoint;

      setDraggingState({
        type: 'anchor',
        previewPoints: [pStart, ...effectiveWaypoints, pEnd],
        previewPos: lastSnapped,
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      setDraggingState(null);
      const relX = Math.round(lastSnapped.x - nodeObj.position.x);
      const relY = Math.round(lastSnapped.y - nodeObj.position.y);

      if (type === 'source') {
        updateEdgeData(id, {
          sourceAnchor: { x: lastSnapped.x, y: lastSnapped.y, relX, relY },
        });
      } else {
        updateEdgeData(id, {
          targetAnchor: { x: lastSnapped.x, y: lastSnapped.y, relX, relY },
        });
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Eliminar waypoint
  const removeWaypoint = (wpId: string) => {
    const updated = effectiveWaypoints.filter((w) => w.id !== wpId);
    updateEdgeData(id, { waypoints: updated });
    toast.success('Punto de control eliminado');
  };

  // Cálculo de posición de multiplicidad Origen
  const getSourceLabelPos = () => {
    const nextPt = effectiveWaypoints.length > 0 ? effectiveWaypoints[0] : endPoint;
    const dx = nextPt.x - startPoint.x;
    const dy = nextPt.y - startPoint.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return { x: startPoint.x + (dx > 0 ? 24 : -24), y: startPoint.y - 14 };
    }
    return { x: startPoint.x + 14, y: startPoint.y + (dy > 0 ? 20 : -20) };
  };

  // Cálculo de posición de multiplicidad Destino
  const getTargetLabelPos = () => {
    const prevPt = effectiveWaypoints.length > 0 ? effectiveWaypoints[effectiveWaypoints.length - 1] : startPoint;
    const dx = endPoint.x - prevPt.x;
    const dy = endPoint.y - prevPt.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return { x: endPoint.x + (dx > 0 ? -24 : 24), y: endPoint.y - 14 };
    }
    return { x: endPoint.x + 14, y: endPoint.y + (dy > 0 ? -20 : 20) };
  };

  const sourcePos = getSourceLabelPos();
  const targetPos = getTargetLabelPos();

  return (
    <>
      <defs>
        {/* Herencia / Generalización: Triángulo hueco blanco con borde negro */}
        <marker
          id={`marker-triangle-${id}`}
          markerWidth="14"
          markerHeight="14"
          refX="12"
          refY="7"
          orient="auto"
        >
          <polygon points="2,2 12,7 2,12" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
        </marker>

        {/* Dependencia: Flecha abierta negra bien visible */}
        <marker
          id={`marker-arrow-${id}`}
          markerWidth="14"
          markerHeight="14"
          refX="11"
          refY="6"
          orient="auto"
        >
          <polygon points="1,2 11,6 1,10" fill="#000000" stroke="#000000" strokeWidth="1" />
        </marker>

        {/* Agregación: Rombo hueco blanco con borde negro en el origen */}
        <marker
          id={`marker-diamond-hollow-${id}`}
          markerWidth="18"
          markerHeight="14"
          refX="0"
          refY="7"
          orient="auto"
        >
          <polygon points="0,7 8,2 16,7 8,12" fill="#ffffff" stroke="#000000" strokeWidth="1.8" />
        </marker>

        {/* Composición: Rombo relleno negro en el origen */}
        <marker
          id={`marker-diamond-filled-${id}`}
          markerWidth="18"
          markerHeight="14"
          refX="0"
          refY="7"
          orient="auto"
        >
          <polygon points="0,7 8,2 16,7 8,12" fill="#000000" stroke="#000000" strokeWidth="1.8" />
        </marker>
      </defs>

      {/* Línea interactiva gruesa invisible: permite seleccionar la relación y arrastrar para crear quiebre */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="uml-edge-interactive-hitbox"
        style={{ cursor: selected ? 'crosshair' : 'pointer', pointerEvents: 'stroke' }}
        onClick={(e) => {
          e.stopPropagation();
          onEdgesChange([{ id, type: 'select', selected: true }]);
        }}
        onPointerDown={(e) => {
          if (!selected) return;
          e.stopPropagation();
          const bounds = document.querySelector('.react-flow')?.getBoundingClientRect();
          if (!bounds) return;

          const clickPos = project({
            x: e.clientX - bounds.left,
            y: e.clientY - bounds.top,
          });

          // Encontrar en qué segmento cayó el clic
          let bestIdx = 0;
          let minDist = Infinity;
          for (let i = 0; i < allPoints.length - 1; i++) {
            const d = distanceToSegment(clickPos, allPoints[i], allPoints[i + 1]);
            if (d < minDist) {
              minDist = d;
              bestIdx = i;
            }
          }

          startCreatingWaypointAt(e, clickPos, bestIdx);
        }}
      />

      {/* Línea visible de la relación: recta y continua por defecto */}
      <path
        id={id}
        className={`uml-edge-path ${selected ? 'selected' : ''}`}
        d={edgePath}
        fill="none"
        stroke={selected ? '#2563eb' : '#000000'}
        strokeWidth={selected ? 2.5 : 1.8}
        strokeDasharray={isDashed ? '6,4' : undefined}
        markerEnd={
          relationType === 'generalization' || relationType === 'inheritance'
            ? `url(#marker-triangle-${id})`
            : relationType === 'dependency'
            ? `url(#marker-arrow-${id})`
            : undefined
        }
        markerStart={
          relationType === 'aggregation'
            ? `url(#marker-diamond-hollow-${id})`
            : relationType === 'composition'
            ? `url(#marker-diamond-filled-${id})`
            : undefined
        }
      />

      {/* Vista previa azul punteada en tiempo real al arrastrar para doblar la línea (como en la Imagen 1 de StarUML) */}
      {draggingState && (
        <g className="uml-edge-dragging-preview" pointerEvents="none">
          <path
            d={buildStraightPathFromPoints(draggingState.previewPoints).path}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="5,4"
          />
          {draggingState.previewPos && (
            <rect
              x={draggingState.previewPos.x - 4}
              y={draggingState.previewPos.y - 4}
              width={8}
              height={8}
              fill="#ffffff"
              stroke="#3b82f6"
              strokeWidth={1.5}
            />
          )}
        </g>
      )}

      {/* Si es una relación de Asociación de Clases: trazar la rama discontinua desde el centro hasta la clase intermedia */}
      {assocNode && (
        <g className="uml-association-class-branch">
          <line
            x1={labelX}
            y1={labelY}
            x2={assocX}
            y2={assocY}
            stroke={selected ? '#2563eb' : '#000000'}
            strokeWidth="1.8"
            strokeDasharray="4 4"
          />
          <circle
            cx={labelX}
            cy={labelY}
            r="3"
            fill={selected ? '#2563eb' : '#000000'}
          />
        </g>
      )}

      {/* Renderizado de Etiquetas y Puntos de Control Editables */}
      <EdgeLabelRenderer>
        {/* Puntos de control (Waypoints y Anclajes) interactivos cuando la relación está seleccionada */}
        {selected && (
          <>
            {/* Cuadrito azul de anclaje Origen */}
            <div
              className="uml-edge-anchor source-anchor nodrag"
              style={{
                left: `${startPoint.x}px`,
                top: `${startPoint.y}px`,
              }}
              onPointerDown={(e) => startDraggingAnchor(e, 'source')}
              title="Arrastra para mover el punto de anclaje libremente en el borde de esta clase"
            />

            {/* Cuadritos azules de waypoints intermedios guardados */}
            {effectiveWaypoints.map((wp) => (
              <div
                key={wp.id}
                className="uml-edge-waypoint nodrag"
                style={{
                  left: `${wp.x}px`,
                  top: `${wp.y}px`,
                }}
                onPointerDown={(e) => startDraggingWaypoint(e, wp.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeWaypoint(wp.id);
                }}
                title="Arrastra para doblar la línea y rodear clases. Clic derecho para eliminar este punto"
              />
            ))}

            {/* Manijas de punto medio en cada segmento recto para doblar la línea fácilmente */}
            {allPoints.map((pt, i) => {
              if (i >= allPoints.length - 1) return null;
              const nextPt = allPoints[i + 1];
              const midSegmentX = (pt.x + nextPt.x) / 2;
              const midSegmentY = (pt.y + nextPt.y) / 2;
              return (
                <div
                  key={`seg_handle_${i}`}
                  className="uml-edge-segment-handle nodrag"
                  style={{
                    left: `${midSegmentX}px`,
                    top: `${midSegmentY}px`,
                  }}
                  onPointerDown={(e) =>
                    startCreatingWaypointAt(e, { x: midSegmentX, y: midSegmentY }, i)
                  }
                  title="Arrastra para doblar esta línea (crear punto de quiebre)"
                />
              );
            })}

            {/* Cuadrito azul de anclaje Destino */}
            <div
              className="uml-edge-anchor target-anchor nodrag"
              style={{
                left: `${endPoint.x}px`,
                top: `${endPoint.y}px`,
              }}
              onPointerDown={(e) => startDraggingAnchor(e, 'target')}
              title="Arrastra para mover el punto de anclaje libremente en el borde de esta clase"
            />
          </>
        )}
        {/* Nombre de la Relación en el centro: SOLO visible si el usuario le puso texto o si la arista está seleccionada */}
        {(Boolean(label && label.trim()) || selected) && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: selected ? 25 : 5,
            }}
            className={`uml-edge-center-wrapper ${selected ? 'edge-selected' : ''}`}
          >
            {selected ? (
              <div className="uml-edge-label-pill">
                <span className="uml-label-bracket">(</span>
                <input
                  type="text"
                  className="uml-edge-name-input nodrag"
                  value={label}
                  placeholder="Tiene"
                  style={{
                    width: `${Math.max(48, ((label || '').length || 5) * 8 + 14)}px`,
                  }}
                  onChange={(e) => updateEdgeData(id, { label: e.target.value })}
                  title="Texto central de la relación"
                />
                <span className="uml-label-bracket">)</span>

                <button
                  type="button"
                  className="uml-edge-delete-btn nodrag"
                  onClick={handleDeleteEdge}
                  title="Eliminar relación"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="uml-edge-static-pill">
                ({label})
              </div>
            )}
          </div>
        )}

        {/* Multiplicidad Origen: Arrastrable con el mouse, simple y sin negrita */}
        {relationType !== 'generalization' && relationType !== 'inheritance' && (
          <DraggableCardinality
            title="Origen"
            value={sourceMult}
            basePosition={sourcePos}
            offset={data?.sourceOffset || { x: 0, y: 0 }}
            selected={Boolean(selected)}
            onValueChange={(val) => updateEdgeData(id, { sourceMultiplicity: val })}
            onOffsetChange={(offset) => updateEdgeData(id, { sourceOffset: offset })}
          />
        )}

        {/* Multiplicidad Destino: Arrastrable con el mouse, simple y sin negrita */}
        {relationType !== 'generalization' && relationType !== 'inheritance' && (
          <DraggableCardinality
            title="Destino"
            value={targetMult}
            basePosition={targetPos}
            offset={data?.targetOffset || { x: 0, y: 0 }}
            selected={Boolean(selected)}
            onValueChange={(val) => updateEdgeData(id, { targetMultiplicity: val })}
            onOffsetChange={(offset) => updateEdgeData(id, { targetOffset: offset })}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
};

interface DraggableCardinalityProps {
  title: string;
  value: string;
  basePosition: { x: number; y: number };
  offset?: { x: number; y: number };
  selected: boolean;
  onValueChange: (val: string) => void;
  onOffsetChange: (newOffset: { x: number; y: number }) => void;
}

const DraggableCardinality: React.FC<DraggableCardinalityProps> = ({
  title,
  value,
  basePosition,
  offset = { x: 0, y: 0 },
  selected,
  onValueChange,
  onOffsetChange,
}) => {
  const [localOffset, setLocalOffset] = React.useState(offset);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    setLocalOffset(offset);
  }, [offset.x, offset.y]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const targetTag = (e.target as HTMLElement).tagName.toLowerCase();
    if (targetTag === 'input' || targetTag === 'select' || targetTag === 'option') {
      return;
    }

    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startOffsetX = localOffset.x;
    const startOffsetY = localOffset.y;
    let moved = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        moved = true;
        setIsDragging(true);
      }
      if (moved) {
        setLocalOffset({
          x: startOffsetX + dx,
          y: startOffsetY + dy,
        });
      }
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setIsDragging(false);

      if (moved) {
        const dx = upEvent.clientX - startX;
        const dy = upEvent.clientY - startY;
        const finalOffset = {
          x: startOffsetX + dx,
          y: startOffsetY + dy,
        };
        setLocalOffset(finalOffset);
        onOffsetChange(finalOffset);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const finalX = basePosition.x + (localOffset?.x || 0);
  const finalY = basePosition.y + (localOffset?.y || 0);
  const standardOptions = ['0..1', '1', '0..*', '1..*', '*'];

  // Si la relación no está seleccionada y no tiene valor, no mostrar nada
  if (!selected && (!value || !value.trim())) {
    return null;
  }

  // Si está seleccionada pero no tiene valor, mostrar botón sutil para agregar
  if (selected && (!value || !value.trim())) {
    return (
      <div
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${finalX}px, ${finalY}px)`,
          pointerEvents: 'all',
          zIndex: 25,
        }}
        className="uml-cardinality-add-btn nodrag"
        onClick={(e) => {
          e.stopPropagation();
          onValueChange('1');
        }}
        title={`Añadir cardinalidad ${title.toLowerCase()}`}
      >
        + {title}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${finalX}px, ${finalY}px)`,
        pointerEvents: 'all',
        zIndex: isDragging ? 50 : 25,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className={`uml-cardinality-simple-container nodrag ${selected ? 'is-selected' : ''}`}
      onMouseDown={handleMouseDown}
      title="Mantén el clic presionado para arrastrar la cardinalidad"
    >
      {selected ? (
        <div className="uml-cardinality-simple-edit">
          <input
            type="text"
            className="uml-cardinality-simple-input nodrag"
            value={value}
            placeholder="1"
            onChange={(e) => onValueChange(e.target.value)}
            title="Escribir cardinalidad (sin negrita)"
          />

          <select
            className="uml-cardinality-simple-select nodrag"
            value={standardOptions.includes(value) ? value : ''}
            onChange={(e) => {
              if (e.target.value) onValueChange(e.target.value);
            }}
            title="Seleccionar opción"
          >
            <option value="" disabled>▾</option>
            {standardOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="uml-cardinality-simple-remove nodrag"
            onClick={(e) => {
              e.stopPropagation();
              onValueChange('');
            }}
            title="Quitar cardinalidad"
          >
            ×
          </button>
        </div>
      ) : (
        <span className="uml-cardinality-simple-text">
          {value}
        </span>
      )}
    </div>
  );
};
