import { type UmlRelationType } from '../store/diagramStore';

export interface ParsedUmlClass {
  id?: string;
  name: string;
  stereotype?: string;
  attributes: string[];
  methods: string[];
  position?: { x: number; y: number };
}

export interface ParsedUmlRelation {
  source: string;
  target: string;
  type: UmlRelationType;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  label?: string;
  associationClassName?: string;
}

export interface ParsedUmlResult {
  packageName?: string;
  classes: ParsedUmlClass[];
  relations: ParsedUmlRelation[];
}

/**
 * Obtiene el valor de un atributo de forma segura sin importar si tiene prefijos de namespace (xmi:type, type, xmi:id, etc.)
 */
function getSafeAttr(el: Element, attrName: string): string {
  if (!el || !el.getAttribute) return '';

  // 1. Lectura directa
  const direct = el.getAttribute(attrName);
  if (direct !== null && direct !== undefined && direct !== '') return direct;

  // 2. Si tiene dos puntos (ej. xmi:type o xmi:id)
  if (attrName.includes(':')) {
    const [, local] = attrName.split(':');
    const directLocal = el.getAttribute(local);
    if (directLocal !== null && directLocal !== undefined && directLocal !== '') return directLocal;

    // Con punto en lugar de dos puntos (ej. xmi.id, xmi.type)
    const dotAttr = el.getAttribute(attrName.replace(':', '.'));
    if (dotAttr !== null && dotAttr !== undefined && dotAttr !== '') return dotAttr;

    // Con getAttributeNS en namespaces comunes de OMG / EA
    const knownNamespaces = [
      'http://schema.omg.org/spec/XMI/2.1',
      'http://www.omg.org/spec/XMI/2.1',
      'http://schema.omg.org/spec/UML/2.1',
      'http://www.omg.org/spec/UML/2.1',
      'http://schema.omg.org/spec/XMI/1.1',
      'http://www.omg.org/spec/XMI/1.1',
      'http://www.omg.org/XMI',
    ];
    for (const ns of knownNamespaces) {
      try {
        const nsVal = el.getAttributeNS(ns, local);
        if (nsVal !== null && nsVal !== undefined && nsVal !== '') return nsVal;
      } catch {
        // Ignorar si el navegador no soporta el namespace
      }
    }
  } else {
    // Si no tiene dos puntos, probar prefijado con xmi: o xmi.
    const prefixed = el.getAttribute('xmi:' + attrName) || el.getAttribute('xmi.' + attrName);
    if (prefixed !== null && prefixed !== undefined && prefixed !== '') return prefixed;
  }

  // 3. Búsqueda manual iterando attributes
  if (el.attributes) {
    const target = attrName.toLowerCase();
    const targetLocal = (attrName.includes(':') ? attrName.split(':')[1] : attrName).toLowerCase();
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      const nodeName = a.nodeName.toLowerCase();
      const localName = a.localName?.toLowerCase() || '';

      if (nodeName === target || localName === target || nodeName.endsWith(':' + targetLocal) || localName === targetLocal) {
        if (a.value) return a.value;
      }
    }
  }

  return '';
}

/**
 * Convierte visibilidad de texto a símbolo UML
 */
function toVisibilitySymbol(vis: string = ''): string {
  const v = vis.toLowerCase();
  if (v.includes('priv') || v === '-') return '-';
  if (v.includes('prot') || v === '#') return '#';
  if (v.includes('pack') || v === '~') return '~';
  return '+';
}

/**
 * Limpia y normaliza tipos de Enterprise Architect y estándares UML
 * Ejemplo: "EAJava_boolean" -> "Boolean", "EAJava_Long_PK_" -> "Long"
 */
