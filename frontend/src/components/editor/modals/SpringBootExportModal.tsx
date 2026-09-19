import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useDiagramStore } from '../../../store/diagramStore';
import {
  DEFAULT_SPRING_CONFIG,
  generateAllSpringBootFiles,
  exportToSpringBootZip,
  type SpringBootConfig,
  type GeneratedFile,
} from '../../../utils/springBootGenerator';

interface SpringBootExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SpringBootExportModal: React.FC<SpringBootExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { nodes, edges, projectName } = useDiagramStore();

  const [config, setConfig] = useState<SpringBootConfig>({
    ...DEFAULT_SPRING_CONFIG,
    projectName: (projectName || 'backend-service').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase(),
    dbName: (projectName || 'uml_db').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
  });

  const [showConfigOptions, setShowConfigOptions] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const classCount = useMemo(() => nodes.filter((n) => n.type === 'umlClass').length, [nodes]);

  // Generar todos los archivos para previsualización
  const generatedFiles: GeneratedFile[] = useMemo(() => {
    if (!isOpen || classCount === 0) return [];
    return generateAllSpringBootFiles(nodes, edges, config);
  }, [isOpen, nodes, edges, config, classCount]);

  // Archivo seleccionado actualmente
  const activeFile = useMemo(() => {
    if (!generatedFiles || generatedFiles.length === 0) return null;
    const found = generatedFiles.find((f) => f.path === selectedFilePath);
    return found || generatedFiles[0];
  }, [generatedFiles, selectedFilePath]);

  if (!isOpen) return null;

  const handleDownloadZip = async () => {
    if (classCount === 0) {
      toast.error('El diagrama no tiene clases para generar el backend.');
      return;
    }

    try {
      setIsExporting(true);
      const loadingToast = toast.loading('Generando proyecto Spring Boot y empaquetando ZIP...');
      await exportToSpringBootZip(nodes, edges, config);
      toast.dismiss(loadingToast);
      toast.success('¡Proyecto Spring Boot (.ZIP) descargado exitosamente!');
    } catch (err) {
      console.error(err);
      toast.error('Ocurrió un error al generar el archivo ZIP.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyCurrentFile = () => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.content);
      toast.success(`Contenido de ${activeFile.path.split('/').pop()} copiado al portapapeles`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        style={{ maxWidth: '960px', width: '94%', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🍃</span>
                <h2 className="modal-title">Generar Backend Spring Boot (ZIP)</h2>
                <span
                  style={{
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    letterSpacing: '0.05em',
                  }}
                >
                  CU04
                </span>
              </div>
              <p className="modal-subtitle">
                Proyecto Maven completo listo para abrir en IntelliJ, Eclipse o VS Code con arquitectura de 4 capas y PostgreSQL.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ maxHeight: 'calc(90vh - 140px)', overflowY: 'auto', padding: '16px 24px' }}>
          {/* Badge resumen de 4 capas */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '10px',
              marginBottom: '16px',
            }}
          >
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 'bold' }}>1. CAPA MODELO</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e3a8a' }}>{classCount} Entidades JPA</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>@Entity, @Table, @Id</div>
            </div>
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#166534', fontWeight: 'bold' }}>2. CAPA REPOSITORIO</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#14532d' }}>{classCount} Repositorios</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>JpaRepository CRUD</div>
            </div>
            <div style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#6b21a8', fontWeight: 'bold' }}>3. CAPA SERVICIO</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#581c87' }}>{classCount} Servicios</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Interfaces & @Transactional</div>
            </div>
            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#9a3412', fontWeight: 'bold' }}>4. CONTROLADORES</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#7c2d12' }}>{classCount} REST Controllers</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Endpoints GET, POST, PUT, DELETE</div>
            </div>
            <div style={{ backgroundColor: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#9d174d', fontWeight: 'bold' }}>5. CAPA DTO</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#831843' }}>{classCount} DTOs</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Data Transfer Objects</div>
            </div>
          </div>

          {/* Botón para desplegar configuración avanzada */}
          <div style={{ marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setShowConfigOptions(!showConfigOptions)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: '#2563eb',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
                padding: '4px 0',
              }}
            >
              <span>{showConfigOptions ? '▾ Ocultar' : '▸ Configurar'} parámetros de PostgreSQL y Maven</span>
            </button>

            {showConfigOptions && (
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px',
                  marginTop: '8px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Nombre del Proyecto (Artifact):
                  </label>
                  <input
                    type="text"
                    value={config.projectName}
                    onChange={(e) => setConfig({ ...config, projectName: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Paquete Java (GroupId):
                  </label>
                  <input
                    type="text"
                    value={config.packageName}
                    onChange={(e) => setConfig({ ...config, packageName: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Nombre de Base de Datos (PostgreSQL):
                  </label>
                  <input
                    type="text"
                    value={config.dbName}
                    onChange={(e) => setConfig({ ...config, dbName: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Usuario PostgreSQL:
                  </label>
                  <input
                    type="text"
                    value={config.dbUser}
                    onChange={(e) => setConfig({ ...config, dbUser: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Contraseña PostgreSQL:
                  </label>
                  <input
                    type="text"
                    value={config.dbPassword}
                    onChange={(e) => setConfig({ ...config, dbPassword: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
                    Puerto Servidor:
                  </label>
                  <input
                    type="text"
                    value={config.serverPort}
                    onChange={(e) => setConfig({ ...config, serverPort: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Selector y Previsualizador de archivos */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>
                Previsualizar Archivo Generado ({generatedFiles.length} archivos en total):
              </label>
              <button
                type="button"
                onClick={handleCopyCurrentFile}
                style={{
                  fontSize: '12px',
                  color: '#2563eb',
                  background: 'none',
                  border: '1px solid #bfdbfe',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
              >
                Copiar código de este archivo
              </button>
            </div>

            {/* Selector de archivo */}
            <select
              value={activeFile?.path || ''}
              onChange={(e) => setSelectedFilePath(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                fontSize: '13px',
                marginBottom: '10px',
                fontWeight: '500',
              }}
            >
              <optgroup label="Configuraciones Base & Maven Wrapper">
                <option value="pom.xml">pom.xml (Dependencias Maven, Spring Boot, PostgreSQL)</option>
                <option value="mvnw.cmd">mvnw.cmd (Script ejecutable Windows sin Maven instalado)</option>
                <option value="mvnw">mvnw (Script ejecutable Linux/macOS sin Maven instalado)</option>
                <option value=".mvn/wrapper/maven-wrapper.properties">.mvn/wrapper/maven-wrapper.properties</option>
                <option value="src/main/resources/application.properties">application.properties (PostgreSQL & Servidor)</option>
                <option value={`src/main/java/${config.packageName.replace(/\./g, '/')}/BackendApplication.java`}>BackendApplication.java (@SpringBootApplication)</option>
                <option value={`src/main/java/${config.packageName.replace(/\./g, '/')}/config/CorsConfig.java`}>CorsConfig.java (Configuración CORS)</option>
                <option value="README.md">README.md (Instrucciones de ejecución)</option>
              </optgroup>
              <optgroup label="Capa 1: Modelos / Entidades JPA">
                {generatedFiles
                  .filter((f) => f.path.includes('/model/'))
                  .map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path.split('/').pop()} (@Entity)
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Capa 2: Repositorios (Spring Data JPA)">
                {generatedFiles
                  .filter((f) => f.path.includes('/repository/'))
                  .map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path.split('/').pop()} (JpaRepository)
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Capa 3: Servicios (Interfaces e Impl)">
                {generatedFiles
                  .filter((f) => f.path.includes('/service/'))
                  .map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path.split('/').pop()} (@Service)
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Capa 4: Controladores REST">
                {generatedFiles
                  .filter((f) => f.path.includes('/controller/'))
                  .map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path.split('/').pop()} (@RestController)
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Capa 5: DTOs (Data Transfer Objects)">
                {generatedFiles
                  .filter((f) => f.path.includes('/dto/'))
                  .map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path.split('/').pop()} (DTO)
                    </option>
                  ))}
              </optgroup>
            </select>

            {/* Caja de código con diseño oscuro moderno */}
            <div style={{ position: 'relative' }}>
              <textarea
                readOnly
                value={activeFile?.content || '// No hay archivos generados'}
                style={{
                  width: '100%',
                  height: '280px',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: '12px',
                  padding: '14px',
                  backgroundColor: '#0f172a',
                  color: '#38bdf8',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  lineHeight: '1.5',
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Listo para descomprimir y correr con: <code>.\mvnw.cmd spring-boot:run</code> o desde VS Code / IntelliJ (F5)
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
            >
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownloadZip}
              disabled={isExporting || classCount === 0}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                backgroundColor: '#16a34a',
                borderColor: '#16a34a',
                color: '#ffffff',
                fontWeight: 'bold',
                cursor: isExporting || classCount === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{isExporting ? 'Generando...' : 'Descargar Proyecto Spring Boot (.ZIP)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
