import { type Node, type Edge } from 'reactflow';
import { type UmlClassNodeData } from '../store/diagramStore';

/**
 * Exporta el diagrama UML a formato PlantUML (.puml)
 * Compatible con editores PlantUML, Visual Paradigm, VS Code y Enterprise Architect.
 */
export function exportToPlantUml(
  nodes: Node<any>[],
  edges: Edge[],
  packageName: string = 'com.example.uml'
): string {
  const classNodes = nodes.filter((n) => n.type === 'umlClass' && n.data?.name);

  // Mapa de nodeId a Nombre de Clase
  const nodeNameToId: Record<string, string> = {};
  const nodeIdToName: Record<string, string> = {};
  classNodes.forEach((node) => {
    const rawName = (node.data as UmlClassNodeData).name.trim();
    // Reemplazar espacios y caracteres inválidos para identificador PlantUML
    const safeName = rawName.replace(/[^a-zA-Z0-9_]/g, '_');
    nodeNameToId[node.id] = safeName;
    nodeIdToName[node.id] = safeName;
  });

  // Identificar clases intermedias de associationClass
  const associationClassNodeIds = new Set<string>();
  edges.forEach((edge) => {
    if (edge.data?.relationType === 'associationClass' && edge.data?.associationClassId) {
      associationClassNodeIds.add(edge.data.associationClassId);
    }
  });

  let puml = `@startuml\n`;
  puml += `' ==========================================\n`;
  puml += `' Diagrama UML exportado desde Diseñador UML Web\n`;
  puml += `' ==========================================\n\n`;
  puml += `skinparam classAttributeIconSize 0\n`;
  puml += `skinparam shadowing false\n`;
  puml += `skinparam monochrome false\n\n`;

  puml += `package "${packageName}" {\n\n`;

  // 1. Declarar Clases
  classNodes.forEach((node) => {
    const classData = node.data as UmlClassNodeData;
    const safeName = nodeIdToName[node.id] || 'Clase';
    const isAssocClass = associationClassNodeIds.has(node.id);

    const stereotypeStr = classData.stereotype
      ? ` <<${classData.stereotype}>>`
      : isAssocClass
      ? ' <<association-class>>'
      : '';

    puml += `  class ${safeName}${stereotypeStr} {\n`;

    // Atributos
    (classData.attributes || []).forEach((attr) => {
      const vis = attr.visibility || '+';
      const typeStr = attr.type ? `: ${attr.type}` : '';
      puml += `    ${vis} ${attr.name}${typeStr}\n`;
    });

    // Separador si hay tanto atributos como métodos
    if ((classData.attributes || []).length > 0 && (classData.methods || []).length > 0) {
      puml += `    --\n`;
    }

    // Métodos
    (classData.methods || []).forEach((meth) => {
      const vis = meth.visibility || '+';
      const params = meth.parameters ? `(${meth.parameters})` : '()';
      const returnStr = meth.returnType ? `: ${meth.returnType}` : '';
      puml += `    ${vis} ${meth.name}${params}${returnStr}\n`;
    });

    puml += `  }\n\n`;
  });

  puml += `}\n\n`;

  // 2. Declarar Relaciones
  edges.forEach((edge) => {
    const sourceName = nodeIdToName[edge.source];
    const targetName = nodeIdToName[edge.target];
    if (!sourceName || !targetName) return;

    const relType = edge.data?.relationType || 'association';
    const sourceMult = edge.data?.sourceMultiplicity ? `"${edge.data.sourceMultiplicity}" ` : '';
    const targetMult = edge.data?.targetMultiplicity ? ` "${edge.data.targetMultiplicity}"` : '';
    const label = edge.data?.label ? ` : ${edge.data.label}` : '';

    switch (relType) {
      case 'generalization':
      case 'inheritance':
        // Generalización: Source hereda de Target
        puml += `${targetName} <|-- ${sourceName}${label}\n`;
        break;

      case 'composition':
        // Composición: Source contiene fuertemente a Target
        puml += `${sourceName} ${sourceMult}*--${targetMult} ${targetName}${label}\n`;
        break;

      case 'aggregation':
        // Agregación: Source contiene débilmente a Target
        puml += `${sourceName} ${sourceMult}o--${targetMult} ${targetName}${label}\n`;
        break;

      case 'dependency':
        // Dependencia: Source depende de Target
        puml += `${sourceName} ${sourceMult}..>${targetMult} ${targetName}${label}\n`;
        break;

      case 'associationClass': {
        // Clase de asociación N:M
        const intermediateName = edge.data?.associationClassId ? nodeIdToName[edge.data.associationClassId] : null;
        if (intermediateName) {
          // Sintaxis oficial PlantUML para Association Class:
          puml += `(${sourceName}, ${targetName}) .. ${intermediateName}${label}\n`;
        } else {
          puml += `${sourceName} ${sourceMult}--${targetMult} ${targetName}${label}\n`;
        }
        break;
      }

      case 'association':
      default:
        puml += `${sourceName} ${sourceMult}--${targetMult} ${targetName}${label}\n`;
        break;
    }
  });

  puml += `\n@enduml\n`;

  return puml;
}
