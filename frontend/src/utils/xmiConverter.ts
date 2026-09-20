import { type Node, type Edge } from 'reactflow';
import { type UmlClassNodeData } from '../store/diagramStore';

// Mapeo de visibilidad UML <-> XMI
export const visibilityToXmi = (vis: string): string => {
  switch (vis) {
    case '-':
      return 'private';
    case '#':
      return 'protected';
    case '~':
      return 'package';
    case '+':
    default:
      return 'public';
  }
};

export const xmiToVisibility = (vis: string | null | undefined): '+' | '-' | '#' | '~' => {
  switch (vis?.toLowerCase()) {
    case 'private':
      return '-';
    case 'protected':
      return '#';
    case 'package':
      return '~';
    case 'public':
    default:
      return '+';
  }
};

import { exportToXmi as exportToXmiNative } from './umlXmiExport';

/**
 * Genera un archivo XMI versión 2.1 compatible al 100% con Enterprise Architect (Sparx Systems)
 */
export const exportToXmi = (
  nodes: Node<UmlClassNodeData>[],
  edges: Edge[],
  projectName: string = 'ModeloUML'
): string => {
  return exportToXmiNative(nodes, edges, projectName);
};


/**
 * Genera código PlantUML (.puml) estructurado a partir del diagrama actual
 */
export const exportToPlantUml = (
  nodes: Node<UmlClassNodeData>[],
  edges: Edge[],
  projectName: string = 'ModeloUML'
): string => {
  const classNodes = nodes.filter((n) => n.type === 'umlClass' && n.data?.name);

  let puml = `@startuml ${projectName}\n`;
  puml += `' Generado por UMLCraft - Diseñador de Diagramas de Clases\n\n`;
  puml += `skinparam classAttributeIconSize 0\n`;
  puml += `skinparam monochrome false\n`;
  puml += `skinparam shadowing false\n\n`;

  // 1. Clases
  classNodes.forEach((node) => {
    const className = node.data.name;
    const stereotype = node.data.stereotype ? ` <<${node.data.stereotype}>>` : '';

    puml += `class ${className}${stereotype} {\n`;

    if (node.data.attributes && Array.isArray(node.data.attributes)) {
      node.data.attributes.forEach((attr) => {
        puml += `  ${attr.visibility || '+'} ${attr.name}: ${attr.type || 'String'}\n`;
      });
    }

    if (node.data.methods && Array.isArray(node.data.methods)) {
      node.data.methods.forEach((meth) => {
        const ret = meth.returnType ? `: ${meth.returnType}` : '';
        const params = meth.parameters ? `(${meth.parameters})` : '()';
        const name = meth.name.replace(/\(.*?\)$/, '');
        puml += `  ${meth.visibility || '+'} ${name}${params}${ret}\n`;
      });
    }

    puml += `}\n\n`;
  });

  // 2. Relaciones
  const nodeNameMap: Record<string, string> = {};
  classNodes.forEach((n) => {
    nodeNameMap[n.id] = n.data.name;
  });

  edges.forEach((edge) => {
    const srcName = nodeNameMap[edge.source];
    const tgtName = nodeNameMap[edge.target];
    if (!srcName || !tgtName) return;

    const relType = edge.data?.relationType || 'association';
    const sMult = edge.data?.sourceMultiplicity ? ` "${edge.data.sourceMultiplicity}" ` : ' ';
    const tMult = edge.data?.targetMultiplicity ? ` "${edge.data.targetMultiplicity}" ` : ' ';
    const label = edge.data?.label ? ` : ${edge.data.label}` : '';

    switch (relType) {
      case 'generalization':
      case 'inheritance':
        puml += `${srcName} --|> ${tgtName}${label}\n`;
        break;
      case 'composition':
        puml += `${srcName}${sMult}*--${tMult}${tgtName}${label}\n`;
        break;
      case 'aggregation':
        puml += `${srcName}${sMult}o--${tMult}${tgtName}${label}\n`;
        break;
      case 'dependency':
        puml += `${srcName}${sMult}..>${tMult}${tgtName}${label}\n`;
        break;
      case 'associationClass':
        puml += `(${srcName}, ${tgtName}) .. ${edge.data?.label || 'Asociacion'}\n`;
        break;
      case 'association':
      default:
        puml += `${srcName}${sMult}--${tMult}${tgtName}${label}\n`;
        break;
    }
  });

  puml += `\n@enduml\n`;
  return puml;
};

