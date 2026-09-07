import type { Node } from 'reactflow';

export interface Point {
  x: number;
  y: number;
}

export interface Waypoint extends Point {
  id: string;
}

/**
 * Obtiene las dimensiones reales de un nodo consultando el DOM o calculando
 * en base a sus atributos y métodos, evitando estimaciones erróneas.
 */
export function getNodeDimensions(node: Node): { width: number; height: number } {
  if (typeof document !== 'undefined') {
    const el = document.querySelector(`.react-flow__node[data-id="${node.id}"]`);
    if (el) {
      const card = el.querySelector('.simple-uml-card') || el;
      if (card.clientWidth > 0 && card.clientHeight > 0) {
        return { width: card.clientWidth, height: card.clientHeight };
      }
    }
  }

  const w = (node as any).width || (node as any).measured?.width;
  const h = (node as any).height || (node as any).measured?.height;
  if (w && h) {
    return { width: w, height: h };
  }

  const attrCount = (node.data?.attributes || []).length;
  const methCount = (node.data?.methods || []).length;
  // Encabezado ~38px + atributos (min 26px cada uno) + métodos (min 26px cada uno) + paddings
  const calcHeight = 40 + Math.max(1, attrCount) * 26 + Math.max(1, methCount) * 26 + 18;
  return { width: 190, height: Math.max(115, calcHeight) };
}

/**
 * Calcula la intersección entre la recta que une el centro del nodo y un punto externo,
 * con el perímetro rectangular del nodo (permitiendo anclaje libre en cualquier punto del borde).
 */
export function getNodePerimeterIntersection(
  node: Node,
  targetPoint: Point
): Point {
  const { width, height } = getNodeDimensions(node);
  const x = node.position.x;
  const y = node.position.y;

  const cx = x + width / 2;
  const cy = y + height / 2;

  const dx = targetPoint.x - cx;
  const dy = targetPoint.y - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: y + height };
  }

  // Pendiente de la línea
  const halfW = width / 2;
  const halfH = height / 2;

  // Determinar con qué lado choca primero
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx * halfH > absDy * halfW) {
    // Interseca borde izquierdo o derecho
    const signX = dx > 0 ? 1 : -1;
    const borderX = cx + signX * halfW;
    const borderY = cy + (dy / absDx) * halfW;
    return { x: borderX, y: Math.max(y, Math.min(y + height, borderY)) };
  } else {
    // Interseca borde superior o inferior
    const signY = dy > 0 ? 1 : -1;
    const borderY = cy + signY * halfH;
    const borderX = cx + (dx / absDy) * halfH;
    return { x: Math.max(x, Math.min(x + width, borderX)), y: borderY };
  }
}

/**
 * Proyecta un punto arbitrario arrastrado hacia el punto más cercano del perímetro del nodo.
 */
export function snapPointToNodePerimeter(node: Node, point: Point): Point {
  const { width, height } = getNodeDimensions(node);
  const left = node.position.x;
  const top = node.position.y;
  const right = left + width;
  const bottom = top + height;

  // Clampear primero
  const clampedX = Math.max(left, Math.min(right, point.x));
  const clampedY = Math.max(top, Math.min(bottom, point.y));

  // Distancias a los 4 bordes
  const distLeft = Math.abs(point.x - left);
  const distRight = Math.abs(point.x - right);
  const distTop = Math.abs(point.y - top);
  const distBottom = Math.abs(point.y - bottom);

  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist === distLeft) {
    return { x: left, y: clampedY };
  } else if (minDist === distRight) {
    return { x: right, y: clampedY };
  } else if (minDist === distTop) {
    return { x: clampedX, y: top };
  } else {
    return { x: clampedX, y: bottom };
  }
}

/**
 * Construye una ruta SVG a partir de una lista ordenada de puntos.
 */
export function buildStraightPathFromPoints(points: Point[]): {
  path: string;
  midX: number;
  midY: number;
} {
  if (!points || points.length === 0) {
    return { path: '', midX: 0, midY: 0 };
  }

  if (points.length === 1) {
    return { path: `M ${points[0].x} ${points[0].y}`, midX: points[0].x, midY: points[0].y };
  }

  let d = `M ${Math.round(points[0].x)} ${Math.round(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${Math.round(points[i].x)} ${Math.round(points[i].y)}`;
  }

  // Calcular punto medio aproximado a lo largo del recorrido para etiquetas y multiplicidad
  const midIndex = Math.floor((points.length - 1) / 2);
  const pA = points[midIndex];
  const pB = points[midIndex + 1] || pA;
  const midX = (pA.x + pB.x) / 2;
  const midY = (pA.y + pB.y) / 2;

  return { path: d, midX, midY };
}

/**
 * Genera puntos de ruta ortogonales por defecto (segmentos 100% horizontales y verticales)
 * entre dos puntos de anclaje.
 */
export function generateDefaultOrthogonalWaypoints(
  sourcePt: Point,
  targetPt: Point,
  sourceSide?: 'top' | 'bottom' | 'left' | 'right',
  _targetSide?: 'top' | 'bottom' | 'left' | 'right'
): Waypoint[] {
  const dx = targetPt.x - sourcePt.x;
  const dy = targetPt.y - sourcePt.y;

  // Si están prácticamente alineados horizontal o verticalmente, no se requieren waypoints
  if (Math.abs(dx) < 8 || Math.abs(dy) < 8) {
    return [];
  }

  // Caso 1: Salida horizontal (left/right) y llegada horizontal o vertical
  if (sourceSide === 'right' || sourceSide === 'left') {
    const midX = Math.round(sourcePt.x + dx / 2);
    return [
      { id: `wp_${Date.now()}_1`, x: midX, y: sourcePt.y },
      { id: `wp_${Date.now()}_2`, x: midX, y: targetPt.y },
    ];
  }

  // Caso 2: Salida vertical (top/bottom)
  const midY = Math.round(sourcePt.y + dy / 2);
  return [
    { id: `wp_${Date.now()}_1`, x: sourcePt.x, y: midY },
    { id: `wp_${Date.now()}_2`, x: targetPt.x, y: midY },
  ];
}

/**
 * Calcula la distancia mínima desde un punto P a un segmento de línea [A, B].
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

