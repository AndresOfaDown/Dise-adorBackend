import re
import xml.etree.ElementTree as ET
from xml.dom import minidom

def escape_xml(s: str) -> str:
    if not s:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )

def map_visibility(v: str) -> str:
    v = str(v).strip()
    if v == "-":
        return "private"
    elif v == "#":
        return "protected"
    elif v == "~":
        return "package"
    return "public"

def export_diagram_to_xmi(nodes: list, edges: list, package_name: str = "com.example.uml") -> str:
    """
    Convierte nodos y aristas de ReactFlow a un documento XMI 2.1 estándar (UML 2.1)
    compatible con Enterprise Architect y herramientas OMG UML.
    """
    class_nodes = [n for n in nodes if n.get("type") == "umlClass" and n.get("data", {}).get("name")]

    node_id_to_xmi = {}
    for idx, node in enumerate(class_nodes):
        raw_name = node.get("data", {}).get("name", f"Class{idx+1}")
        clean_name = re.sub(r'[^a-zA-Z0-9_]', '', raw_name)
        node_id_to_xmi[node.get("id")] = f"EA_CLS_{idx+1}_{clean_name}"

    # Identificar associationClass y sus clases intermedias
    assoc_class_node_ids = set()
    for edge in edges:
        data = edge.get("data", {})
        if data.get("relationType") == "associationClass" and data.get("associationClassId"):
            assoc_class_node_ids.add(data.get("associationClassId"))

    xml = ['<?xml version="1.0" encoding="UTF-8"?>']
    xml.append('<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">')
    xml.append('  <xmi:Documentation exporter="UMLWebArchitect" exporterVersion="1.0"/>')
    xml.append('  <uml:Model xmi:type="uml:Model" name="Model" xmi:id="EA_Root_Model">')
    xml.append(f'    <packagedElement xmi:type="uml:Package" name="{escape_xml(package_name)}" xmi:id="EA_PKG_Main">')

    # 1. Exportar Clases
    for node in class_nodes:
        data = node.get("data", {})
        cls_id = node_id_to_xmi.get(node.get("id"))
        cls_name = data.get("name", "")
        is_assoc_class = node.get("id") in assoc_class_node_ids
        elem_type = "uml:AssociationClass" if is_assoc_class else "uml:Class"

        xml.append(f'      <packagedElement xmi:type="{elem_type}" name="{escape_xml(cls_name)}" xmi:id="{cls_id}">')

        # Atributos
        for a_idx, attr in enumerate(data.get("attributes", [])):
            attr_id = f"{cls_id}_attr_{a_idx+1}"
            attr_name = attr.get("name", f"attr_{a_idx+1}")
            vis = map_visibility(attr.get("visibility", "+"))
            attr_type = attr.get("type", "String")
            xml.append(f'        <ownedAttribute xmi:type="uml:Property" name="{escape_xml(attr_name)}" visibility="{vis}" xmi:id="{attr_id}">')
            xml.append(f'          <type xmi:type="uml:PrimitiveType" href="http://schema.omg.org/spec/UML/2.1/uml.xml#{escape_xml(attr_type)}"/>')
            xml.append('        </ownedAttribute>')

        # Métodos
        for m_idx, meth in enumerate(data.get("methods", [])):
            meth_id = f"{cls_id}_op_{m_idx+1}"
            meth_name = meth.get("name", f"op_{m_idx+1}")
            vis = map_visibility(meth.get("visibility", "+"))
            ret_type = meth.get("returnType", "void")
            xml.append(f'        <ownedOperation xmi:type="uml:Operation" name="{escape_xml(meth_name)}" visibility="{vis}" xmi:id="{meth_id}">')
            if ret_type:
                xml.append('          <ownedParameter xmi:type="uml:Parameter" name="return" direction="return">')
                xml.append(f'            <type xmi:type="uml:PrimitiveType" href="http://schema.omg.org/spec/UML/2.1/uml.xml#{escape_xml(ret_type)}"/>')
                xml.append('          </ownedParameter>')
            xml.append('        </ownedOperation>')

        # Generalizaciones
        out_gens = [
            e for e in edges
            if e.get("source") == node.get("id") and e.get("data", {}).get("relationType") in ("generalization", "inheritance")
        ]
        for g_idx, gen_edge in enumerate(out_gens):
            target_id = node_id_to_xmi.get(gen_edge.get("target"))
            if target_id:
                xml.append(f'        <generalization xmi:type="uml:Generalization" general="{target_id}" xmi:id="{cls_id}_gen_{g_idx+1}"/>')

        xml.append('      </packagedElement>')

    # 2. Exportar Asociaciones / Relaciones
    for e_idx, edge in enumerate(edges):
        rel_data = edge.get("data", {})
        rel_type = rel_data.get("relationType", "association")
        if rel_type in ("generalization", "inheritance"):
            continue

        src_xmi = node_id_to_xmi.get(edge.get("source"))
        tgt_xmi = node_id_to_xmi.get(edge.get("target"))
        if not src_xmi or not tgt_xmi:
            continue

        assoc_id = f"EA_ASSOC_{e_idx+1}"
        label = rel_data.get("label", "")
        src_mult = rel_data.get("sourceMultiplicity", "")
        tgt_mult = rel_data.get("targetMultiplicity", "")

        if rel_type == "dependency":
            xml.append(f'      <packagedElement xmi:type="uml:Dependency" name="{escape_xml(label)}" client="{src_xmi}" supplier="{tgt_xmi}" xmi:id="{assoc_id}"/>')
            continue

        agg_type = "none"
        if rel_type == "aggregation":
            agg_type = "shared"
        elif rel_type == "composition":
            agg_type = "composite"

        extra_attr = ""
        if rel_type == "associationClass" and rel_data.get("associationClassId"):
            inter_id = node_id_to_xmi.get(rel_data.get("associationClassId"))
            if inter_id:
                extra_attr = f' associationClass="{inter_id}"'

        end1_id = f"{assoc_id}_end1"
        end2_id = f"{assoc_id}_end2"

        xml.append(f'      <packagedElement xmi:type="uml:Association" name="{escape_xml(label)}" xmi:id="{assoc_id}"{extra_attr}>')
        xml.append(f'        <memberEnd xmi:idref="{end1_id}"/>')
        xml.append(f'        <memberEnd xmi:idref="{end2_id}"/>')
        xml.append(f'        <ownedEnd xmi:type="uml:Property" xmi:id="{end1_id}" type="{src_xmi}" aggregation="none">')
        if src_mult:
            xml.append(f'          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="{end1_id}_lower" value="{escape_xml(src_mult)}"/>')
        xml.append('        </ownedEnd>')
        xml.append(f'        <ownedEnd xmi:type="uml:Property" xmi:id="{end2_id}" type="{tgt_xmi}" aggregation="{agg_type}">')
        if tgt_mult:
            xml.append(f'          <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="{end2_id}_upper" value="{escape_xml(tgt_mult)}"/>')
        xml.append('        </ownedEnd>')
        xml.append('      </packagedElement>')

    xml.append('    </packagedElement>')
    xml.append('  </uml:Model>')

    # 3. Extensión de Coordenadas de Enterprise Architect
    xml.append('  <xmi:Extension extender="Enterprise Architect" extenderID="6.5">')
    xml.append('    <diagrams>')
    xml.append('      <diagram xmi:id="EA_DIAG_1">')
    xml.append(f'        <properties name="{escape_xml(package_name)}" type="Logical"/>')
    xml.append('        <elements>')
    for node in class_nodes:
        cls_id = node_id_to_xmi.get(node.get("id"))
        pos = node.get("position", {})
        left = int(pos.get("x", 100))
        top = int(pos.get("y", 100))
        right = left + 220
        bottom = top + 160
        xml.append(f'          <element subject="{cls_id}" geometry="Left={left};Top={top};Right={right};Bottom={bottom};" seqno="1" style="DUID={cls_id};"/>')
    xml.append('        </elements>')
    xml.append('      </diagram>')
    xml.append('    </diagrams>')
    xml.append('  </xmi:Extension>')
    xml.append('</xmi:XMI>')

    return "\n".join(xml)


