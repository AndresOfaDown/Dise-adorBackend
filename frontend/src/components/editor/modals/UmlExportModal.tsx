import React, { useState, useMemo } from 'react';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import { useDiagramStore } from '../../../store/diagramStore';
import { exportToXmi } from '../../../utils/umlXmiExport';
import { exportToPlantUml } from '../../../utils/umlPlantUmlExport';

interface UmlExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UmlExportModal: React.FC<UmlExportModalProps> = ({ isOpen, onClose }) => {
  const { nodes, edges, projectName } = useDiagramStore();
  const [exportFormat, setExportFormat] = useState<'xmi' | 'puml'>('xmi');

  // Generar contenido de exportación memoizado
  const exportContent = useMemo(() => {
    if (!isOpen) return '';
    if (exportFormat === 'xmi') {
      return exportToXmi(nodes, edges, projectName || 'com.example.uml');
    } else {
      return exportToPlantUml(nodes, edges, projectName || 'com.example.uml');
    }
  }, [isOpen, exportFormat, nodes, edges, projectName]);

  const classCount = nodes.filter((n) => n.type === 'umlClass').length;
  const relationCount = edges.length;
  const associationClassesCount = edges.filter((e) => e.data?.relationType === 'associationClass').length;

  if (!isOpen) return null;

  // Descargar archivo exportado
  const handleDownload = (overrideExt?: 'xml' | 'xmi') => {
    try {
      const ext = overrideExt || (exportFormat === 'xmi' ? 'xml' : 'puml');
      const mime = (ext === 'xmi' || ext === 'xml') ? 'application/xml;charset=utf-8' : 'text/plain;charset=utf-8';
      const blob = new Blob([exportContent], { type: mime });
      const safeProjectName = (projectName || 'diagrama-uml').replace(/[^a-zA-Z0-9_-]/g, '_');
      saveAs(blob, `${safeProjectName}.${ext}`);
      toast.success(`Archivo .${ext} descargado exitosamente`);
    } catch (err) {
      toast.error('Error al generar la descarga del archivo');
    }
  };

  // Copiar al portapapeles
  const handleCopy = () => {
    navigator.clipboard.writeText(exportContent);
    toast.success('Contenido copiado al portapapeles');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        style={{ maxWidth: '820px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div>
              <h2 className="modal-title">Exportar a Enterprise Architect / PlantUML</h2>
              <p className="modal-subtitle">
                Exporta tu diagrama en formato estándar XMI 2.1 compatible con Enterprise Architect (Sparx Systems) o código PlantUML.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar ventana">
            ×
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="modal-body" style={{ maxHeight: 'calc(85vh - 120px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Formato de exportación */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`sidebar-tool-btn ${exportFormat === 'xmi' ? 'active' : ''}`}
                  style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
                  onClick={() => setExportFormat('xmi')}
                >
                  <strong>Enterprise Architect (XML / XMI 2.1)</strong>
                </button>
                <button
                  type="button"
                  className={`sidebar-tool-btn ${exportFormat === 'puml' ? 'active' : ''}`}
                  style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
                  onClick={() => setExportFormat('puml')}
                >
                  <strong>PlantUML (.puml)</strong>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#475569' }}>
                <span className="summary-badge">{classCount} Clases</span>
                <span className="summary-badge">{relationCount} Relaciones</span>
                {associationClassesCount > 0 && (
                  <span className="summary-badge" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
                    {associationClassesCount} Clases de Asociación (N:M)
                  </span>
                )}
              </div>
            </div>

            {/* Guía explicativa del formato */}
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#166534' }}>
              {exportFormat === 'xmi' ? (
                <div>
                  <strong>Instrucciones para Enterprise Architect:</strong>
                  <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                    <li>Descarga el archivo haciendo clic en <strong>Descargar .xml</strong> (o <strong>.xmi</strong>).</li>
                    <li>En Enterprise Architect, haz clic derecho sobre tu paquete &gt; <strong>Import/Export &gt; Import Package from XML...</strong></li>
                    <li>En la ventana, haz clic en el botón <strong>[...] (Examinar)</strong> y navega a tu carpeta de <em>Descargas</em> para seleccionar el archivo descargado.</li>
                    <li>Presiona <strong>Import</strong>. Tu modelo y coordenadas del diagrama se cargarán automáticamente.</li>
                  </ol>
                </div>
              ) : (
                <div>
                  <strong>Formato PlantUML:</strong> Código legible y ligero compatible con la extensión de VS Code PlantUML, servidores en línea y Enterprise Architect (UML Script). Soporta clases intermedias para relaciones N:M <code>(A, B) .. C</code>.
                </div>
              )}
            </div>

            {/* Vista previa de código */}
            <div style={{ position: 'relative' }}>
              <textarea
                readOnly
                value={exportContent}
                style={{
                  width: '100%',
                  height: '220px',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: '12px',
                  padding: '12px',
                  backgroundColor: '#0f172a',
                  color: '#38bdf8',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Botones de acción */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={onClose}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={handleCopy}
                title="Copiar código al portapapeles"
              >
                Copiar código
              </button>

              {exportFormat === 'xmi' ? (
                <>
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    style={{ borderColor: '#3b82f6', color: '#1d4ed8', fontWeight: 600 }}
                    onClick={() => handleDownload('xmi')}
                    title="Descargar con extensión .xmi"
                  >
                    Descargar .xmi
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleDownload('xml')}
                    title="Descargar con extensión .xml (Recomendado para la ventana Import Package from XML de EA)"
                  >
                    Descargar .xml (Recomendado EA)
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleDownload()}
                  title="Descargar archivo en tu computadora"
                >
                  Descargar archivo .puml
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
