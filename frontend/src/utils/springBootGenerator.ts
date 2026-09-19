import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Node, Edge } from 'reactflow';
import type { UmlClassNodeData, UmlRelationType } from '../store/diagramStore';

export interface SpringBootConfig {
  projectName: string;
  packageName: string;
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  serverPort: string;
  javaVersion: string;
}

export const DEFAULT_SPRING_CONFIG: SpringBootConfig = {
  projectName: 'backend-service',
  packageName: 'com.example.backend',
  dbHost: 'localhost',
  dbPort: '5432',
  dbName: 'uml_db',
  dbUser: 'postgres',
  dbPassword: 'postgres',
  serverPort: '8080',
  javaVersion: '17',
};

export interface GeneratedFile {
  path: string;
  content: string;
  language: 'java' | 'properties' | 'xml' | 'markdown';
}

// Mapeo de tipos de UML a tipos de datos de Java
const mapUmlToJavaType = (umlType: string): string => {
  const t = (umlType || 'string').toLowerCase().trim();
  if (t === 'int' || t === 'integer') return 'Integer';
  if (t === 'long' || t === 'id' || t === 'bigint') return 'Long';
  if (t === 'float') return 'Float';
  if (t === 'double' || t === 'decimal' || t === 'numeric') return 'Double';
  if (t === 'bool' || t === 'boolean') return 'Boolean';
  if (t === 'date') return 'LocalDate';
  if (t === 'datetime' || t === 'timestamp') return 'LocalDateTime';
  if (t === 'char' || t === 'character') return 'Character';
  if (t === 'byte') return 'Byte';
  if (t === 'list' || t.startsWith('list<')) return 'List<String>';
  if (t === 'set' || t.startsWith('set<')) return 'Set<String>';
  return 'String';
};

// Convertir a PascalCase (ej: "detalle_pedido" -> "DetallePedido")
const toPascalCase = (str: string): string => {
  if (!str) return 'Entity';
  const clean = str.replace(/[^a-zA-Z0-9_]/g, '');
  return clean
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
};