def export_diagram_to_puml(nodes: list, edges: list, package_name: str = "com.example.uml") -> str:
    """
    Convierte nodos y aristas a código PlantUML (.puml)
    """
    class_nodes = [n for n in nodes if n.get("type") == "umlClass" and n.get("data", {}).get("name")]

    node_id_to_name = {}
    for node in class_nodes:
        name = node.get("data", {}).get("name", "").strip()
        safe_name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
        node_id_to_name[node.get("id")] = safe_name

    puml = [
        "@startuml",
        "skinparam classAttributeIconSize 0",
        f'package "{package_name}" {{',
    ]

    for node in class_nodes:
        data = node.get("data", {})
        name = node_id_to_name.get(node.get("id"), "Clase")
        stereotype = data.get("stereotype", "")
        st_str = f" <<{stereotype}>>" if stereotype else ""
        puml.append(f"  class {name}{st_str} {{")

        for attr in data.get("attributes", []):
            vis = attr.get("visibility", "+")
            a_name = attr.get("name", "")
            a_type = attr.get("type", "")
            t_str = f": {a_type}" if a_type else ""
            puml.append(f"    {vis} {a_name}{t_str}")

        if data.get("attributes") and data.get("methods"):
            puml.append("    --")

        for meth in data.get("methods", []):
            vis = meth.get("visibility", "+")
            m_name = meth.get("name", "")
            params = meth.get("parameters", "")
            ret = meth.get("returnType", "")
            p_str = f"({params})" if params else "()"
            r_str = f": {ret}" if ret else ""
            puml.append(f"    {vis} {m_name}{p_str}{r_str}")

        puml.append("  }")

    puml.append("}")
    puml.append("")

    for edge in edges:
        data = edge.get("data", {})
        rel_type = data.get("relationType", "association")
        src_name = node_id_to_name.get(edge.get("source"))
        tgt_name = node_id_to_name.get(edge.get("target"))
        if not src_name or not tgt_name:
            continue

        label = f" : {data.get('label')}" if data.get("label") else ""
        src_mult = f'"{data.get("sourceMultiplicity")}" ' if data.get("sourceMultiplicity") else ""
        tgt_mult = f' "{data.get("targetMultiplicity")}"' if data.get("targetMultiplicity") else ""

        if rel_type in ("generalization", "inheritance"):
            puml.append(f"{tgt_name} <|-- {src_name}{label}")
        elif rel_type == "composition":
            puml.append(f"{src_name} {src_mult}*--{tgt_mult} {tgt_name}{label}")
        elif rel_type == "aggregation":
            puml.append(f"{src_name} {src_mult}o--{tgt_mult} {tgt_name}{label}")
        elif rel_type == "dependency":
            puml.append(f"{src_name} {src_mult}..>{tgt_mult} {tgt_name}{label}")
        elif rel_type == "associationClass":
            inter_id = data.get("associationClassId")
            inter_name = node_id_to_name.get(inter_id) if inter_id else None
            if inter_name:
                puml.append(f"({src_name}, {tgt_name}) .. {inter_name}{label}")
            else:
                puml.append(f"{src_name} {src_mult}--{tgt_mult} {tgt_name}{label}")
        else:
            puml.append(f"{src_name} {src_mult}--{tgt_mult} {tgt_name}{label}")

    puml.append("@enduml")
    return "\n".join(puml)


