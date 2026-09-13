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
  clean = clean.replace(/^[+-~#]/, '').trim();
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
  code += `import lombok.*;\n`;
  code += `import com.fasterxml.jackson.annotation.JsonIgnoreProperties;\n`;
  if (needsLocalDate) code += `import java.time.LocalDate;\n`;
  if (needsLocalDateTime) code += `import java.time.LocalDateTime;\n`;
  if (needsList) code += `import java.util.List;\nimport java.util.ArrayList;\n`;

  code += `\n/**\n * Entidad JPA generada automáticamente a partir del diagrama UML.\n */\n`;
  code += `@Entity\n`;
  code += `@Table(name = "${tableName}")\n`;
  code += `@Data\n`;
  code += `@NoArgsConstructor\n`;
  code += `@AllArgsConstructor\n`;
  code += `@Builder\n`;
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
      code += `    @Builder.Default\n`;
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
      code += `    @Builder.Default\n`;
      code += `    private List<${rel.targetClass}> ${rel.targetFieldName} = new ArrayList<>();\n\n`;
    } else if (rel.type === 'oneToOne') {
      code += `    @OneToOne(cascade = CascadeType.ALL)\n`;
      code += `    @JoinColumn(name = "${rel.targetFieldName}_id", referencedColumnName = "id")\n`;
      code += `    private ${rel.targetClass} ${rel.targetFieldName};\n\n`;
    }
  });

  // Getters y Setters explícitos para máxima compatibilidad con cualquier IDE (incluso sin plugin Lombok)
  code += `    // ===== Getters y Setters explícitos =====\n`;
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

		<!-- Lombok para generación limpia de getters, setters y constructores -->
		<dependency>
			<groupId>org.projectlombok</groupId>
			<artifactId>lombok</artifactId>
			<optional>true</optional>
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
			<plugin>
				<groupId>org.springframework.boot</groupId>
				<artifactId>spring-boot-maven-plugin</artifactId>
				<configuration>
					<excludes>
						<exclude>
							<groupId>org.projectlombok</groupId>
							<artifactId>lombok</artifactId>
						</exclude>
					</excludes>
				</configuration>
			</plugin>
		</plugins>
	</build>
</project>
`;
};

export const generateReadme = (
  config: SpringBootConfig,
  classNames: string[]
): string => {
  return `# Proyecto Backend Spring Boot: ${config.projectName}

Proyecto backend completo autogenerado a partir de un diagrama UML con arquitectura canónica de 4 capas y persistencia en **PostgreSQL**.

---

## 🏛️ Arquitectura en 4 Capas

1. **Modelo / Entidad (\`model/\`)**: Clases con anotaciones JPA (\`@Entity\`, \`@Table\`, \`@Id\`, etc.) mapeadas a las tablas relacionales.
2. **Repositorio (\`repository/\`)**: Interfaces \`JpaRepository\` de Spring Data JPA con operaciones CRUD automáticas.
3. **Servicio (\`service/\`)**: Interfaces e implementaciones con lógica de negocio y transacciones (\`@Transactional\`).
4. **Controlador (\`controller/\`)**: Controladores REST (\`@RestController\`) con soporte CORS y endpoints HTTP.

---

## 🚀 Requisitos Previos

- **Java JDK 17** o superior instalado.
- **PostgreSQL** instalado y en ejecución en el puerto \`${config.dbPort}\`.
- Un IDE como **IntelliJ IDEA**, **Eclipse** o **VS Code**.

---

## 🛠️ Paso a Paso para Ejecutar el Proyecto

### 1. Crear la base de datos en PostgreSQL
Abre tu consola de PostgreSQL (\`psql\`) o pgAdmin y ejecuta:

\`\`\`sql
CREATE DATABASE ${config.dbName};
\`\`\`

### 2. Verificar credenciales de base de datos
Revisa el archivo \`src/main/resources/application.properties\`:
- **Usuario**: \`${config.dbUser}\`
- **Contraseña**: \`${config.dbPassword}\`
- **Base de datos**: \`${config.dbName}\`

Si tus credenciales locales son diferentes, cámbialas en ese archivo.

### 3. Ejecutar desde el IDE
- **IntelliJ IDEA**: Abre la carpeta del proyecto, espera a que Maven sincronice las dependencias y dale clic al botón verde de "Run" en la clase \`BackendApplication.java\`.
- **VS Code / Eclipse**: Abre la carpeta y ejecuta \`BackendApplication.java\`.
- **Línea de comandos (Maven)**:
  \`\`\`bash
  mvn spring-boot:run
  \`\`\`

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