function cleanTypeName(raw: string): string {
  if (!raw) return 'String';
  let cleaned = raw.trim();

  // Si contiene URL o # (ej. path/to/types#Integer)
  if (cleaned.includes('#')) {
    cleaned = cleaned.split('#').pop() || cleaned;
  }

  // Quitar prefijos propietarios de Enterprise Architect (EAJava_, EAC_, EA_, etc.)
  cleaned = cleaned.replace(/^EA[A-Za-z0-9]+_/, '');
  // Quitar sufijos comunes de llaves primarias/foráneas en EA (_PK_, _FK_)
  cleaned = cleaned.replace(/_(?:PK|FK)_?$/i, '');

  // Normalizar nombres típicos
  const lower = cleaned.toLowerCase();
  if (lower === 'integer' || lower === 'int') return 'Integer';
  if (lower === 'string' || lower === 'varchar' || lower === 'text') return 'String';
  if (lower === 'boolean' || lower === 'bool') return 'Boolean';
  if (lower === 'double') return 'Double';
  if (lower === 'float' || lower === 'real' || lower === 'decimal') return 'Float';
  if (lower === 'date' || lower === 'datetime' || lower === 'timestamp') return 'Date';
  if (lower === 'long') return 'Long';
  if (lower === 'void') return 'void';

  return cleaned || 'String';
}

/**
 * Normaliza multiplicidades de elementos XML lower/upper
 */
function extractMultiplicity(endElem: Element): string {
  let lower = '';
  let upper = '';

  const allChildren = Array.from(endElem.getElementsByTagName('*'));
  for (const child of allChildren) {
    const tag = (child.localName || child.tagName).toLowerCase();
    if (tag === 'lowervalue' || tag.endsWith(':lowervalue')) {
      lower = getSafeAttr(child, 'value');
    } else if (tag === 'uppervalue' || tag.endsWith(':uppervalue')) {
      upper = getSafeAttr(child, 'value');
    }
  }

  if (!lower) lower = getSafeAttr(endElem, 'lower');
  if (!upper) upper = getSafeAttr(endElem, 'upper') || getSafeAttr(endElem, 'multiplicity');

  if (!lower && !upper) return '';
  if (lower === upper) return lower;
  if (lower && !upper) return lower;
  if (!lower && upper) return upper;
  return `${lower}..${upper}`;
}

/**
 * Parser para archivos XML en formato XMI 2.1 / UML 2.x y XMI 1.1 (Enterprise Architect, Visual Paradigm)
 */
