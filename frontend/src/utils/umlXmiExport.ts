import { type Node, type Edge } from 'reactflow';
import { type UmlClassNodeData } from '../store/diagramStore';

/**
 * Escapa caracteres especiales para XML
 */
function escapeXml(unsafe: string = ''): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Mapea visibilidad UML (+, -, #, ~) a estándar XMI
 */
function mapVisibilityToXmi(v: string = '+'): string {
  switch (v) {
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
}

/**
 * Convierte multiplicidades como '1', '*', '0..1', '1..*' a fragmentos XML de lower y upper value
 */
function getMultiplicityXml(multStr: string = '', idPrefix: string): string {
  const clean = multStr.trim();
  if (!clean) return '';

  let lower = '1';
  let upper = '1';

  if (clean === '*') {
    lower = '0';
    upper = '*';
  } else if (clean.includes('..')) {
    const parts = clean.split('..');
    lower = parts[0]?.trim() || '0';
    upper = parts[1]?.trim() || '*';
  } else {
    lower = clean;
    upper = clean;
  }

  let xml = '';
  if (lower !== '') {
    xml += `          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_lower" value="${escapeXml(lower)}"/>\n`;
  }
  if (upper === '*') {
    xml += `          <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${idPrefix}_upper" value="*"/>\n`;
  } else if (upper !== '') {
    xml += `          <upperValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_upper" value="${escapeXml(upper)}"/>\n`;
  }
  return xml;
}

/**
 * Exporta el diagrama UML a formato estándar XMI 2.1 (UML 2.1)
 * Compatible con Enterprise Architect, Visual Paradigm y herramientas OMG UML.
 */
export function exportToXmi(
  nodes: Node<any>[],
  edges: Edge[],
  packageName: string = 'com.example.uml'
): string {
  const classNodes = nodes.filter((n) => n.type === 'umlClass' && n.data?.name);

  // Mapeo de IDs de nodos a IDs de XMI
  const nodeIdToXmiId: Record<string, string> = {};
  classNodes.forEach((node, index) => {
    nodeIdToXmiId[node.id] = `EA_CLS_${index + 1}_${node.data.name.replace(/[^a-zA-Z0-9_]/g, '')}`;
  });

  // Identificar clases intermedias de associationClass
  const associationClassNodeIds = new Set<string>();
  edges.forEach((edge) => {
    const relType = edge.data?.relationType;
    if (relType === 'associationClass' && edge.data?.associationClassId) {
      associationClassNodeIds.add(edge.data.associationClassId);
    }
  });

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">\n`;
  xml += `  <xmi:Documentation exporter="UMLWebArchitect" exporterVersion="1.0">\n`;
  xml += `    <xmi:Notice>Diagrama UML exportado compatible con Enterprise Architect y herramientas estándar</xmi:Notice>\n`;
  xml += `  </xmi:Documentation>\n`;
  xml += `  <uml:Model xmi:type="uml:Model" name="Model" xmi:id="EA_Root_Model">\n`;
  xml += `    <packagedElement xmi:type="uml:Package" name="${escapeXml(packageName)}" xmi:id="EA_PKG_Main">\n`;

  // 1. Exportar Clases
  classNodes.forEach((node) => {
    const classData = node.data as UmlClassNodeData;
    const classXmiId = nodeIdToXmiId[node.id];
    const isAssocClass = associationClassNodeIds.has(node.id);
    const elementType = isAssocClass ? 'uml:AssociationClass' : 'uml:Class';

    xml += `      <packagedElement xmi:type="${elementType}" name="${escapeXml(classData.name)}" xmi:id="${classXmiId}">\n`;

    // Estereotipo si existe
    if (classData.stereotype) {
      xml += `        <!-- Stereotype: <<${escapeXml(classData.stereotype)}>> -->\n`;
    }

    // Atributos
    (classData.attributes || []).forEach((attr, aIdx) => {
      const attrXmiId = `${classXmiId}_attr_${aIdx + 1}`;
      const vis = mapVisibilityToXmi(attr.visibility);
      const typeName = attr.type || 'String';
      xml += `        <ownedAttribute xmi:type="uml:Property" name="${escapeXml(attr.name)}" visibility="${vis}" xmi:id="${attrXmiId}">\n`;
      xml += `          <type xmi:type="uml:PrimitiveType" href="http://schema.omg.org/spec/UML/2.1/uml.xml#${escapeXml(typeName)}"/>\n`;
      xml += `        </ownedAttribute>\n`;
    });

    // Métodos / Operaciones
    (classData.methods || []).forEach((method, mIdx) => {
      const methXmiId = `${classXmiId}_op_${mIdx + 1}`;
      const vis = mapVisibilityToXmi(method.visibility);
      xml += `        <ownedOperation xmi:type="uml:Operation" name="${escapeXml(method.name)}" visibility="${vis}" xmi:id="${methXmiId}">\n`;
      if (method.returnType) {
        xml += `          <ownedParameter xmi:type="uml:Parameter" name="return" direction="return">\n`;
        xml += `            <type xmi:type="uml:PrimitiveType" href="http://schema.omg.org/spec/UML/2.1/uml.xml#${escapeXml(method.returnType)}"/>\n`;
        xml += `          </ownedParameter>\n`;
      }
      xml += `        </ownedOperation>\n`;
    });

    // Generalizaciones / Herencias salientes de esta clase
    const outgoingGeneralizations = edges.filter(
      (e) => e.source === node.id && (e.data?.relationType === 'generalization' || e.data?.relationType === 'inheritance')
    );
    outgoingGeneralizations.forEach((genEdge, gIdx) => {
      const targetXmiId = nodeIdToXmiId[genEdge.target];
      if (targetXmiId) {
        xml += `        <generalization xmi:type="uml:Generalization" general="${targetXmiId}" xmi:id="${classXmiId}_gen_${gIdx + 1}"/>\n`;
      }
    });

    xml += `      </packagedElement>\n`;
  });

  // 2. Exportar Asociaciones, Agregaciones, Composiciones, Dependencias y AssociationClass
  edges.forEach((edge, eIdx) => {
    const relType = edge.data?.relationType || 'association';
    if (relType === 'generalization' || relType === 'inheritance') {
      return; // Ya procesado dentro de la clase como <generalization>
    }

    const sourceXmiId = nodeIdToXmiId[edge.source];
    const targetXmiId = nodeIdToXmiId[edge.target];
    if (!sourceXmiId || !targetXmiId) return;

    const assocXmiId = `EA_ASSOC_${eIdx + 1}`;
    const label = edge.data?.label || '';
    const sourceMult = edge.data?.sourceMultiplicity || '';
    const targetMult = edge.data?.targetMultiplicity || '';

    // Manejo de Dependencia
    if (relType === 'dependency') {
      xml += `      <packagedElement xmi:type="uml:Dependency" name="${escapeXml(label)}" client="${sourceXmiId}" supplier="${targetXmiId}" xmi:id="${assocXmiId}"/>\n`;
      return;
    }

    // Tipo de agregación en el extremo destino
    let aggregationType = 'none';
    if (relType === 'aggregation') aggregationType = 'shared';
    if (relType === 'composition') aggregationType = 'composite';

    const end1XmiId = `${assocXmiId}_end1`;
    const end2XmiId = `${assocXmiId}_end2`;

    // Si es Association Class, Enterprise Architect y XMI vinculan la clase intermedia
    let assocTag = 'uml:Association';
    let extraAttrs = '';
    if (relType === 'associationClass' && edge.data?.associationClassId) {
      const intermediateClassXmiId = nodeIdToXmiId[edge.data.associationClassId];
      if (intermediateClassXmiId) {
        extraAttrs = ` associationClass="${intermediateClassXmiId}"`;
      }
    }

    xml += `      <packagedElement xmi:type="${assocTag}" name="${escapeXml(label)}" xmi:id="${assocXmiId}"${extraAttrs}>\n`;
    xml += `        <memberEnd xmi:idref="${end1XmiId}"/>\n`;
    xml += `        <memberEnd xmi:idref="${end2XmiId}"/>\n`;

    // Extremo Origen (Source End)
    xml += `        <ownedEnd xmi:type="uml:Property" xmi:id="${end1XmiId}" type="${sourceXmiId}" aggregation="none">\n`;
    xml += getMultiplicityXml(sourceMult, end1XmiId);
    xml += `        </ownedEnd>\n`;

    // Extremo Destino (Target End)
    xml += `        <ownedEnd xmi:type="uml:Property" xmi:id="${end2XmiId}" type="${targetXmiId}" aggregation="${aggregationType}">\n`;
    xml += getMultiplicityXml(targetMult, end2XmiId);
    xml += `        </ownedEnd>\n`;

    xml += `      </packagedElement>\n`;
  });

  xml += `    </packagedElement>\n`;
  xml += `  </uml:Model>\n`;

  // 3. Extensión de Coordenadas de Diagrama para Enterprise Architect (permite abrir el diagrama con el layout ya dibujado)
  xml += `  <xmi:Extension extender="Enterprise Architect" extenderID="6.5">\n`;
  xml += `    <diagrams>\n`;
  xml += `      <diagram xmi:id="EA_DIAG_1">\n`;
  xml += `        <properties name="${escapeXml(packageName)}" type="Logical"/>\n`;
  xml += `        <elements>\n`;
  classNodes.forEach((node) => {
    const classXmiId = nodeIdToXmiId[node.id];
    const left = Math.round(node.position.x);
    const top = Math.round(node.position.y);
    const right = left + 220;
    const bottom = top + 160;
    xml += `          <element subject="${classXmiId}" geometry="Left=${left};Top=${top};Right=${right};Bottom=${bottom};" seqno="1" style="DUID=${classXmiId};"/>\n`;
  });
  xml += `        </elements>\n`;
  xml += `      </diagram>\n`;
  xml += `    </diagrams>\n`;
  xml += `  </xmi:Extension>\n`;

  xml += `</xmi:XMI>\n`;

  return xml;
}