// Convertir a camelCase (ej: "DetallePedido" -> "detallePedido")
const toCamelCase = (str: string): string => {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

// Sanitizar nombre de atributo (camelCase)
const sanitizeFieldName = (name: string): string => {
  let clean = (name || 'campo').trim();
  if (clean.includes(':')) {
    clean = clean.split(':')[0].trim();
  }
  // Limpiar modificadores de visibilidad UML (+, -, ~, #) con guion escapado
  clean = clean.replace(/^[+\-~#]+\s*/, '').trim();
  // Limpiar modificadores textuales si los tuviera
  clean = clean.replace(/^(public|private|protected)\s+/i, '').trim();
  clean = clean.replace(/[^a-zA-Z0-9_]/g, '');
  if (!clean) clean = 'campo';
  return toCamelCase(clean);
};

// Convertir a plural sencillo en minúsculas para rutas REST (ej: "Producto" -> "productos", "User" -> "users")
const toPluralEndpoint = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.endsWith('s') || lower.endsWith('z') || lower.endsWith('x')) {
    return `${lower}es`;
  }
  if (lower.endsWith('y') && !/[aeiou]y$/.test(lower)) {
    return `${lower.slice(0, -1)}ies`;
  }
  return `${lower}s`;
};

// Analizar relaciones para una entidad
interface EntityRelationInfo {
  type: 'oneToMany' | 'manyToOne' | 'manyToMany' | 'oneToOne';
  targetClass: string;
  targetFieldName: string;
  joinColumnName?: string;
  mappedBy?: string;
}

const getEntityRelations = (
  nodeId: string,
  nodeName: string,
  allNodes: Node<UmlClassNodeData>[],
  edges: Edge[]
): EntityRelationInfo[] => {
  const relations: EntityRelationInfo[] = [];

  const classMap = new Map<string, string>();
  allNodes.forEach((n) => {
    if (n.data?.name) {
      classMap.set(n.id, toPascalCase(n.data.name));
    }
  });

  edges.forEach((edge) => {
    const relType: UmlRelationType = edge.data?.relationType || 'association';
    const sourceMult = (edge.data?.sourceMultiplicity || '').replace(/\.{2,}/g, '..').trim();
    const targetMult = (edge.data?.targetMultiplicity || '').replace(/\.{2,}/g, '..').trim();

    if (edge.source === nodeId) {
      const targetName = classMap.get(edge.target);
      if (!targetName) return;

      // Muchos a muchos (associationClass)
      if (relType === 'associationClass') {
        const intermediateNode = edge.data?.associationClassId
          ? allNodes.find((n) => n.id === edge.data.associationClassId)
          : null;
        if (intermediateNode) {
          const intermediateName = toPascalCase(intermediateNode.data?.name || 'Intermedia');
          relations.push({
            type: 'oneToMany',
            targetClass: intermediateName,
            targetFieldName: toCamelCase(toPluralEndpoint(intermediateName)),
            mappedBy: toCamelCase(nodeName),
          });
        } else {
          relations.push({
            type: 'manyToMany',
            targetClass: targetName,
            targetFieldName: toCamelCase(toPluralEndpoint(targetName)),
          });
        }
        return;
      }

      // 1 a Muchos
      if (targetMult.includes('*') && !sourceMult.includes('*')) {
        relations.push({
          type: 'oneToMany',
          targetClass: targetName,
          targetFieldName: toCamelCase(toPluralEndpoint(targetName)),
          mappedBy: toCamelCase(nodeName),
        });
      }
      // Muchos a 1
      else if (sourceMult.includes('*') && !targetMult.includes('*')) {
        relations.push({
          type: 'manyToOne',
          targetClass: targetName,
          targetFieldName: toCamelCase(targetName),
          joinColumnName: `${toCamelCase(targetName)}_id`,
        });
      }
      // Muchos a Muchos (* a *)
      else if (sourceMult.includes('*') && targetMult.includes('*')) {
        relations.push({
          type: 'manyToMany',
          targetClass: targetName,
          targetFieldName: toCamelCase(toPluralEndpoint(targetName)),
        });
      }
      // 1 a 1
      else if (sourceMult === '1' && targetMult === '1') {
        relations.push({
          type: 'oneToOne',
          targetClass: targetName,
          targetFieldName: toCamelCase(targetName),
        });
      } else {
        // Asociación por defecto: manyToOne
        relations.push({
          type: 'manyToOne',
          targetClass: targetName,
          targetFieldName: toCamelCase(targetName),
          joinColumnName: `${toCamelCase(targetName)}_id`,
        });
      }
    } else if (edge.target === nodeId) {
      const sourceName = classMap.get(edge.source);
      if (!sourceName) return;

      // Si es el lado destino de un 1 a Muchos (es decir, el lado 'Muchos')
      if (targetMult.includes('*') && !sourceMult.includes('*')) {
        relations.push({
          type: 'manyToOne',
          targetClass: sourceName,
          targetFieldName: toCamelCase(sourceName),
          joinColumnName: `${toCamelCase(sourceName)}_id`,
        });
      }
      // Si es el lado destino de un Muchos a 1 (es decir, el lado '1')
      else if (sourceMult.includes('*') && !targetMult.includes('*')) {
        relations.push({
          type: 'oneToMany',
          targetClass: sourceName,
          targetFieldName: toCamelCase(toPluralEndpoint(sourceName)),
          mappedBy: toCamelCase(nodeName),
        });
      }
      // Si es associationClass y este nodo es el destino
      else if (relType === 'associationClass') {
        const intermediateNode = edge.data?.associationClassId
          ? allNodes.find((n) => n.id === edge.data.associationClassId)
          : null;
        if (intermediateNode) {
          const intermediateName = toPascalCase(intermediateNode.data?.name || 'Intermedia');
          relations.push({
            type: 'oneToMany',
            targetClass: intermediateName,
            targetFieldName: toCamelCase(toPluralEndpoint(intermediateName)),
            mappedBy: toCamelCase(nodeName),
          });
        }
      }
    }
  });

  return relations;
};

// -------------------------------------------------------------
// 1. GENERADOR DE LA CAPA MODELO (Entity)
// -------------------------------------------------------------
export const generateEntityCode = (
  node: Node<UmlClassNodeData>,
  allNodes: Node<UmlClassNodeData>[],
  edges: Edge[],
  packageName: string
): string => {
  const className = toPascalCase(node.data?.name || 'Entity');
  const tableName = node.data?.name?.toLowerCase().trim() || 'entity';
  const rawAttributes = node.data?.attributes || [];

  // Filtrar si el usuario ya definió un atributo llamado 'id'
  const hasCustomId = rawAttributes.some((a) => sanitizeFieldName(a.name) === 'id');
  const idType = hasCustomId
    ? mapUmlToJavaType(rawAttributes.find((a) => sanitizeFieldName(a.name) === 'id')?.type || 'long')
    : 'Long';

  const fields = rawAttributes
    .filter((a) => sanitizeFieldName(a.name) !== 'id')
    .map((attr) => ({
      name: sanitizeFieldName(attr.name),
      type: mapUmlToJavaType(attr.type),
      originalName: attr.name,
    }));

  const relations = getEntityRelations(node.id, className, allNodes, edges);

  const needsLocalDate = fields.some((f) => f.type === 'LocalDate');
  const needsLocalDateTime = fields.some((f) => f.type === 'LocalDateTime');
  const needsList = relations.some((r) => r.type === 'oneToMany' || r.type === 'manyToMany');

  let code = `package ${packageName}.model;\n\n`;
  code += `import jakarta.persistence.*;\n`;
  code += `import com.fasterxml.jackson.annotation.JsonIgnoreProperties;\n`;
  if (needsLocalDate) code += `import java.time.LocalDate;\n`;
  if (needsLocalDateTime) code += `import java.time.LocalDateTime;\n`;
  if (needsList) code += `import java.util.List;\nimport java.util.ArrayList;\n`;

  code += `\n/**\n * Entidad JPA generada automáticamente a partir del diagrama UML.\n * Compatible con Java 17, 21, 22 y 23+. No requiere plugins de Lombok.\n */\n`;
  code += `@Entity\n`;
  code += `@Table(name = "${tableName}")\n`;
  code += `public class ${className} {\n\n`;

  // ID Clave Primaria
  code += `    @Id\n`;
  code += `    @GeneratedValue(strategy = GenerationType.IDENTITY)\n`;
  code += `    private ${idType} id;\n\n`;

  // Atributos
  fields.forEach((f) => {
    code += `    @Column(name = "${f.name}")\n`;
    code += `    private ${f.type} ${f.name};\n\n`;
  });

  // Relaciones
  relations.forEach((rel) => {
    if (rel.type === 'oneToMany') {
      code += `    @OneToMany(mappedBy = "${rel.mappedBy}", cascade = CascadeType.ALL, orphanRemoval = true)\n`;
      code += `    @JsonIgnoreProperties("${rel.mappedBy}")\n`;
      code += `    private List<${rel.targetClass}> ${rel.targetFieldName} = new ArrayList<>();\n\n`;
    } else if (rel.type === 'manyToOne') {
      code += `    @ManyToOne(fetch = FetchType.LAZY)\n`;
      code += `    @JoinColumn(name = "${rel.joinColumnName || `${rel.targetFieldName}_id`}")\n`;
      code += `    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})\n`;
      code += `    private ${rel.targetClass} ${rel.targetFieldName};\n\n`;
    } else if (rel.type === 'manyToMany') {
      code += `    @ManyToMany\n`;
      code += `    @JoinTable(\n`;
      code += `        name = "${tableName}_${rel.targetClass.toLowerCase()}",\n`;
      code += `        joinColumns = @JoinColumn(name = "${tableName}_id"),\n`;
      code += `        inverseJoinColumns = @JoinColumn(name = "${rel.targetClass.toLowerCase()}_id")\n`;
      code += `    )\n`;
      code += `    private List<${rel.targetClass}> ${rel.targetFieldName} = new ArrayList<>();\n\n`;
    } else if (rel.type === 'oneToOne') {
      code += `    @OneToOne(cascade = CascadeType.ALL)\n`;
      code += `    @JoinColumn(name = "${rel.targetFieldName}_id", referencedColumnName = "id")\n`;
      code += `    private ${rel.targetClass} ${rel.targetFieldName};\n\n`;
    }
  });

  // Constructores estándar (Requeridos por JPA y utilizables en cualquier versión de Java)
  code += `    // ===== Constructor vacío (Requerido por JPA/Hibernate) =====\n`;
  code += `    public ${className}() {\n`;
  code += `    }\n\n`;

  // Constructor completo con parámetros
  const constructorParams = [`${idType} id`, ...fields.map((f) => `${f.type} ${f.name}`)].join(', ');
  code += `    // ===== Constructor con argumentos =====\n`;
  code += `    public ${className}(${constructorParams}) {\n`;
  code += `        this.id = id;\n`;
  fields.forEach((f) => {
    code += `        this.${f.name} = ${f.name};\n`;
  });
  code += `    }\n\n`;

  // Getters y Setters explícitos
  code += `    // ===== Getters y Setters =====\n`;
  code += `    public ${idType} getId() {\n        return id;\n    }\n\n`;
  code += `    public void setId(${idType} id) {\n        this.id = id;\n    }\n\n`;

  fields.forEach((f) => {
    const capitalized = f.name.charAt(0).toUpperCase() + f.name.slice(1);
    code += `    public ${f.type} get${capitalized}() {\n        return ${f.name};\n    }\n\n`;
    code += `    public void set${capitalized}(${f.type} ${f.name}) {\n        this.${f.name} = ${f.name};\n    }\n\n`;
  });

  relations.forEach((rel) => {
    const capitalized = rel.targetFieldName.charAt(0).toUpperCase() + rel.targetFieldName.slice(1);
    if (rel.type === 'oneToMany' || rel.type === 'manyToMany') {
      code += `    public List<${rel.targetClass}> get${capitalized}() {\n        return ${rel.targetFieldName};\n    }\n\n`;
      code += `    public void set${capitalized}(List<${rel.targetClass}> ${rel.targetFieldName}) {\n        this.${rel.targetFieldName} = ${rel.targetFieldName};\n    }\n\n`;
    } else {
      code += `    public ${rel.targetClass} get${capitalized}() {\n        return ${rel.targetFieldName};\n    }\n\n`;
      code += `    public void set${capitalized}(${rel.targetClass} ${rel.targetFieldName}) {\n        this.${rel.targetFieldName} = ${rel.targetFieldName};\n    }\n\n`;
    }
  });

  // toString()
  const toStringParts = fields.map((f) => `", ${f.name}='" + ${f.name} + '\\''`).join(' +\n                ');
  code += `    // ===== toString =====\n`;
  code += `    @Override\n`;
  code += `    public String toString() {\n`;
  code += `        return "${className}{" +\n`;
  code += `                "id=" + id${toStringParts ? ` +\n                ${toStringParts}` : ''} +\n`;
  code += `                '}';\n`;
  code += `    }\n`;

  code += `}\n`;
  return code;
};

// -------------------------------------------------------------
// 2. GENERADOR DE LA CAPA REPOSITORIO (Repository)
// -------------------------------------------------------------
export const generateRepositoryCode = (
  node: Node<UmlClassNodeData>,
  packageName: string
): string => {
  const className = toPascalCase(node.data?.name || 'Entity');
  const rawAttributes = node.data?.attributes || [];
  const hasCustomId = rawAttributes.some((a) => sanitizeFieldName(a.name) === 'id');
  const idType = hasCustomId
    ? mapUmlToJavaType(rawAttributes.find((a) => sanitizeFieldName(a.name) === 'id')?.type || 'long')
    : 'Long';

  let code = `package ${packageName}.repository;\n\n`;
  code += `import ${packageName}.model.${className};\n`;
  code += `import org.springframework.data.jpa.repository.JpaRepository;\n`;
  code += `import org.springframework.stereotype.Repository;\n\n`;
  code += `/**\n * Repositorio Spring Data JPA para la entidad ${className}.\n */\n`;
  code += `@Repository\n`;
  code += `public interface ${className}Repository extends JpaRepository<${className}, ${idType}> {\n`;
  code += `    // Métodos personalizados de consulta pueden ser definidos aquí\n`;
  code += `}\n`;

  return code;
};

// -------------------------------------------------------------
// 3. GENERADOR DE LA CAPA SERVICIO (Interface e Implementación)
// -------------------------------------------------------------
export const generateServiceInterfaceCode = (
  node: Node<UmlClassNodeData>,
  packageName: string
): string => {
  const className = toPascalCase(node.data?.name || 'Entity');
  const rawAttributes = node.data?.attributes || [];
  const hasCustomId = rawAttributes.some((a) => sanitizeFieldName(a.name) === 'id');
  const idType = hasCustomId
    ? mapUmlToJavaType(rawAttributes.find((a) => sanitizeFieldName(a.name) === 'id')?.type || 'long')
    : 'Long';

  let code = `package ${packageName}.service;\n\n`;
  code += `import ${packageName}.model.${className};\n`;
  code += `import java.util.List;\n`;
  code += `import java.util.Optional;\n\n`;
  code += `/**\n * Interfaz de la capa de servicio para la entidad ${className}.\n */\n`;
  code += `public interface ${className}Service {\n\n`;
  code += `    List<${className}> findAll();\n\n`;
  code += `    Optional<${className}> findById(${idType} id);\n\n`;
  code += `    ${className} save(${className} entity);\n\n`;
  code += `    ${className} update(${idType} id, ${className} entity);\n\n`;
  code += `    void deleteById(${idType} id);\n`;
  code += `}\n`;

  return code;
};

export const generateServiceImplCode = (
  node: Node<UmlClassNodeData>,
  packageName: string
): string => {
  const className = toPascalCase(node.data?.name || 'Entity');
  const varName = toCamelCase(className);
  const repoName = `${varName}Repository`;
  const rawAttributes = node.data?.attributes || [];
  const hasCustomId = rawAttributes.some((a) => sanitizeFieldName(a.name) === 'id');
  const idType = hasCustomId
    ? mapUmlToJavaType(rawAttributes.find((a) => sanitizeFieldName(a.name) === 'id')?.type || 'long')
    : 'Long';

  let code = `package ${packageName}.service.impl;\n\n`;
  code += `import ${packageName}.model.${className};\n`;
  code += `import ${packageName}.repository.${className}Repository;\n`;
  code += `import ${packageName}.service.${className}Service;\n`;
  code += `import org.springframework.stereotype.Service;\n`;
  code += `import org.springframework.transaction.annotation.Transactional;\n`;
  code += `import java.util.List;\n`;
  code += `import java.util.Optional;\n\n`;
  code += `/**\n * Implementación de la capa de servicio para la entidad ${className}.\n */\n`;
  code += `@Service\n`;
  code += `@Transactional\n`;
  code += `public class ${className}ServiceImpl implements ${className}Service {\n\n`;
  code += `    private final ${className}Repository ${repoName};\n\n`;
  code += `    public ${className}ServiceImpl(${className}Repository ${repoName}) {\n`;
  code += `        this.${repoName} = ${repoName};\n`;
  code += `    }\n\n`;

  code += `    @Override\n`;
  code += `    @Transactional(readOnly = true)\n`;
  code += `    public List<${className}> findAll() {\n`;
  code += `        return ${repoName}.findAll();\n`;
  code += `    }\n\n`;

  code += `    @Override\n`;
  code += `    @Transactional(readOnly = true)\n`;
  code += `    public Optional<${className}> findById(${idType} id) {\n`;
  code += `        return ${repoName}.findById(id);\n`;
  code += `    }\n\n`;

  code += `    @Override\n`;
  code += `    public ${className} save(${className} entity) {\n`;
  code += `        return ${repoName}.save(entity);\n`;
  code += `    }\n\n`;

  code += `    @Override\n`;
  code += `    public ${className} update(${idType} id, ${className} entity) {\n`;
  code += `        return ${repoName}.findById(id).map(existing -> {\n`;
  code += `            entity.setId(id);\n`;
  code += `            return ${repoName}.save(entity);\n`;
  code += `        }).orElseThrow(() -> new RuntimeException("${className} no encontrado con ID: " + id));\n`;
  code += `    }\n\n`;

  code += `    @Override\n`;
  code += `    public void deleteById(${idType} id) {\n`;
  code += `        ${repoName}.deleteById(id);\n`;
  code += `    }\n`;
  code += `}\n`;

  return code;
};

// -------------------------------------------------------------
// 4. GENERADOR DE LA CAPA CONTROLADOR (Controller)
// -------------------------------------------------------------
export const generateControllerCode = (
  node: Node<UmlClassNodeData>,
  packageName: string
): string => {
  const className = toPascalCase(node.data?.name || 'Entity');
  const varName = toCamelCase(className);
  const serviceName = `${varName}Service`;
  const endpointPath = toPluralEndpoint(className);
  const rawAttributes = node.data?.attributes || [];
  const hasCustomId = rawAttributes.some((a) => sanitizeFieldName(a.name) === 'id');
  const idType = hasCustomId
    ? mapUmlToJavaType(rawAttributes.find((a) => sanitizeFieldName(a.name) === 'id')?.type || 'long')
    : 'Long';

  let code = `package ${packageName}.controller;\n\n`;
  code += `import ${packageName}.model.${className};\n`;
  code += `import ${packageName}.service.${className}Service;\n`;
  code += `import org.springframework.http.HttpStatus;\n`;
  code += `import org.springframework.http.ResponseEntity;\n`;
  code += `import org.springframework.web.bind.annotation.*;\n`;
  code += `import java.util.List;\n\n`;
  code += `/**\n * Controlador REST para la entidad ${className}.\n * Expone endpoints CRUD en /api/v1/${endpointPath}\n */\n`;
  code += `@RestController\n`;
  code += `@RequestMapping("/api/v1/${endpointPath}")\n`;
  code += `@CrossOrigin(origins = "*")\n`;
  code += `public class ${className}Controller {\n\n`;
  code += `    private final ${className}Service ${serviceName};\n\n`;
  code += `    public ${className}Controller(${className}Service ${serviceName}) {\n`;
  code += `        this.${serviceName} = ${serviceName};\n`;
  code += `    }\n\n`;

  // GET ALL
  code += `    @GetMapping\n`;
  code += `    public ResponseEntity<List<${className}>> getAll() {\n`;
  code += `        return ResponseEntity.ok(${serviceName}.findAll());\n`;
  code += `    }\n\n`;

  // GET BY ID
  code += `    @GetMapping("/{id}")\n`;
  code += `    public ResponseEntity<${className}> getById(@PathVariable ${idType} id) {\n`;
  code += `        return ${serviceName}.findById(id)\n`;
  code += `                .map(ResponseEntity::ok)\n`;
  code += `                .orElse(ResponseEntity.notFound().build());\n`;
  code += `    }\n\n`;

  // CREATE
  code += `    @PostMapping\n`;
  code += `    public ResponseEntity<${className}> create(@RequestBody ${className} ${varName}) {\n`;
  code += `        ${className} created = ${serviceName}.save(${varName});\n`;
  code += `        return ResponseEntity.status(HttpStatus.CREATED).body(created);\n`;
  code += `    }\n\n`;

  // UPDATE
  code += `    @PutMapping("/{id}")\n`;
  code += `    public ResponseEntity<${className}> update(@PathVariable ${idType} id, @RequestBody ${className} ${varName}) {\n`;
  code += `        try {\n`;
  code += `            ${className} updated = ${serviceName}.update(id, ${varName});\n`;
  code += `            return ResponseEntity.ok(updated);\n`;
  code += `        } catch (RuntimeException e) {\n`;
  code += `            return ResponseEntity.notFound().build();\n`;
  code += `        }\n`;
  code += `    }\n\n`;

  // DELETE
  code += `    @DeleteMapping("/{id}")\n`;
  code += `    public ResponseEntity<Void> delete(@PathVariable ${idType} id) {\n`;
  code += `        try {\n`;
  code += `            ${serviceName}.deleteById(id);\n`;
  code += `            return ResponseEntity.noContent().build();\n`;
  code += `        } catch (Exception e) {\n`;
  code += `            return ResponseEntity.notFound().build();\n`;
  code += `        }\n`;
  code += `    }\n`;
  code += `}\n`;

  return code;
};

// -------------------------------------------------------------
// 4.1. GENERADOR DE CONTROLADOR DE METADATA / SCHEMA (Dynamic Client API)
// -------------------------------------------------------------
export const generateSchemaControllerCode = (
  classNodes: Node<UmlClassNodeData>[],
  edges: Edge[],
  packageName: string
): string => {
  let code = `package ${packageName}.controller;\n\n`;
  code += `import org.springframework.http.ResponseEntity;\n`;
  code += `import org.springframework.web.bind.annotation.*;\n`;
  code += `import java.util.*;\n\n`;
  code += `/**\n * Controlador de Metadata / Esquema para consumo dinámico desde clientes móviles (Flutter) y web.\n`;
  code += ` * Permite descubrir en tiempo de ejecución las entidades, endpoints, campos y tipos de datos del negocio.\n */\n`;
  code += `@RestController\n`;
  code += `@RequestMapping({"/api/v1/schema", "/api/schema"})\n`;
  code += `@CrossOrigin(origins = "*")\n`;
  code += `public class SchemaController {\n\n`;
  code += `    @GetMapping\n`;
  code += `    public ResponseEntity<List<Map<String, Object>>> getSchema() {\n`;
  code += `        List<Map<String, Object>> entities = new ArrayList<>();\n\n`;

  classNodes.forEach((node, idx) => {
    const className = toPascalCase(node.data?.name || 'Entity');
    const endpointPath = toPluralEndpoint(className);
    const rawAttributes = node.data?.attributes || [];
    const relations = getEntityRelations(node.id, className, classNodes, edges);

    const hasCustomId = rawAttributes.some((a) => sanitizeFieldName(a.name) === 'id');
    const idType = hasCustomId
      ? mapUmlToJavaType(rawAttributes.find((a) => sanitizeFieldName(a.name) === 'id')?.type || 'long')
      : 'Long';

    code += `        // Entidad: ${className}\n`;
    code += `        Map<String, Object> entity${idx} = new LinkedHashMap<>();\n`;
    code += `        entity${idx}.put("name", "${className}");\n`;
    code += `        entity${idx}.put("label", "${className}");\n`;
    code += `        entity${idx}.put("endpoint", "/api/v1/${endpointPath}");\n`;
    code += `        entity${idx}.put("idType", "${idType}");\n`;

    code += `        List<Map<String, Object>> fields${idx} = new ArrayList<>();\n`;
    code += `        fields${idx}.add(createField("id", "${idType}", "ID", true));\n`;

    rawAttributes
      .filter((a) => sanitizeFieldName(a.name) !== 'id')
      .forEach((attr) => {
        const fieldName = sanitizeFieldName(attr.name);
        const fieldType = mapUmlToJavaType(attr.type);
        const label = toPascalCase(fieldName);
        code += `        fields${idx}.add(createField("${fieldName}", "${fieldType}", "${label}", false));\n`;
      });

    code += `        entity${idx}.put("fields", fields${idx});\n`;

    code += `        List<Map<String, Object>> rels${idx} = new ArrayList<>();\n`;
    relations.forEach((rel) => {
      code += `        Map<String, Object> rel_${rel.targetFieldName} = new LinkedHashMap<>();\n`;
      code += `        rel_${rel.targetFieldName}.put("type", "${rel.type}");\n`;
      code += `        rel_${rel.targetFieldName}.put("targetClass", "${rel.targetClass}");\n`;
      code += `        rel_${rel.targetFieldName}.put("fieldName", "${rel.targetFieldName}");\n`;
      code += `        rels${idx}.add(rel_${rel.targetFieldName});\n`;
    });
    code += `        entity${idx}.put("relations", rels${idx});\n`;
    code += `        entities.add(entity${idx});\n\n`;
  });

  code += `        return ResponseEntity.ok(entities);\n`;
  code += `    }\n\n`;

  code += `    private Map<String, Object> createField(String name, String type, String label, boolean readOnly) {\n`;
  code += `        Map<String, Object> field = new LinkedHashMap<>();\n`;
  code += `        field.put("name", name);\n`;
  code += `        field.put("type", type);\n`;
  code += `        field.put("label", label);\n`;
  code += `        field.put("readOnly", readOnly);\n`;
  code += `        return field;\n`;
  code += `    }\n`;
  code += `}\n`;

  return code;
};

// -------------------------------------------------------------
// 5. GENERADOR DE CLASE PRINCIPAL, CONFIGURACIONES Y POM.XML
// -------------------------------------------------------------
export const generateMainAppCode = (packageName: string): string => {
  return `package ${packageName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Clase principal de inicio para la aplicación Spring Boot.
 */
@SpringBootApplication
public class BackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendApplication.class, args);
    }
}
`;
};

export const generateCorsConfigCode = (packageName: string): string => {
  return `package ${packageName}.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Configuración global de CORS para permitir peticiones desde cualquier frontend.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*");
    }
}
`;
};

export const generateApplicationProperties = (config: SpringBootConfig): string => {
  return `# ===================================================================
# Configuración del Servidor y Base de Datos PostgreSQL
# Generado automáticamente por UMLCraft
# ===================================================================
server.port=${config.serverPort || '8080'}
spring.application.name=${config.projectName || 'backend-service'}

# Configuración del DataSource para PostgreSQL
spring.datasource.url=jdbc:postgresql://${config.dbHost}:${config.dbPort}/${config.dbName}
spring.datasource.username=${config.dbUser}
spring.datasource.password=${config.dbPassword}
spring.datasource.driver-class-name=org.postgresql.Driver

# Configuración de Spring Data JPA / Hibernate
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect

# Configuración de Jackson para serialización JSON
spring.jackson.serialization.fail-on-empty-beans=false
`;
};

export const generatePomXml = (config: SpringBootConfig): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
	<modelVersion>4.0.0</modelVersion>
	
	<parent>
		<groupId>org.springframework.boot</groupId>
		<artifactId>spring-boot-starter-parent</artifactId>
		<version>3.3.2</version>
		<relativePath/>
	</parent>
	
	<groupId>${config.packageName}</groupId>
	<artifactId>${config.projectName}</artifactId>
	<version>0.0.1-SNAPSHOT</version>
	<name>${config.projectName}</name>
	<description>Backend generado a partir del diagrama UML con arquitectura de 4 capas y PostgreSQL</description>
	
	<properties>
		<java.version>${config.javaVersion || '17'}</java.version>
		<maven.compiler.source>${config.javaVersion || '17'}</maven.compiler.source>
		<maven.compiler.target>${config.javaVersion || '17'}</maven.compiler.target>
		<project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
	</properties>
	
	<dependencies>
		<!-- Spring Boot Web para endpoints REST -->
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-web</artifactId>
		</dependency>

		<!-- Spring Data JPA para persistencia con Hibernate -->
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-data-jpa</artifactId>
		</dependency>

		<!-- Driver JDBC de PostgreSQL -->
		<dependency>
			<groupId>org.postgresql</groupId>
			<artifactId>postgresql</artifactId>
			<scope>runtime</scope>
		</dependency>

		<!-- Testing -->
		<dependency>
			<groupId>org.springframework.boot</groupId>
			<artifactId>spring-boot-starter-test</artifactId>
			<scope>test</scope>
		</dependency>
	</dependencies>

	<build>
		<plugins>
			<!-- Plugin de compilacion compatible con Java 17, 21 y 23+ -->
			<plugin>
				<groupId>org.apache.maven.plugins</groupId>
				<artifactId>maven-compiler-plugin</artifactId>
				<configuration>
					<source>${config.javaVersion || '17'}</source>
					<target>${config.javaVersion || '17'}</target>
				</configuration>
			</plugin>

			<!-- Plugin Spring Boot para empaquetado JAR ejecutable -->
			<plugin>
				<groupId>org.springframework.boot</groupId>
				<artifactId>spring-boot-maven-plugin</artifactId>
			</plugin>
		</plugins>
	</build>
</project>
`;
};

// -------------------------------------------------------------
// SCRIPTS DE MAVEN WRAPPER (mvnw.cmd, mvnw, maven-wrapper.properties)
// Permiten ejecutar el backend sin tener Maven preinstalado
// -------------------------------------------------------------
export const generateMvnwCmd = (): string => {
  return `@REM ----------------------------------------------------------------------------
@REM Maven Wrapper script for Windows (Generado por UMLCraft)
@REM Descarga y ejecuta Apache Maven 3.9.8 automaticamente sin requerir instalacion
@REM ----------------------------------------------------------------------------
@echo off
setlocal

set "WRAPPER_VERSION=3.9.8"
set "MAVEN_URL=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/%WRAPPER_VERSION%/apache-maven-%WRAPPER_VERSION%-bin.zip"
set "MAVEN_DIR=%USERPROFILE%\\.m2\\wrapper\\dists\\apache-maven-%WRAPPER_VERSION%"
set "MAVEN_HOME=%MAVEN_DIR%\\apache-maven-%WRAPPER_VERSION%"
set "MAVEN_ZIP=%MAVEN_DIR%\\apache-maven-%WRAPPER_VERSION%-bin.zip"

if exist "%MAVEN_HOME%\\bin\\mvn.cmd" goto run

echo [INFO] Maven no encontrado en el sistema.
echo [INFO] Descargando Apache Maven %WRAPPER_VERSION% automaticamente...
if not exist "%MAVEN_DIR%" mkdir "%MAVEN_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%MAVEN_URL%', '%MAVEN_ZIP%')"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] No se pudo descargar Maven desde %MAVEN_URL%.
    echo [ERROR] Verifica tu conexion a internet o instala Maven manualmente.
    exit /b 1
)