export function parseXmi(xmlText: string): ParsedUmlResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('El archivo XML/XMI tiene errores de sintaxis y no pudo ser interpretado.');
  }

  const classes: ParsedUmlClass[] = [];
  const relations: ParsedUmlRelation[] = [];

  // Mapeos de IDs internos a nombres de clase
  const idToName: Record<string, string> = {};
  const idToClass: Record<string, ParsedUmlClass> = {};

  // Obtener todos los elementos del árbol XML para búsqueda sin depender de selectores CSS con namespaces
  const allElements = Array.from(doc.getElementsByTagName('*'));

  // 1. Intentar detectar paquete
  let packageName = 'com.example.uml';
  for (const el of allElements) {
    const tag = (el.localName || el.tagName).toLowerCase();
    const type = getSafeAttr(el, 'xmi:type').toLowerCase();
    if ((tag === 'packagedelement' && type === 'uml:package') || tag === 'uml:package' || tag === 'package') {
      const pName = getSafeAttr(el, 'name');
      if (pName) {
        packageName = pName;
        break;
      }
    }
  }

  // 2. Extraer coordenadas del diagrama si existen en extensiones de Enterprise Architect
  const elementPositions: Record<string, { x: number; y: number }> = {};
  for (const el of allElements) {
    const tag = (el.localName || el.tagName).toLowerCase();
    if (tag === 'element' || tag === 'diagramelement') {
      const geometry = getSafeAttr(el, 'geometry');
      const subject = getSafeAttr(el, 'subject');
      if (geometry && subject) {
        const leftMatch = geometry.match(/Left=(\d+)/i);
        const topMatch = geometry.match(/Top=(\d+)/i);
        if (leftMatch && topMatch) {
          elementPositions[subject] = {
            x: Math.max(50, parseInt(leftMatch[1], 10)),
            y: Math.max(50, parseInt(topMatch[1], 10)),
          };
        }
      }
    }
  }

  // 3. Extraer Clases (XMI 2.1 y XMI 1.1)
  for (const el of allElements) {
    const tag = (el.localName || el.tagName).toLowerCase();
    const xmiType = getSafeAttr(el, 'xmi:type').toLowerCase();
    const typeAttr = getSafeAttr(el, 'type').toLowerCase();

    let isClass = false;
    let isAssocClass = false;

    // En XMI 2.1: <packagedElement xmi:type="uml:Class"> o <packagedElement xmi:type="uml:AssociationClass">
    if (tag === 'packagedelement' || tag.endsWith(':packagedelement')) {
      if (xmiType === 'uml:class' || xmiType === 'class') {
        isClass = true;
      } else if (xmiType === 'uml:associationclass' || xmiType === 'associationclass') {
        isClass = true;
        isAssocClass = true;
      }
    } else if (tag === 'class' || tag === 'uml:class' || tag.endsWith(':class')) {
      isClass = true;
    } else if (tag === 'associationclass' || tag === 'uml:associationclass' || tag.endsWith(':associationclass')) {
      isClass = true;
      isAssocClass = true;
    } else if (tag === 'element' && (typeAttr === 'class' || xmiType === 'class')) {
      // Elementos del modelo de Enterprise Architect
      isClass = true;
    }

    if (!isClass) continue;

    const rawId = getSafeAttr(el, 'xmi:id') || getSafeAttr(el, 'id') || `cls_${classes.length}`;
    const name = getSafeAttr(el, 'name');
    if (!name) continue;

    // Si ya procesamos una clase con este mismo ID, ignorar
    if (idToClass[rawId]) continue;

    idToName[rawId] = name;

    const attributes: string[] = [];
    const methods: string[] = [];

    // Atributos y Operaciones
    const childElements = Array.from(el.children);
    for (const child of childElements) {
      const childTag = (child.localName || child.tagName).toLowerCase();
      const childXmiType = getSafeAttr(child, 'xmi:type').toLowerCase();

      // Atributo
      if (
        childTag === 'ownedattribute' ||
        childTag.endsWith(':ownedattribute') ||
        childTag === 'attribute' ||
        childTag.endsWith(':attribute') ||
        childXmiType === 'uml:property'
      ) {
        const attrName = getSafeAttr(child, 'name');
        if (!attrName) continue;

        const vis = toVisibilitySymbol(getSafeAttr(child, 'visibility'));
        let typeName = '';

        // 1. Atributo directo type="Nombre"
        const directType = getSafeAttr(child, 'type');
        if (directType && !directType.startsWith('EAID_')) {
          typeName = cleanTypeName(directType);
        }

        // 2. Elemento hijo <type ...> (Enterprise Architect usa <type xmi:idref="EAJava_boolean"/>)
        if (!typeName) {
          const typeTags = Array.from(child.getElementsByTagName('*')).filter((t) => {
            const tn = (t.localName || t.tagName).toLowerCase();
            return tn === 'type' || tn.endsWith(':type');
          });
          if (typeTags.length > 0) {
            const tEl = typeTags[0];
            const idref = getSafeAttr(tEl, 'xmi:idref') || getSafeAttr(tEl, 'idref') || getSafeAttr(tEl, 'name');
            if (idref) {
              typeName = cleanTypeName(idref);
            } else {
              const href = getSafeAttr(tEl, 'href');
              if (href) typeName = cleanTypeName(href);
            }
          }
        }

        if (!typeName) typeName = 'String';

        attributes.push(`${vis} ${attrName}: ${typeName}`);
      }

      // Método / Operación
      if (
        childTag === 'ownedoperation' ||
        childTag.endsWith(':ownedoperation') ||
        childTag === 'operation' ||
        childTag.endsWith(':operation') ||
        childXmiType === 'uml:operation'
      ) {
        const opName = getSafeAttr(child, 'name');
        if (!opName) continue;

        const vis = toVisibilitySymbol(getSafeAttr(child, 'visibility'));
        let returnType = 'void';
        const paramsList: string[] = [];

        // Parámetros
        const paramElements = Array.from(child.getElementsByTagName('*')).filter((p) => {
          const pt = (p.localName || p.tagName).toLowerCase();
          return pt === 'ownedparameter' || pt.endsWith(':ownedparameter') || pt === 'parameter' || pt.endsWith(':parameter');
        });

        for (const pEl of paramElements) {
          const direction = getSafeAttr(pEl, 'direction') || 'in';
          const pName = getSafeAttr(pEl, 'name');

          let pType = '';
          const directPType = getSafeAttr(pEl, 'type');
          if (directPType && !directPType.startsWith('EAID_')) {
            pType = cleanTypeName(directPType);
          }
          if (!pType) {
            const pTypeTags = Array.from(pEl.getElementsByTagName('*')).filter((t) => {
              const tn = (t.localName || t.tagName).toLowerCase();
              return tn === 'type' || tn.endsWith(':type');
            });
            if (pTypeTags.length > 0) {
              const ptEl = pTypeTags[0];
              const idref = getSafeAttr(ptEl, 'xmi:idref') || getSafeAttr(ptEl, 'idref') || getSafeAttr(ptEl, 'name');
              if (idref) pType = cleanTypeName(idref);
            }
          }
          if (!pType) pType = 'String';

          if (direction === 'return') {
            returnType = pType || 'void';
          } else if (pName) {
            paramsList.push(`${pName}: ${pType}`);
          }
        }

        methods.push(`${vis} ${opName}(${paramsList.join(', ')}): ${returnType}`);
      }
    }

    const parsedClass: ParsedUmlClass = {
      id: rawId,
      name,
      stereotype: isAssocClass ? 'association-class' : '',
      attributes,
      methods,
      position: elementPositions[rawId],
    };

    classes.push(parsedClass);
    idToClass[rawId] = parsedClass;
  }

  // 4. Extraer Generalizaciones (Herencias)
  for (const el of allElements) {
    const tag = (el.localName || el.tagName).toLowerCase();
    const xmiType = getSafeAttr(el, 'xmi:type').toLowerCase();

    if (tag === 'generalization' || tag.endsWith(':generalization') || xmiType === 'uml:generalization') {
      const parentClassEl = el.parentElement;
      const childId = getSafeAttr(parentClassEl as Element, 'xmi:id') || getSafeAttr(el, 'child');
      const parentId = getSafeAttr(el, 'general') || getSafeAttr(el, 'parent');

      const sourceName = idToName[childId];
      const targetName = idToName[parentId];

      if (sourceName && targetName && sourceName !== targetName) {
        relations.push({
          source: sourceName,
          target: targetName,
          type: 'generalization',
          label: '',
        });
      }
    }
  }

  // 5. Extraer Conectores Propietarios de Enterprise Architect (<connectors><connector>...)
  for (const el of allElements) {
    const tag = (el.localName || el.tagName).toLowerCase();
    if (tag === 'connector') {
      const sourceEl = el.querySelector('source');
      const targetEl = el.querySelector('target');
      const propEl = el.querySelector('properties');

      const sourceId = sourceEl ? (getSafeAttr(sourceEl, 'xmi:idref') || getSafeAttr(sourceEl, 'idref')) : '';
      const targetId = targetEl ? (getSafeAttr(targetEl, 'xmi:idref') || getSafeAttr(targetEl, 'idref')) : '';

      const sourceName = idToName[sourceId];
      const targetName = idToName[targetId];

      if (sourceName && targetName) {
        const eaType = propEl ? getSafeAttr(propEl, 'ea_type') : 'Association';
        const label = getSafeAttr(el, 'name');

        const sourceTypeEl = sourceEl?.querySelector('type');
        const targetTypeEl = targetEl?.querySelector('type');

        const mult1 = sourceTypeEl ? (getSafeAttr(sourceTypeEl, 'multiplicity') || '') : '';
        const mult2 = targetTypeEl ? (getSafeAttr(targetTypeEl, 'multiplicity') || '') : '';

        const agg1 = sourceTypeEl ? getSafeAttr(sourceTypeEl, 'aggregation') : 'none';
        const agg2 = targetTypeEl ? getSafeAttr(targetTypeEl, 'aggregation') : 'none';

        let relType: UmlRelationType = 'association';
        if (eaType === 'Generalization') {
          relType = 'generalization';
        } else if (eaType === 'Dependency') {
          relType = 'dependency';
        } else if (eaType === 'AssociationClass') {
          relType = 'associationClass';
        } else if (agg2 === 'composite' || agg1 === 'composite') {
          relType = 'composition';
        } else if (agg2 === 'shared' || agg1 === 'shared') {
          relType = 'aggregation';
        }

        // Evitar duplicados
        const alreadyExists = relations.some(
          (r) => r.source === sourceName && r.target === targetName && r.type === relType
        );

        if (!alreadyExists) {
          relations.push({
            source: sourceName,
            target: targetName,
            type: relType,
            sourceMultiplicity: mult1,
            targetMultiplicity: mult2,
            label,
          });
        }
      }
    }
  }

  // 6. Extraer Asociaciones estándar XMI 2.1 (<packagedElement xmi:type="uml:Association">)
  for (const el of allElements) {
    const tag = (el.localName || el.tagName).toLowerCase();
    const xmiType = getSafeAttr(el, 'xmi:type').toLowerCase();

    const isAssoc = (tag === 'packagedelement' && (xmiType === 'uml:association' || xmiType === 'uml:associationclass')) ||
                    tag === 'association' || tag === 'uml:association';

    if (isAssoc) {
      const label = getSafeAttr(el, 'name');
      const isAssocClass = xmiType.includes('associationclass');
      const assocId = getSafeAttr(el, 'xmi:id');

      const ownedEnds = Array.from(el.getElementsByTagName('*')).filter((e) => {
        const tn = (e.localName || e.tagName).toLowerCase();
        return tn === 'ownedend' || tn.endsWith(':ownedend') || tn === 'associationend';
      });

      if (ownedEnds.length >= 2) {
        const end1 = ownedEnds[0];
        const end2 = ownedEnds[1];

        const type1Id = getSafeAttr(end1, 'type') || getSafeAttr(end1, 'participant');
        const type2Id = getSafeAttr(end2, 'type') || getSafeAttr(end2, 'participant');

        const sourceName = idToName[type1Id];
        const targetName = idToName[type2Id];

        if (sourceName && targetName) {
          const mult1 = extractMultiplicity(end1);
          const mult2 = extractMultiplicity(end2);

          const agg1 = getSafeAttr(end1, 'aggregation') || 'none';
          const agg2 = getSafeAttr(end2, 'aggregation') || 'none';

          let relType: UmlRelationType = 'association';
          if (isAssocClass) {
            relType = 'associationClass';
          } else if (agg2 === 'composite' || agg1 === 'composite') {
            relType = 'composition';
          } else if (agg2 === 'shared' || agg1 === 'shared') {
            relType = 'aggregation';
          }

          const intermediateClassName = isAssocClass ? idToName[assocId] : undefined;

          // Verificar si ya fue agregada por conectores EA
          const alreadyExists = relations.some(
            (r) => r.source === sourceName && r.target === targetName && r.type === relType
          );

          if (!alreadyExists) {
            relations.push({
              source: sourceName,
              target: targetName,
              type: relType,
              sourceMultiplicity: mult1,
              targetMultiplicity: mult2,
              label,
              associationClassName: intermediateClassName,
            });
          }
        }
      }
    }
  }

  // 7. Extraer Dependencias estándar XMI 2.1
  for (const el of allElements) {
    const tag = (el.localName || el.tagName).toLowerCase();
    const xmiType = getSafeAttr(el, 'xmi:type').toLowerCase();

    if ((tag === 'packagedelement' && xmiType === 'uml:dependency') || tag === 'dependency' || tag === 'uml:dependency') {
      const client = getSafeAttr(el, 'client');
      const supplier = getSafeAttr(el, 'supplier');
      const sourceName = idToName[client];
      const targetName = idToName[supplier];

      if (sourceName && targetName) {
        const alreadyExists = relations.some(
          (r) => r.source === sourceName && r.target === targetName && r.type === 'dependency'
        );
        if (!alreadyExists) {
          relations.push({
            source: sourceName,
            target: targetName,
            type: 'dependency',
            label: getSafeAttr(el, 'name'),
          });
        }
      }
    }
  }

  // Asignar posiciones en cuadrícula si faltan
  assignDefaultGridPositions(classes);

  return { packageName, classes, relations };
}

