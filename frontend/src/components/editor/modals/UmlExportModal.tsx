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
  const handleDownload = () => {
    try {
      const ext = exportFormat === 'xmi' ? 'xmi' : 'puml';
      const mime = exportFormat === 'xmi' ? 'application/xml;charset=utf-8' : 'text/plain;charset=utf-8';
      const blob = new Blob([exportContent], { type: mime });
      const safeProjectName = (projectName || 'diagrama-uml').replace(/[^a-zA-Z0-9_-]/g, '_');
      saveAs(blob, `${safeProjectName}.${ext}`);
      toast.success(`Archivo .${ext} exportado exitosamente`);
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
              <h2 className="modal-title">Exportar a Editor UML</h2>
              <p className="modal-subtitle">
                Exporta tu diagrama en formato estándar XMI 2.1 para Enterprise Architect / Visual Paradigm o texto PlantUML.
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
                  <strong>Enterprise Architect (XMI 2.1)</strong>
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
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#334155' }}>
              {exportFormat === 'xmi' ? (
                <>
                  <strong>Formato XMI 2.1 (UML 2.1):</strong> Compatible directamente con <em>Enterprise Architect</em> (menú <code>Publish &gt; Export Package to XMI</code>), <em>Visual Paradigm</em> y herramientas estándar OMG. Incluye extensión de coordenadas para ubicar las clases en el lienzo de escritorio.
                </>
              ) : (
                <>
                  <strong>Formato PlantUML:</strong> Código legible y ligero compatible con la extensión de VS Code PlantUML, servidores en línea y Enterprise Architect (UML Script). Soporta clases intermedias para relaciones N:M <code>(A, B) .. C</code>.
                </>
              )}
            </div>

            {/* Vista previa de código */}
            <div style={{ position: 'relative' }}>
              <textarea
                readOnly
                value={exportContent}
                style={{
                  width: '100%',
                  height: '240px',
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
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
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownload}
                title="Descargar archivo en tu computadora"
              >
                Descargar archivo .{exportFormat === 'xmi' ? 'xmi' : 'puml'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