def parse_uml_file(content: str, filename: str = "") -> dict:
    """
    Analiza archivos XMI o PlantUML y extrae clases, relaciones y posiciones
    """
    clean = content.strip()
    is_xml = (
        clean.startswith("<?xml") or
        "<xmi:XMI" in clean or
        "<XMI" in clean or
        "<uml:Model" in clean or
        filename.endswith((".xmi", ".xml"))
    )

    if is_xml:
        return _parse_xmi(content)
    else:
        return _parse_plantuml(content)


def _parse_xmi(xml_content: str) -> dict:
    root = ET.fromstring(xml_content)

    classes = []
    relations = []
    id_to_name = {}
    primitive_types = {}
    ea_attribute_types = {}

    def _clean_tag(t):
        return t.split('}')[-1]

    def _clean_type(raw):
        if not raw:
            return "string"
        c = raw.strip()
        if '#' in c:
            c = c.split('#')[-1]
        if c.lower().startswith('uml:'):
            c = c.split(':')[-1]
            if c.lower() in ('property', 'class', 'primitivetype', 'operation', 'parameter'):
                return "string"
        c = re.sub(r'^EA[A-Za-z0-9]*_', '', c)
        c = re.sub(r'_(?:PK|FK)_?$', '', c, flags=re.I)
        low = c.lower()
        if low in ('integer', 'int'): return 'int'
        if low in ('string', 'varchar', 'text', 'char'): return 'string'
        if low in ('boolean', 'bool'): return 'boolean'
        if low in ('double',): return 'double'
        if low in ('float', 'real', 'decimal', 'unlimitednatural'): return 'float'
        if low in ('date', 'datetime', 'timestamp', 'time'): return 'date'
        if low in ('long', 'bigint'): return 'long'
        if low in ('void',): return 'void'
        return c or 'string'

    # Pre-indexar IDs y tipos
    for elem in root.iter():
        tag = _clean_tag(elem.tag)
        xmi_type = elem.attrib.get('{http://schema.omg.org/spec/XMI/2.1}type') or elem.attrib.get('xmi:type') or ''
        name = elem.attrib.get('name')
        eid = elem.attrib.get('{http://schema.omg.org/spec/XMI/2.1}id') or elem.attrib.get('xmi:id') or elem.attrib.get('{http://schema.omg.org/spec/XMI/2.1}idref') or elem.attrib.get('xmi:idref') or elem.attrib.get('id')

        if eid and name:
            id_to_name[eid] = name

        if 'PrimitiveType' in xmi_type or tag == 'PrimitiveType':
            if eid and name:
                primitive_types[eid] = name

        if tag == 'attribute':
            prop = elem.find('properties')
            if prop is not None and eid:
                ptype = prop.attrib.get('type')
                if ptype:
                    ea_attribute_types[eid] = ptype

    # Extraer clases
    for elem in root.iter():
        tag = _clean_tag(elem.tag)
        xmi_type = elem.attrib.get('{http://schema.omg.org/spec/XMI/2.1}type') or elem.attrib.get('xmi:type') or elem.attrib.get('type') or ''

        is_assoc_only = (xmi_type == 'uml:Association' or tag == 'Association') and 'AssociationClass' not in xmi_type and tag != 'AssociationClass'

        if (tag in ('Class', 'AssociationClass') or 'Class' in xmi_type) and not is_assoc_only:
            cls_name = elem.attrib.get('name')
            cls_id = elem.attrib.get('{http://schema.omg.org/spec/XMI/2.1}id') or elem.attrib.get('xmi:id') or elem.attrib.get('id')

            if cls_name and cls_id:
                id_to_name[cls_id] = cls_name
                attrs = []
                methods = []

                for child in elem:
                    c_tag = _clean_tag(child.tag)
                    c_type = child.attrib.get('{http://schema.omg.org/spec/XMI/2.1}type') or child.attrib.get('xmi:type') or ''

                    if c_tag in ('Property', 'Attribute') or 'Property' in c_type or c_tag == 'ownedAttribute':
                        a_name = child.attrib.get('name')
                        if not a_name or child.attrib.get('association'):
                            continue
                        a_id = child.attrib.get('{http://schema.omg.org/spec/XMI/2.1}id') or child.attrib.get('xmi:id') or child.attrib.get('id')

                        t_name = ''
                        if a_id and a_id in ea_attribute_types:
                            t_name = _clean_type(ea_attribute_types[a_id])
                        if not t_name:
                            type_child = child.find('type')
                            if type_child is not None:
                                tidref = type_child.attrib.get('{http://schema.omg.org/spec/XMI/2.1}idref') or type_child.attrib.get('xmi:idref') or type_child.attrib.get('href')
                                if tidref:
                                    if tidref in primitive_types:
                                        t_name = _clean_type(primitive_types[tidref])
                                    elif tidref in id_to_name:
                                        t_name = id_to_name[tidref]
                                    else:
                                        t_name = _clean_type(tidref)
                        if not t_name:
                            direct_t = child.attrib.get('type')
                            if direct_t and not direct_t.startswith('uml:'):
                                t_name = _clean_type(direct_t)

                        if not t_name or t_name.lower() == 'uml':
                            t_name = 'string'

                        attrs.append(f"- {a_name}: {t_name}")

                    elif c_tag in ('Operation',) or 'Operation' in c_type or c_tag == 'ownedOperation':
                        o_name = child.attrib.get('name')
                        if o_name:
                            methods.append(f"+ {o_name}(): void")

                    elif c_tag in ('Generalization', 'generalization') or 'Generalization' in c_type:
                        gen_target = child.attrib.get('general')
                        if gen_target:
                            relations.append({
                                'source_id': cls_id,
                                'target_id': gen_target,
                                'type': 'generalization',
                            })

                classes.append({
                    'id': cls_id,
                    'name': cls_name,
                    'attributes': attrs,
                    'methods': methods,
                })

    # Extraer conectores propietarios de Enterprise Architect si existen
    for elem in root.iter():
        tag = _clean_tag(elem.tag)
        if tag == 'connector':
            src_el = elem.find('source')
            tgt_el = elem.find('target')
            prop_el = elem.find('properties')
            labels_el = elem.find('labels')

            src_id = (src_el.attrib.get('{http://schema.omg.org/spec/XMI/2.1}idref') or src_el.attrib.get('xmi:idref')) if src_el is not None else ''
            tgt_id = (tgt_el.attrib.get('{http://schema.omg.org/spec/XMI/2.1}idref') or tgt_el.attrib.get('xmi:idref')) if tgt_el is not None else ''

            ea_type = prop_el.attrib.get('ea_type') if prop_el is not None else 'Association'
            subtype = prop_el.attrib.get('subtype') if prop_el is not None else ''

            src_t = src_el.find('type') if src_el is not None else None
            tgt_t = tgt_el.find('type') if tgt_el is not None else None

            mult1 = src_t.attrib.get('multiplicity', '') if src_t is not None else ''
            mult2 = tgt_t.attrib.get('multiplicity', '') if tgt_t is not None else ''
            if not mult1 and labels_el is not None: mult1 = labels_el.attrib.get('lb', '')
            if not mult2 and labels_el is not None: mult2 = labels_el.attrib.get('rb', '')

            agg1 = src_t.attrib.get('aggregation', 'none') if src_t is not None else 'none'
            agg2 = tgt_t.attrib.get('aggregation', 'none') if tgt_t is not None else 'none'

            rel_type = 'association'
            if ea_type == 'Generalization':
                rel_type = 'generalization'
            elif ea_type == 'Dependency':
                rel_type = 'dependency'
            elif agg2 == 'composite' or agg1 == 'composite' or subtype == 'Strong':
                rel_type = 'composition'
            elif agg2 == 'shared' or agg1 == 'shared' or subtype == 'Weak':
                rel_type = 'aggregation'

            final_src_id = src_id
            final_tgt_id = tgt_id
            final_m1 = mult1
            final_m2 = mult2

            if rel_type in ('composition', 'aggregation'):
                if agg2 in ('composite', 'shared'):
                    final_src_id = tgt_id
                    final_tgt_id = src_id
                    final_m1 = mult2
                    final_m2 = mult1

            relations.append({
                'source_id': final_src_id,
                'target_id': final_tgt_id,
                'type': rel_type,
                'sourceMultiplicity': final_m1,
                'targetMultiplicity': final_m2,
            })

    # Mapear nombres a relaciones
    final_relations = []
    for rel in relations:
        src = id_to_name.get(rel.get('source_id'))
        tgt = id_to_name.get(rel.get('target_id'))
        if src and tgt:
            # Evitar duplicados
            r_type = rel.get('type', 'generalization')
            if not any(r['source'] == src and r['target'] == tgt and r['type'] == r_type for r in final_relations):
                final_relations.append({
                    'source': src,
                    'target': tgt,
                    'type': r_type,
                    'sourceMultiplicity': rel.get('sourceMultiplicity', ''),
                    'targetMultiplicity': rel.get('targetMultiplicity', ''),
                    'label': '',
                })

    # Asignar posiciones en cuadrícula
    for idx, cls in enumerate(classes):
        col = idx % 3
        row = idx // 3
        cls['position'] = {'x': 140 + col * 320, 'y': 120 + row * 240}

    return {
        'classes': classes,
        'relations': final_relations,
    }