/**
 * Parser para archivos de texto PlantUML (.puml)
 */
export function parsePlantUml(pumlText: string): ParsedUmlResult {
  const classes: ParsedUmlClass[] = [];
  const relations: ParsedUmlRelation[] = [];

  const classMap: Record<string, ParsedUmlClass> = {};

  // Detectar paquete si existe: package "nombre" { ... }
  const packageMatch = pumlText.match(/package\s+["']?([^"'\s{]+)["']?\s*\{/i);
  const packageName = packageMatch ? packageMatch[1] : 'com.example.uml';

  // 1. Extraer bloques de clases:
  // class ClassName [<<stereotype>>] { ... }
  const classBlockRegex = /class\s+([a-zA-Z0-9_]+)(?:\s*<<([^>]+)>>)?\s*\{([^}]*)\}/gi;
  let match: RegExpExecArray | null;

  while ((match = classBlockRegex.exec(pumlText)) !== null) {
    const className = match[1].trim();
    const stereotype = match[2]?.trim() || '';
    const body = match[3] || '';

    const attributes: string[] = [];
    const methods: string[] = [];

    const lines = body.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('==') || trimmed.startsWith('..') || trimmed.startsWith('\'')) {
        return;
      }

      if (trimmed.includes('(') && trimmed.includes(')')) {
        // Es un método
        methods.push(trimmed);
      } else {
        // Es un atributo
        attributes.push(trimmed);
      }
    });

    const parsedClass: ParsedUmlClass = {
      name: className,
      stereotype,
      attributes,
      methods,
    };

    classes.push(parsedClass);
    classMap[className.toLowerCase()] = parsedClass;
  }

  // Clases simples declaradas como: class ClassName
  const simpleClassRegex = /class\s+([a-zA-Z0-9_]+)(?:\s*<<([^>]+)>>)?(?!\s*\{)/gi;
  while ((match = simpleClassRegex.exec(pumlText)) !== null) {
    const className = match[1].trim();
    if (!classMap[className.toLowerCase()]) {
      const parsedClass: ParsedUmlClass = {
        name: className,
        stereotype: match[2]?.trim() || '',
        attributes: [],
        methods: [],
      };
      classes.push(parsedClass);
      classMap[className.toLowerCase()] = parsedClass;
    }
  }

  // 2. Extraer sintaxis de Association Class: (ClaseA, ClaseB) .. ClaseC
  const assocClassRegex = /\(\s*([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)\s*\)\s*\.{1,2}\s*([a-zA-Z0-9_]+)(?:\s*:\s*([^\n]+))?/gi;
  while ((match = assocClassRegex.exec(pumlText)) !== null) {
    const source = match[1].trim();
    const target = match[2].trim();
    const intermediate = match[3].trim();
    const label = match[4]?.trim() || '';

    // Si la clase intermedia no existe, crearla
    if (!classMap[intermediate.toLowerCase()]) {
      const newClass: ParsedUmlClass = {
        name: intermediate,
        stereotype: 'association-class',
        attributes: ['+ id: int'],
        methods: [],
      };
      classes.push(newClass);
      classMap[intermediate.toLowerCase()] = newClass;
    }

    relations.push({
      source,
      target,
      type: 'associationClass',
      label,
      associationClassName: intermediate,
    });
  }

  // 3. Extraer Relaciones estándar en PlantUML
  // Remover líneas de association class y declaraciones de paquetes
  let cleanPumlForRels = pumlText.replace(/\([^\)]*\)\s*\.{1,2}\s*[a-zA-Z0-9_]+[^\n]*/g, '');
  cleanPumlForRels = cleanPumlForRels.replace(/package\s+["'][^"']+["']\s*\{/gi, '');
  cleanPumlForRels = cleanPumlForRels.replace(/package\s+[a-zA-Z0-9_.]+\s*\{/gi, '');

  // Ejemplos:
  // A <|-- B (B hereda de A)
  // A *-- B (Composición)
  // A o-- B (Agregación)
  // A ..> B (Dependencia)
  // A -- B o A --> B (Asociación)
  const relationRegex = /([a-zA-Z0-9_]+)\s*(?:"([^"]*)")?\s*([<*o|]*[-.]{2,}[|>*o]*)\s*(?:"([^"]*)")?\s*([a-zA-Z0-9_]+)(?:\s*:\s*([^\n]+))?/g;
  while ((match = relationRegex.exec(cleanPumlForRels)) !== null) {
    const leftName = match[1].trim();
    const multLeft = match[2]?.trim() || '';
    const arrow = match[3].trim();
    const multRight = match[4]?.trim() || '';
    const rightName = match[5].trim();
    const label = match[6]?.trim() || '';

    // Ignorar si coincidió con la sintaxis de association class con paréntesis
    if (leftName.startsWith('(') || rightName.endsWith(')')) continue;

    let source = leftName;
    let target = rightName;
    let sourceMultiplicity = multLeft;
    let targetMultiplicity = multRight;
    let type: UmlRelationType = 'association';

    if (arrow.includes('<|--')) {
      // rightName hereda de leftName: Target <|-- Source
      source = rightName;
      target = leftName;
      type = 'generalization';
    } else if (arrow.includes('--|>')) {
      // leftName hereda de rightName: Source --|> Target
      source = leftName;
      target = rightName;
      type = 'generalization';
    } else if (arrow.includes('*--')) {
      // Composición: left posee a right
      type = 'composition';
    } else if (arrow.includes('--*')) {
      source = rightName;
      target = leftName;
      type = 'composition';
    } else if (arrow.includes('o--')) {
      // Agregación: left contiene a right
      type = 'aggregation';
    } else if (arrow.includes('--o')) {
      source = rightName;
      target = leftName;
      type = 'aggregation';
    } else if (arrow.includes('..>')) {
      type = 'dependency';
    } else if (arrow.includes('<..')) {
      source = rightName;
      target = leftName;
      type = 'dependency';
    } else {
      type = 'association';
    }

    // Asegurar que existan ambas clases
    [source, target].forEach((name) => {
      if (!classMap[name.toLowerCase()]) {
        const newCls: ParsedUmlClass = {
          name,
          attributes: [],
          methods: [],
        };
        classes.push(newCls);
        classMap[name.toLowerCase()] = newCls;
      }
    });

    relations.push({
      source,
      target,
      type,
      sourceMultiplicity,
      targetMultiplicity,
      label,
    });
  }

  assignDefaultGridPositions(classes);

  return { packageName, classes, relations };
}

/**
 * Auto-asigna posiciones en cuadrícula estética si las clases no traen coordenadas
 */
function assignDefaultGridPositions(classes: ParsedUmlClass[]) {
  const columns = Math.ceil(Math.sqrt(classes.length)) || 2;
  const colSpacing = 340;
  const rowSpacing = 240;
  const startX = 140;
  const startY = 120;

  classes.forEach((cls, idx) => {
    if (!cls.position || (cls.position.x === 0 && cls.position.y === 0)) {
      const col = idx % columns;
      const row = Math.floor(idx / columns);
      cls.position = {
        x: startX + col * colSpacing,
        y: startY + row * rowSpacing,
      };
    }
  });
}

/**
 * Función principal que detecta si el contenido es XMI/XML o PlantUML y lo procesa
 */
export function parseUmlFileContent(content: string, filename: string = ''): ParsedUmlResult {
  const trimmed = content.trim();

  // Si tiene cabecera XML o etiquetas XMI/UML
  if (
    trimmed.startsWith('<?xml') ||
    trimmed.includes('<xmi:XMI') ||
    trimmed.includes('<XMI') ||
    trimmed.includes('<uml:Model') ||
    filename.endsWith('.xmi') ||
    filename.endsWith('.xml')
  ) {
    return parseXmi(content);
  }

  // Si tiene directivas PlantUML o termina en .puml / .plantuml
  if (
    trimmed.includes('@startuml') ||
    trimmed.includes('class ') ||
    filename.endsWith('.puml') ||
    filename.endsWith('.plantuml')
  ) {
    return parsePlantUml(content);
  }

  // Por defecto, intentar XMI y si falla intentar PlantUML
  try {
    return parseXmi(content);
  } catch {
    return parsePlantUml(content);
  }
}
