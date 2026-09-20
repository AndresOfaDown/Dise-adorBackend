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
 * Enterprise Architect usa -1 para multiplicidad ilimitada (*).
 */
function getMultiplicityXml(multStr: string = '', idPrefix: string): string {
  const clean = multStr.trim();
  if (!clean) return '';

  let lower = '1';
  let upper = '1';

  if (clean === '*') {
    lower = '0';
    upper = '-1';
  } else if (clean.includes('..')) {
    const parts = clean.split('..');
    lower = parts[0]?.trim() || '0';
    const rawUpper = parts[1]?.trim() || '*';
    upper = rawUpper === '*' ? '-1' : rawUpper;
  } else {
    lower = clean;
    upper = clean === '*' ? '-1' : clean;
  }

  let xml = '';
  if (lower !== '') {
    xml += `          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_lower" value="${escapeXml(lower)}"/>\n`;
  }
  if (upper === '-1') {
    xml += `          <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${idPrefix}_upper" value="-1"/>\n`;
  } else if (upper !== '') {
    xml += `          <upperValue xmi:type="uml:LiteralInteger" xmi:id="${idPrefix}_upper" value="${escapeXml(upper)}"/>\n`;
  }
  return xml;
}

/**
 * Exporta el diagrama UML a formato estándar XMI 2.1 compatible al 100% con Enterprise Architect (Sparx Systems).
 * No contiene enlaces externos (href) a OMG que causen bloqueos de red o errores 0x800c0006.
 */