/**
 * Parsea un archivo XMI (XML) proveniente de Enterprise Architect u otras herramientas CASE
 */
export const parseXmiToDiagram = (xmlText: string) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // Comprobar errores de parseo XML
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('El archivo XML/XMI contiene errores de formato o sintaxis.');
  }

  const detectedClasses: {
    id: string;
    name: string;
    attributes: string[];
    methods: string[];
  }[] = [];

  const detectedRelations: {
    source: string;
    target: string;
    type: string;
    sourceMultiplicity: string;
    targetMultiplicity: string;
    label: string;
  }[] = [];

  const idToClassName: Record<string, string> = {};

  // 1. Extraer Clases (soporta elementos con o sin prefijo uml: o xmi:type="uml:Class")
  const allElements = Array.from(xmlDoc.getElementsByTagName('*'));
  const classElements = allElements.filter((el) => {
    const xmiType = el.getAttribute('xmi:type') || el.getAttribute('type') || '';
    const tagName = el.localName || el.tagName;
    return (
      xmiType.toLowerCase() === 'uml:class' ||
      tagName.toLowerCase() === 'class' ||
      tagName.toLowerCase() === 'uml:class'
    );
  });

  classElements.forEach((classEl, idx) => {
    const rawId = classEl.getAttribute('xmi:id') || classEl.getAttribute('id') || `class_${idx + 1}`;
    const name = classEl.getAttribute('name') || `Clase_${idx + 1}`;
    idToClassName[rawId] = name;

    const attributes: string[] = [];
    const methods: string[] = [];

    // Extraer atributos hijos
    const childAttrs = Array.from(classEl.children).filter((c) => {
      const type = c.getAttribute('xmi:type') || c.getAttribute('type') || '';
      const tag = c.localName || c.tagName;
      return (
        type.toLowerCase() === 'uml:property' ||
        tag.toLowerCase() === 'ownedattribute' ||
        tag.toLowerCase() === 'attribute'
      );
    });

    childAttrs.forEach((attrEl) => {
      const attrName = attrEl.getAttribute('name');
      if (!attrName) return;

      const vis = xmiToVisibility(attrEl.getAttribute('visibility'));
      let attrType = 'String';

      // Buscar tipo del atributo
      const typeEl = attrEl.querySelector('type');
      if (typeEl) {
        const href = typeEl.getAttribute('href') || '';
        const nameAttr = typeEl.getAttribute('name') || '';
        attrType = href.split('#')[1] || nameAttr || 'String';
      }

      attributes.push(`${vis} ${attrName}: ${attrType}`);
    });

    // Extraer métodos / operaciones hijas
    const childMethods = Array.from(classEl.children).filter((c) => {
      const type = c.getAttribute('xmi:type') || c.getAttribute('type') || '';
      const tag = c.localName || c.tagName;
      return (
        type.toLowerCase() === 'uml:operation' ||
        tag.toLowerCase() === 'ownedoperation' ||
        tag.toLowerCase() === 'operation'
      );
    });

    childMethods.forEach((methEl) => {
      const methName = methEl.getAttribute('name');
      if (!methName) return;

      const vis = xmiToVisibility(methEl.getAttribute('visibility'));
      let returnType = 'void';

      const returnParam = Array.from(methEl.querySelectorAll('ownedParameter, parameter')).find(
        (p) => p.getAttribute('direction') === 'return'
      );
      if (returnParam) {
        const typeEl = returnParam.querySelector('type');
        returnType = typeEl?.getAttribute('href')?.split('#')[1] || typeEl?.getAttribute('name') || 'void';
      }

      methods.push(`${vis} ${methName}(): ${returnType}`);
    });

    // Extraer generalizaciones hijas directas
    const genEls = Array.from(classEl.children).filter((c) => {
      const type = c.getAttribute('xmi:type') || c.getAttribute('type') || '';
      const tag = c.localName || c.tagName;
      return type.toLowerCase() === 'uml:generalization' || tag.toLowerCase() === 'generalization';
    });

    genEls.forEach((genEl) => {
      const generalId = genEl.getAttribute('general') || genEl.getAttribute('xmi:idref');
      if (generalId) {
        detectedRelations.push({
          source: rawId, // se resolverá después al nombre
          target: generalId,
          type: 'generalization',
          sourceMultiplicity: '',
          targetMultiplicity: '',
          label: '',
        });
      }
    });

    detectedClasses.push({
      id: rawId,
      name,
      attributes,
      methods,
    });
  });

  // 2. Extraer Asociaciones / Composiciones / Agregaciones / Dependencias
  const assocElements = allElements.filter((el) => {
    const xmiType = (el.getAttribute('xmi:type') || el.getAttribute('type') || '').toLowerCase();
    const tag = (el.localName || el.tagName).toLowerCase();
    return xmiType === 'uml:association' || tag === 'association' || xmiType === 'uml:dependency' || tag === 'dependency';
  });

  assocElements.forEach((assocEl) => {
    const xmiType = (assocEl.getAttribute('xmi:type') || assocEl.getAttribute('type') || '').toLowerCase();
    const tag = (assocEl.localName || assocEl.tagName).toLowerCase();
    const label = assocEl.getAttribute('name') || '';

    if (xmiType === 'uml:dependency' || tag === 'dependency') {
      const client = assocEl.getAttribute('client');
      const supplier = assocEl.getAttribute('supplier');
      if (client && supplier) {
        detectedRelations.push({
          source: client,
          target: supplier,
          type: 'dependency',
          sourceMultiplicity: '',
          targetMultiplicity: '',
          label,
        });
      }
      return;
    }

    // Asociaciones: inspeccionar ownedEnd o memberEnd
    const ownedEnds = Array.from(assocEl.querySelectorAll('ownedEnd'));
    if (ownedEnds.length >= 2) {
      const end1 = ownedEnds[0];
      const end2 = ownedEnds[1];

      const type1 = end1.getAttribute('type');
      const type2 = end2.getAttribute('type');
      const agg2 = (end2.getAttribute('aggregation') || '').toLowerCase();
      const agg1 = (end1.getAttribute('aggregation') || '').toLowerCase();

      let relType = 'association';
      if (agg2 === 'composite' || agg1 === 'composite') relType = 'composition';
      else if (agg2 === 'shared' || agg1 === 'shared') relType = 'aggregation';

      const getMult = (el: Element) => {
        const up = el.querySelector('upperValue')?.getAttribute('value');
        const low = el.querySelector('lowerValue')?.getAttribute('value');
        if (up && low && up !== low) return `${low}..${up}`;
        return up || low || '';
      };

      if (type1 && type2) {
        detectedRelations.push({
          source: type1,
          target: type2,
          type: relType,
          sourceMultiplicity: getMult(end1),
          targetMultiplicity: getMult(end2),
          label,
        });
      }
    }
  });

  // Mapear IDs a nombres de clases en las relaciones
  const finalRelations = detectedRelations.map((rel) => ({
    ...rel,
    source: idToClassName[rel.source] || rel.source,
    target: idToClassName[rel.target] || rel.target,
  })).filter((rel) => rel.source && rel.target);

  return {
    classes: detectedClasses.map((c) => ({
      name: c.name,
      attributes: c.attributes,
      methods: c.methods,
    })),
    relations: finalRelations,
  };
};