echo [INFO] Extrayendo archivos de Maven...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%MAVEN_ZIP%' -DestinationPath '%MAVEN_DIR%' -Force"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] No se pudo descomprimir el archivo de Maven.
    exit /b 1
)

del /q "%MAVEN_ZIP%"
echo [INFO] Maven %WRAPPER_VERSION% preparado exitosamente.

:run
call "%MAVEN_HOME%\\bin\\mvn.cmd" %*
exit /b %ERRORLEVEL%
`;
};

export const generateMvnw = (): string => {
  return `#!/bin/sh
# ----------------------------------------------------------------------------
# Maven Wrapper script for Unix/Linux/macOS (Generado por UMLCraft)
# ----------------------------------------------------------------------------
WRAPPER_VERSION="3.9.8"
MAVEN_URL="https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/\${WRAPPER_VERSION}/apache-maven-\${WRAPPER_VERSION}-bin.zip"
MAVEN_DIR="$HOME/.m2/wrapper/dists/apache-maven-\${WRAPPER_VERSION}"
MAVEN_HOME="$MAVEN_DIR/apache-maven-\${WRAPPER_VERSION}"
MAVEN_ZIP="$MAVEN_DIR/apache-maven-\${WRAPPER_VERSION}-bin.zip"

if [ ! -x "$MAVEN_HOME/bin/mvn" ]; then
    echo "[INFO] Maven no encontrado. Descargando Maven \${WRAPPER_VERSION}..."
    mkdir -p "$MAVEN_DIR"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$MAVEN_URL" -o "$MAVEN_ZIP"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$MAVEN_URL" -O "$MAVEN_ZIP"
    else
        echo "[ERROR] Se requiere curl o wget para descargar Maven."
        exit 1
    fi
    unzip -q -o "$MAVEN_ZIP" -d "$MAVEN_DIR"
    rm -f "$MAVEN_ZIP"
    chmod +x "$MAVEN_HOME/bin/mvn"