export function exportToXmi(
  nodes: Node<any>[],
  edges: Edge[],
  packageName: string = 'Model'
): string {
  const classNodes = nodes.filter((n) => n.type === 'umlClass' && n.data?.name);
  const safePkgId = packageName.replace(/[^a-zA-Z0-9_]/g, '_') || 'MainPackage';

  // Mapeo de IDs de nodos a IDs de XMI
  const nodeIdToXmiId: Record<string, string> = {};
  const classNameToXmiId: Record<string, string> = {};

  classNodes.forEach((node, index) => {
    const safeName = node.data.name.replace(/[^a-zA-Z0-9_]/g, '');
    const xmiId = `EA_CLS_${index + 1}_${safeName}`;
    nodeIdToXmiId[node.id] = xmiId;
    classNameToXmiId[node.data.name.trim()] = xmiId;
  });

  // Identificar clases intermedias de associationClass
  const associationClassNodeIds = new Set<string>();
  edges.forEach((edge) => {
    const relType = edge.data?.relationType;
    if (relType === 'associationClass' && edge.data?.associationClassId) {
      associationClassNodeIds.add(edge.data.associationClassId);
    }
  });

  // Recopilar todos los tipos de datos utilizados en los atributos y métodos
  const usedTypes = new Set<string>([
    'String', 'int', 'Integer', 'long', 'Long', 'double', 'Double', 'float', 'Float',
    'boolean', 'Boolean', 'Date', 'LocalDate', 'LocalDateTime', 'BigDecimal', 'void'
  ]);

  classNodes.forEach((node) => {
    const classData = node.data as UmlClassNodeData;
    (classData.attributes || []).forEach((attr) => {
      if (attr.type) {
        const cleanT = attr.type.trim();
        if (!classNameToXmiId[cleanT]) {
          usedTypes.add(cleanT);
        }
      }
    });
    (classData.methods || []).forEach((meth) => {
      if (meth.returnType && meth.returnType !== 'void') {
        const cleanT = meth.returnType.trim();
        if (!classNameToXmiId[cleanT]) {
          usedTypes.add(cleanT);
        }
      }
    });
  });

  const getTypeIdRef = (rawType: string = 'String'): string => {
    const clean = rawType.trim() || 'String';
    if (classNameToXmiId[clean]) {
      return classNameToXmiId[clean];
    }
    const safeType = clean.replace(/[^a-zA-Z0-9_]/g, '_');
    return `EAJava_${safeType}`;
  };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">\n`;
  xml += `  <xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>\n`;
  xml += `  <uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public">\n`;
  xml += `    <packagedElement xmi:type="uml:Package" xmi:id="EAPK_${safePkgId}" name="${escapeXml(packageName)}" visibility="public">\n`;

  // Tipos Primitivos locales dentro del modelo para máxima compatibilidad
  xml += `      <packagedElement xmi:type="uml:Package" xmi:id="EAPrimitiveTypesPackage" name="EA_PrimitiveTypes_Package" visibility="public">\n`;
  usedTypes.forEach((t) => {
    const safeId = t.replace(/[^a-zA-Z0-9_]/g, '_');
    xml += `        <packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_${safeId}" name="${escapeXml(t)}" visibility="public"/>\n`;
  });
  xml += `      </packagedElement>\n`;

  // 1. Exportar Clases
  classNodes.forEach((node) => {
    const classData = node.data as UmlClassNodeData;
    const classXmiId = nodeIdToXmiId[node.id];
    const isAssocClass = associationClassNodeIds.has(node.id);
    const elementType = isAssocClass ? 'uml:AssociationClass' : 'uml:Class';

    xml += `      <packagedElement xmi:type="${elementType}" name="${escapeXml(classData.name)}" xmi:id="${classXmiId}" visibility="public">\n`;

    // Atributos
    (classData.attributes || []).forEach((attr, aIdx) => {
      const attrXmiId = `${classXmiId}_attr_${aIdx + 1}`;
      const vis = mapVisibilityToXmi(attr.visibility);
      const typeIdRef = getTypeIdRef(attr.type);

      xml += `        <ownedAttribute xmi:type="uml:Property" name="${escapeXml(attr.name)}" visibility="${vis}" xmi:id="${attrXmiId}">\n`;
      xml += `          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${attrXmiId}_lower" value="1"/>\n`;
      xml += `          <upperValue xmi:type="uml:LiteralInteger" xmi:id="${attrXmiId}_upper" value="1"/>\n`;
      xml += `          <type xmi:idref="${typeIdRef}"/>\n`;
      xml += `        </ownedAttribute>\n`;
    });

    // Métodos / Operaciones
    (classData.methods || []).forEach((method, mIdx) => {
      const methXmiId = `${classXmiId}_op_${mIdx + 1}`;
      const vis = mapVisibilityToXmi(method.visibility);

      xml += `        <ownedOperation xmi:type="uml:Operation" name="${escapeXml(method.name)}" visibility="${vis}" xmi:id="${methXmiId}">\n`;
      if (method.returnType && method.returnType !== 'void') {
        const retTypeIdRef = getTypeIdRef(method.returnType);
        xml += `          <ownedParameter xmi:type="uml:Parameter" xmi:id="${methXmiId}_ret" name="return" direction="return">\n`;
        xml += `            <type xmi:idref="${retTypeIdRef}"/>\n`;
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
      xml += `      <packagedElement xmi:type="uml:Dependency" name="${escapeXml(label)}" client="${sourceXmiId}" supplier="${targetXmiId}" xmi:id="${assocXmiId}" visibility="public"/>\n`;
      return;
    }

    // Tipo de agregación en el extremo destino
    let aggregationType = 'none';
    if (relType === 'aggregation') aggregationType = 'shared';
    if (relType === 'composition') aggregationType = 'composite';

    const end1XmiId = `${assocXmiId}_end1`;
    const end2XmiId = `${assocXmiId}_end2`;

    let assocTag = 'uml:Association';
    let extraAttrs = '';
    if (relType === 'associationClass' && edge.data?.associationClassId) {
      const intermediateClassXmiId = nodeIdToXmiId[edge.data.associationClassId];
      if (intermediateClassXmiId) {
        extraAttrs = ` associationClass="${intermediateClassXmiId}"`;
      }
    }

    xml += `      <packagedElement xmi:type="${assocTag}" name="${escapeXml(label)}" xmi:id="${assocXmiId}" visibility="public"${extraAttrs}>\n`;
    xml += `        <memberEnd xmi:idref="${end1XmiId}"/>\n`;
    xml += `        <memberEnd xmi:idref="${end2XmiId}"/>\n`;

    // Extremo Origen (Source End)
    xml += `        <ownedEnd xmi:type="uml:Property" xmi:id="${end1XmiId}" visibility="public" association="${assocXmiId}" aggregation="none">\n`;
    xml += `          <type xmi:idref="${sourceXmiId}"/>\n`;
    xml += getMultiplicityXml(sourceMult, end1XmiId);
    xml += `        </ownedEnd>\n`;

    // Extremo Destino (Target End)
    xml += `        <ownedEnd xmi:type="uml:Property" xmi:id="${end2XmiId}" visibility="public" association="${assocXmiId}" aggregation="${aggregationType}">\n`;
    xml += `          <type xmi:idref="${targetXmiId}"/>\n`;
    xml += getMultiplicityXml(targetMult, end2XmiId);
    xml += `        </ownedEnd>\n`;

    xml += `      </packagedElement>\n`;
  });

  xml += `    </packagedElement>\n`;
  xml += `  </uml:Model>\n`;

  // 3. Extensión de Coordenadas de Diagrama para Enterprise Architect
  xml += `  <xmi:Extension extender="Enterprise Architect" extenderID="6.5">\n`;
  xml += `    <diagrams>\n`;
  xml += `      <diagram xmi:id="EA_DIAG_1">\n`;
  xml += `        <model package="EAPK_${safePkgId}" localID="1" owner="EAPK_${safePkgId}"/>\n`;
  xml += `        <properties name="${escapeXml(packageName)}" type="Logical"/>\n`;
  xml += `        <project author="UMLWebArchitect" version="1.0"/>\n`;
  xml += `        <elements>\n`;
  classNodes.forEach((node, idx) => {
    const classXmiId = nodeIdToXmiId[node.id];
    const left = Math.round(node.position.x);
    const top = Math.round(node.position.y);
    const right = left + 220;
    const bottom = top + 160;
    xml += `          <element subject="${classXmiId}" geometry="Left=${left};Top=${top};Right=${right};Bottom=${bottom};" seqno="${idx + 1}" style="DUID=${classXmiId};"/>\n`;
  });
  xml += `        </elements>\n`;
  xml += `      </diagram>\n`;
  xml += `    </diagrams>\n`;
  xml += `  </xmi:Extension>\n`;

  xml += `</xmi:XMI>\n`;

  return xml;
}