def _parse_plantuml(puml_content: str) -> dict:
    classes = []
    relations = []
    class_map = {}

    class_blocks = re.findall(r'class\s+([a-zA-Z0-9_]+)(?:\s*<<([^>]+)>>)?\s*\{([^}]*)\}', puml_content)
    for name, stereotype, body in class_blocks:
        attrs = []
        methods = []
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith(('--', '==', '..', "'")):
                continue
            if '(' in line and ')' in line:
                methods.append(line)
            else:
                attrs.append(line)

        cls_obj = {
            'name': name,
            'stereotype': stereotype.strip() if stereotype else '',
            'attributes': attrs,
            'methods': methods,
        }
        classes.append(cls_obj)
        class_map[name.lower()] = cls_obj

    # Relaciones de asociación de clase: (A, B) .. C
    assoc_classes = re.findall(r'\(\s*([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)\s*\)\s*\.{1,2}\s*([a-zA-Z0-9_]+)', puml_content)
    for src, tgt, inter in assoc_classes:
        relations.append({
            'source': src,
            'target': tgt,
            'type': 'associationClass',
            'associationClassName': inter,
            'label': '',
        })

    # Remover líneas de association class para no generar duplicados en relaciones estándar
    clean_puml_for_rels = re.sub(r'\([^\)]*\)\s*\.{1,2}\s*[a-zA-Z0-9_]+[^\n]*', '', puml_content)
    # Remover declaraciones de paquetes
    clean_puml_for_rels = re.sub(r'package\s+["\'][^"\']+["\']\s*\{', '', clean_puml_for_rels)
    clean_puml_for_rels = re.sub(r'package\s+[a-zA-Z0-9_.]+\s*\{', '', clean_puml_for_rels)

    # Relaciones estándar (flechas UML de al menos 2 caracteres con - o .)
    rel_matches = re.findall(
        r'([a-zA-Z0-9_]+)\s*(?:"([^"]*)")?\s*([<*o|]*[-.]{2,}[|>*o]*)\s*(?:"([^"]*)")?\s*([a-zA-Z0-9_]+)(?:\s*:\s*([^\n]+))?',
        clean_puml_for_rels
    )
    for left, mult_l, arrow, mult_r, right, label in rel_matches:
        if left.startswith('(') or right.endswith(')'):
            continue

        rel_type = 'association'
        src, tgt = left, right
        if '<|--' in arrow:
            src, tgt = right, left
            rel_type = 'generalization'
        elif '--|>' in arrow:
            rel_type = 'generalization'
        elif '*--' in arrow:
            rel_type = 'composition'
        elif 'o--' in arrow:
            rel_type = 'aggregation'
        elif '..>' in arrow:
            rel_type = 'dependency'

        relations.append({
            'source': src,
            'target': tgt,
            'type': rel_type,
            'sourceMultiplicity': mult_l or '',
            'targetMultiplicity': mult_r or '',
            'label': label.strip() if label else '',
        })

    for idx, cls in enumerate(classes):
        col = idx % 3
        row = idx // 3
        cls['position'] = {'x': 140 + col * 320, 'y': 120 + row * 240}

    return {
        'classes': classes,
        'relations': relations,
    }