fi

exec "$MAVEN_HOME/bin/mvn" "$@"
`;
};

export const generateMavenWrapperProperties = (): string => {
  return `# Maven Wrapper properties
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.8/apache-maven-3.9.8-bin.zip
wrapperUrl=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar
`;
};

export const generateReadme = (
  config: SpringBootConfig,
  classNames: string[]
): string => {
  return `# Proyecto Backend Spring Boot: ${config.projectName}

Proyecto backend completo autogenerado a partir de un diagrama UML con arquitectura canónica de 4 capas y persistencia en **PostgreSQL**.
Construido con **Java estándar** (sin dependencias problemáticas de Lombok), 100% compatible con **Java 17, 21, 22, 23 y superiores**.

---

## 🏛️ Arquitectura en 4 Capas

1. **Modelo / Entidad (\`model/\`)**: Clases JPA (\`@Entity\`, \`@Table\`, \`@Id\`, etc.) con constructores y getters/setters estándar en Java puro.
2. **Repositorio (\`repository/\`)**: Interfaces \`JpaRepository\` de Spring Data JPA con operaciones CRUD automáticas sin escribir SQL.
3. **Servicio (\`service/\`)**: Interfaces e implementaciones con lógica de negocio y transacciones (\`@Transactional\`).
4. **Controlador (\`controller/\`)**: Controladores REST (\`@RestController\`) con soporte CORS y endpoints HTTP.

---

## 🚀 Requisitos Previos

- **Java JDK 17, 21 o 23+** instalado y en el PATH del sistema.
- **PostgreSQL** instalado y en ejecución en el puerto \`${config.dbPort}\`.
- **NO necesitas tener Maven instalado manualmente**: este proyecto incluye \`mvnw.cmd\` (Windows) y \`mvnw\` (Linux/macOS) que configuran Maven automáticamente.

---

## 🛠️ Paso a Paso para Ejecutar el Proyecto

### 1. Crear la base de datos en PostgreSQL
Abre tu consola de PostgreSQL (\`psql\`) o pgAdmin y ejecuta:

\`\`\`sql
CREATE DATABASE ${config.dbName};
\`\`\`

### 2. Verificar credenciales de base de datos
Revisa el archivo \`src/main/resources/application.properties\`:
- **URL**: \`jdbc:postgresql://${config.dbHost}:${config.dbPort}/${config.dbName}\`
- **Usuario**: \`${config.dbUser}\`
- **Contraseña**: \`${config.dbPassword}\`

Si tus credenciales locales son diferentes, cámbialas en ese archivo.

### 3. Ejecutar el Proyecto

#### Opción A: Desde Terminal en Windows (PowerShell / CMD) - ¡Recomendada!
Ejecuta el script wrapper incluido (descargará Maven automáticamente la primera vez):
\`\`\`powershell
.\\mvnw.cmd spring-boot:run
\`\`\`
*(o también \`.\\mvnw spring-boot:run\`)*

#### Opción B: Desde Terminal en Linux / macOS
\`\`\`bash
chmod +x mvnw
./mvnw spring-boot:run
\`\`\`

#### Opción C: Desde Visual Studio Code (VS Code)
1. Abre la carpeta descomprimida en VS Code (\`File > Open Folder\`).
2. Con la extensión oficial **Extension Pack for Java** instalada, abre el archivo:
   \`src/main/java/${config.packageName.replace(/\./g, '/')}/BackendApplication.java\`
3. Haz clic en el botón **Run** (o presiona \`F5\`).
   *Nota: Como este proyecto usa Java estándar puro (sin Lombok), compila y corre directamente en Java 23 sin errores de compilador.*

#### Opción D: Desde IntelliJ IDEA / Eclipse
1. Abre la carpeta del proyecto como proyecto Maven existente.
2. Espera a que cargue las dependencias.
3. Haz clic derecho en \`BackendApplication.java\` -> **Run 'BackendApplication'**.

El servidor arrancará en: **\`http://localhost:${config.serverPort}\`**

---

## 📡 Endpoints REST Generados

${classNames
  .map((name) => {
    const endpoint = toPluralEndpoint(name);
    return `### Entidad \`${name}\` (\`/api/v1/${endpoint}\`)
- \`GET    /api/v1/${endpoint}\`       -> Listar todos
- \`GET    /api/v1/${endpoint}/{id}\`  -> Obtener por ID
- \`POST   /api/v1/${endpoint}\`       -> Crear nuevo
- \`PUT    /api/v1/${endpoint}/{id}\`  -> Actualizar existente
- \`DELETE /api/v1/${endpoint}/{id}\`  -> Eliminar por ID
`;
  })
  .join('\n')}