/**
 * Parsea un archivo de texto PlantUML (.puml) y extrae clases y relaciones
 */
export const parsePlantUmlToDiagram = (pumlText: string) => {
  const lines = pumlText.split('\n');
  const classesMap: Record<
    string,
    { name: string; attributes: string[]; methods: string[] }
  > = {};
  const relations: {
    source: string;
    target: string;
    type: string;
    sourceMultiplicity: string;
    targetMultiplicity: string;
    label: string;
  }[] = [];

  let currentClass: string | null = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("'") || line.startsWith('@start') || line.startsWith('@end') || line.startsWith('skinparam')) {
      return;
    }

    // Inicio de clase: class NombreClase {
    const classStartMatch = line.match(/^class\s+([a-zA-Z0-9_]+)(?:\s*<<.*?>>)?\s*\{?$/);
    if (classStartMatch) {
      const clsName = classStartMatch[1];
      currentClass = clsName;
      if (!classesMap[clsName]) {
        classesMap[clsName] = { name: clsName, attributes: [], methods: [] };
      }
      return;
    }

    // Fin de clase
    if (line === '}') {
      currentClass = null;
      return;
    }

    // Miembros dentro de una clase
    if (currentClass) {
      if (line.includes('(') && line.includes(')')) {
        classesMap[currentClass].methods.push(line);
      } else {
        classesMap[currentClass].attributes.push(line);
      }
      return;
    }

    // Relaciones entre clases fuera del bloque
    // Herencia: A --|> B  o  A <|-- B
    const genMatch1 = line.match(/^([a-zA-Z0-9_]+)\s*--\|>\s*([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?$/);
    if (genMatch1) {
      relations.push({
        source: genMatch1[1],
        target: genMatch1[2],
        type: 'generalization',
        sourceMultiplicity: '',
        targetMultiplicity: '',
        label: genMatch1[3]?.trim() || '',
      });
      return;
    }

    const genMatch2 = line.match(/^([a-zA-Z0-9_]+)\s*<\|--\s*([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?$/);
    if (genMatch2) {
      relations.push({
        source: genMatch2[2],
        target: genMatch2[1],
        type: 'generalization',
        sourceMultiplicity: '',
        targetMultiplicity: '',
        label: genMatch2[3]?.trim() || '',
      });
      return;
    }

    // Composición: A "1" *-- "0..*" B
    const compMatch = line.match(/^([a-zA-Z0-9_]+)\s*(?:"([^"]*)")?\s*\*--\s*(?:"([^"]*)")?\s*([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?$/);
    if (compMatch) {
      relations.push({
        source: compMatch[1],
        target: compMatch[4],
        type: 'composition',
        sourceMultiplicity: compMatch[2] || '',
        targetMultiplicity: compMatch[3] || '',
        label: compMatch[5]?.trim() || '',
      });
      return;
    }

    // Agregación: A "1" o-- "0..*" B
    const aggMatch = line.match(/^([a-zA-Z0-9_]+)\s*(?:"([^"]*)")?\s*o--\s*(?:"([^"]*)")?\s*([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?$/);
    if (aggMatch) {
      relations.push({
        source: aggMatch[1],
        target: aggMatch[4],
        type: 'aggregation',
        sourceMultiplicity: aggMatch[2] || '',
        targetMultiplicity: aggMatch[3] || '',
        label: aggMatch[5]?.trim() || '',
      });
      return;
    }

    // Dependencia: A ..> B
    const depMatch = line.match(/^([a-zA-Z0-9_]+)\s*(?:"([^"]*)")?\s*\.\.>\s*(?:"([^"]*)")?\s*([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?$/);
    if (depMatch) {
      relations.push({
        source: depMatch[1],
        target: depMatch[4],
        type: 'dependency',
        sourceMultiplicity: depMatch[2] || '',
        targetMultiplicity: depMatch[3] || '',
        label: depMatch[5]?.trim() || '',
      });
      return;
    }

    // Asociación: A "1" -- "1..*" B
    const assocMatch = line.match(/^([a-zA-Z0-9_]+)\s*(?:"([^"]*)")?\s*--\s*(?:"([^"]*)")?\s*([a-zA-Z0-9_]+)(?:\s*:\s*(.*))?$/);
    if (assocMatch) {
      relations.push({
        source: assocMatch[1],
        target: assocMatch[4],
        type: 'association',
        sourceMultiplicity: assocMatch[2] || '',
        targetMultiplicity: assocMatch[3] || '',
        label: assocMatch[5]?.trim() || '',
      });
    }
  });

  return {
    classes: Object.values(classesMap),
    relations,
  };
};
