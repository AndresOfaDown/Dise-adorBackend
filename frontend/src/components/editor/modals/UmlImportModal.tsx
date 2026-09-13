import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useDiagramStore } from '../../../store/diagramStore';
import { parseUmlFileContent, type ParsedUmlResult } from '../../../utils/umlImportParser';

interface UmlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UmlImportModal: React.FC<UmlImportModalProps> = ({ isOpen, onClose }) => {
  const { importDiagramFromAi } = useDiagramStore();

  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [parsedResult, setParsedResult] = useState<ParsedUmlResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rawTextMode, setRawTextMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Procesar archivo seleccionado o soltado
  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setFileContent(text);
      setFileName(file.name);
      try {
        const result = parseUmlFileContent(text, file.name);
        setParsedResult(result);
        if (result.classes.length === 0) {
          toast.error('No se detectaron clases en el archivo XML/XMI');
        } else {
          toast.success(`Archivo analizado: ${result.classes.length} clases detectadas`);
        }
      } catch (err: any) {
        toast.error(err?.message || 'Error al analizar el archivo UML');
        setParsedResult(null);
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleParseRawText = () => {
    if (!fileContent.trim()) {
      toast.error('Pega contenido XMI o PlantUML primero');
      return;
    }
    try {
      const result = parseUmlFileContent(fileContent, 'pasted_text.puml');
      setParsedResult(result);
      if (result.classes.length === 0) {
        toast.error('No se detectaron clases en el texto analizado');
      } else {
        toast.success(`Analizado con éxito: ${result.classes.length} clases encontradas`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al analizar el contenido introducido');
      setParsedResult(null);
    }
  };

  // Limpiar archivo o contenido cargado para volver a elegir
  const handleClear = () => {
    setFileContent('');
    setFileName('');
    setParsedResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.success('Se ha limpiado el archivo cargado');
  };

  // Confirmar Importación al Lienzo
  const handleApplyImport = () => {
    if (!parsedResult || parsedResult.classes.length === 0) {
      toast.error('No hay clases válidas para importar');
      return;
    }

    const formattedClasses = parsedResult.classes.map((cls) => ({
      name: cls.name,
      stereotype: cls.stereotype,
      attributes: cls.attributes,
      methods: cls.methods,
      position: cls.position,
    }));

    const formattedRelations = parsedResult.relations.map((rel) => ({
      source: rel.source,
      target: rel.target,
      type: rel.type,
      sourceMultiplicity: rel.sourceMultiplicity,
      targetMultiplicity: rel.targetMultiplicity,
      label: rel.label,
      associationClassName: rel.associationClassName,
    }));

    importDiagramFromAi(formattedClasses, formattedRelations, importMode);

    toast.success(
      `¡Importadas ${formattedClasses.length} clases y ${formattedRelations.length} relaciones al canvas!`
    );
    onClose();
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
              <h2 className="modal-title">Importar desde Editor UML</h2>
              <p className="modal-subtitle">
                Carga archivos XMI de Enterprise Architect / Visual Paradigm o código PlantUML para dibujarlos en el lienzo.
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
            {/* Opciones de carga */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                Formatos soportados: <strong>.xmi</strong>, <strong>.xml</strong> (Enterprise Architect, Visual Paradigm) o <strong>.puml</strong> (PlantUML).
              </span>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textDecoration: 'underline',
                }}
                onClick={() => setRawTextMode(!rawTextMode)}
              >
                {rawTextMode ? 'Subir archivo' : 'Pegar texto directamente'}
              </button>
            </div>

            {/* Zona de Drop o Textarea */}
            {!rawTextMode ? (
              <div
                className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '24px' }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xmi,.xml,.puml,.plantuml,.txt"
                  style={{ display: 'none' }}
                  onChange={handleFileInputChange}
                />
                <div className="dropzone-empty">
                  <p className="dropzone-text">
                    {fileName ? (
                      <span>Archivo cargado: {fileName}</span>
                    ) : (
                      'Arrastra aquí tu archivo .xmi o .puml, o haz clic para examinar'
                    )}
                  </p>
                  <span className="dropzone-sub">
                    Exportado desde Enterprise Architect, Visual Paradigm o escrito en PlantUML
                  </span>
                  {fileName && (
                    <button
                      type="button"
                      className="modal-cancel-btn"
                      style={{ marginTop: '10px', padding: '4px 14px', fontSize: '12px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClear();
                      }}
                      title="Quitar este archivo y elegir otro"
                    >
                      Limpiar archivo
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  placeholder="Pega aquí el contenido XML / XMI o el código PlantUML (@startuml ... @enduml)..."
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  style={{
                    width: '100%',
                    height: '140px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={handleParseRawText}
                  >
                    Analizar texto pegado
                  </button>
                  {fileContent && (
                    <button
                      type="button"
                      className="modal-cancel-btn"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={handleClear}
                    >
                      Limpiar texto
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Resumen de elementos detectados si el parseo tuvo éxito */}
            {parsedResult && (
              <div className="scan-preview-container" style={{ marginTop: '8px' }}>
                <div className="preview-summary-header" style={{ alignItems: 'center' }}>
                  <span className="summary-badge" style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                    {parsedResult.classes.length} Clases encontradas
                  </span>
                  <span className="summary-badge" style={{ backgroundColor: '#e0e7ff', color: '#4338ca' }}>
                    {parsedResult.relations.length} Relaciones encontradas
                  </span>
                  {parsedResult.packageName && (
                    <span className="summary-badge">Paquete: {parsedResult.packageName}</span>
                  )}
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '12px' }}
                    onClick={handleClear}
                    title="Descartar este archivo y elegir otro"
                  >
                    Limpiar archivo
                  </button>
                </div>

                {/* Previsualización de clases en tarjetas */}
                <div className="preview-section-title">Vista previa de entidades detectadas:</div>
                <div className="preview-classes-grid" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {parsedResult.classes.map((cls, idx) => (
                    <div key={idx} className="preview-class-card">
                      <div className="preview-class-header">
                        <span className="preview-class-name">{cls.name}</span>
                        {cls.stereotype && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            &laquo;{cls.stereotype}&raquo;
                          </span>
                        )}
                      </div>
                      <div className="preview-compartment">
                        <span className="compartment-label">Atributos ({cls.attributes?.length || 0}):</span>
                        <ul className="preview-items-list">
                          {(cls.attributes || []).slice(0, 3).map((a, aIdx) => (
                            <li key={aIdx}>{a}</li>
                          ))}
                          {(cls.attributes || []).length > 3 && (
                            <li style={{ color: '#64748b', fontStyle: 'italic' }}>
                              +{(cls.attributes?.length || 0) - 3} más...
                            </li>
                          )}
                        </ul>
                      </div>
                      <div className="preview-compartment">
                        <span className="compartment-label">Métodos ({cls.methods?.length || 0}):</span>
                        <ul className="preview-items-list">
                          {(cls.methods || []).slice(0, 2).map((m, mIdx) => (
                            <li key={mIdx}>{m}</li>
                          ))}
                          {(cls.methods || []).length > 2 && (
                            <li style={{ color: '#64748b', fontStyle: 'italic' }}>
                              +{(cls.methods?.length || 0) - 2} más...
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Selector de modo de importación */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '8px',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '13px', display: 'block' }}>
                      Modo de Inserción en el Lienzo:
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {importMode === 'replace'
                        ? 'Limpiará el canvas actual y dibujará el nuevo diagrama.'
                        : 'Agregará estas entidades a las clases que ya tienes en el canvas.'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className={`sidebar-tool-btn ${importMode === 'replace' ? 'active' : ''}`}
                      style={{ padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                      onClick={() => setImportMode('replace')}
                    >
                      Reemplazar
                    </button>
                    <button
                      type="button"
                      className={`sidebar-tool-btn ${importMode === 'append' ? 'active' : ''}`}
                      style={{ padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                      onClick={() => setImportMode('append')}
                    >
                      Añadir / Fusionar
                    </button>
                  </div>
                </div>

                {/* Botón Aplicar al Canvas */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                  <button type="button" className="modal-cancel-btn" onClick={handleClear}>
                    Limpiar archivo
                  </button>
                  <button type="button" className="modal-cancel-btn" onClick={onClose}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleApplyImport}
                    style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 600 }}
                  >
                    Volcar al lienzo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