`;
};

// -------------------------------------------------------------
// 6. GENERAR DICCIONARIO COMPLETO DE ARCHIVOS (Para preview y ZIP)
// -------------------------------------------------------------
export const generateAllSpringBootFiles = (
  nodes: Node<UmlClassNodeData>[],
  edges: Edge[],
  config: SpringBootConfig = DEFAULT_SPRING_CONFIG
): GeneratedFile[] => {
  const classNodes = nodes.filter((n) => n.type === 'umlClass');
  const classNames = classNodes.map((n) => toPascalCase(n.data?.name || 'Entity'));
  const packagePath = config.packageName.replace(/\./g, '/');
  const files: GeneratedFile[] = [];

  // pom.xml
  files.push({
    path: 'pom.xml',
    content: generatePomXml(config),
    language: 'xml',
  });

  // mvnw.cmd (Windows Wrapper ejecutable)
  files.push({
    path: 'mvnw.cmd',
    content: generateMvnwCmd(),
    language: 'properties',
  });

  // mvnw (Linux/macOS Wrapper ejecutable)
  files.push({
    path: 'mvnw',
    content: generateMvnw(),
    language: 'properties',
  });

  // .mvn/wrapper/maven-wrapper.properties
  files.push({
    path: '.mvn/wrapper/maven-wrapper.properties',
    content: generateMavenWrapperProperties(),
    language: 'properties',
  });

  // application.properties
  files.push({
    path: 'src/main/resources/application.properties',
    content: generateApplicationProperties(config),
    language: 'properties',
  });

  // BackendApplication.java
  files.push({
    path: `src/main/java/${packagePath}/BackendApplication.java`,
    content: generateMainAppCode(config.packageName),
    language: 'java',
  });

  // CorsConfig.java
  files.push({
    path: `src/main/java/${packagePath}/config/CorsConfig.java`,
    content: generateCorsConfigCode(config.packageName),
    language: 'java',
  });

  // SchemaController.java (Metadata para app móvil Flutter y clientes dinámicos)
  files.push({
    path: `src/main/java/${packagePath}/controller/SchemaController.java`,
    content: generateSchemaControllerCode(classNodes, edges, config.packageName),
    language: 'java',
  });

  // README.md
  files.push({
    path: 'README.md',
    content: generateReadme(config, classNames),
    language: 'markdown',
  });

  // Generar las 4 capas para cada clase del diagrama
  classNodes.forEach((node) => {
    const className = toPascalCase(node.data?.name || 'Entity');

    // 1. Capa Modelo (Entity)
    files.push({
      path: `src/main/java/${packagePath}/model/${className}.java`,
      content: generateEntityCode(node, classNodes, edges, config.packageName),
      language: 'java',
    });

    // 2. Capa Repositorio
    files.push({
      path: `src/main/java/${packagePath}/repository/${className}Repository.java`,
      content: generateRepositoryCode(node, config.packageName),
      language: 'java',
    });

    // 3. Capa Servicio (Interfaz e Implementación)
    files.push({
      path: `src/main/java/${packagePath}/service/${className}Service.java`,
      content: generateServiceInterfaceCode(node, config.packageName),
      language: 'java',
    });
    files.push({
      path: `src/main/java/${packagePath}/service/impl/${className}ServiceImpl.java`,
      content: generateServiceImplCode(node, config.packageName),
      language: 'java',
    });

    // 4. Capa Controlador (REST Controller)
    files.push({
      path: `src/main/java/${packagePath}/controller/${className}Controller.java`,
      content: generateControllerCode(node, config.packageName),
      language: 'java',
    });
  });

  return files;
};

// -------------------------------------------------------------
// 7. DESCARGAR ARCHIVO ZIP USANDO JSZIP Y FILE-SAVER
// -------------------------------------------------------------
export const exportToSpringBootZip = async (
  nodes: Node<UmlClassNodeData>[],
  edges: Edge[],
  config: SpringBootConfig = DEFAULT_SPRING_CONFIG
): Promise<void> => {
  const zip = new JSZip();
  const files = generateAllSpringBootFiles(nodes, edges, config);
  const rootFolder = zip.folder(config.projectName) || zip;

  files.forEach((file) => {
    rootFolder.file(file.path, file.content);
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeFilename = `${config.projectName}-springboot.zip`;
  saveAs(blob, safeFilename);
};
