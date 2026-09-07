import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../api/client';
import { useDiagramStore } from '../../../store/diagramStore';

interface ImageScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DetectedClass {
  name: string;
  stereotype?: string;
  attributes: string[];
  methods: string[];
  position?: { x: number; y: number };
}

interface DetectedRelation {
  source: string;
  target: string;
  type?: any;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  label?: string;
}

export const ImageScanModal: React.FC<ImageScanModalProps> = ({ isOpen, onClose }) => {
  const { nodes, importDiagramFromAi } = useDiagramStore();

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('user_gemini_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Resultado de análisis
  const [analysisResult, setAnalysisResult] = useState<{
    classes: DetectedClass[];
    relations: DetectedRelation[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manejar selección de archivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setAnalysisResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Enviar a la API para analizar con Gemini
  const handleAnalyzeImage = async () => {
    if (!selectedImage) {
      toast.error('Por favor selecciona una imagen');
      return;
    }

    try {
      setIsAnalyzing(true);
      if (geminiKey.trim()) {
        localStorage.setItem('user_gemini_key', geminiKey.trim());
      }

      const response = await apiClient.post('/api/ia/analizar-imagen/', {
        image: selectedImage,
        gemini_api_key: geminiKey.trim(),
      });

      if (response.data && response.data.data) {
        const data = response.data.data;
        const classes = Array.isArray(data.classes) ? data.classes : [];
        const relations = Array.isArray(data.relations) ? data.relations : [];

        if (classes.length === 0) {
          toast.error('No se detectaron clases en la imagen. Intenta con una toma más nítida.');
          return;
        }

        setAnalysisResult({ classes, relations });
        toast.success('Diagrama reconocido con éxito');
      } else {
        toast.error('No se pudo interpretar el diagrama en la imagen');
      }
    } catch (error) {
      console.error('Error al analizar imagen:', error);
      toast.error('Error al comunicarse con el servicio de IA');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Aplicar clases y relaciones al lienzo (reemplazar o agregar)
  const handleApplyToCanvas = (mode: 'replace' | 'append') => {
    if (!analysisResult || !analysisResult.classes) return;

    importDiagramFromAi(analysisResult.classes, analysisResult.relations || [], mode);

    if (mode === 'replace') {
      toast.success('Lienzo actualizado con el diagrama escaneado');
    } else {
      toast.success('Clases del diagrama agregadas al lienzo');
    }

    // Limpiar y cerrar
    setSelectedImage(null);
    setAnalysisResult(null);
    onClose();
  };

  const handleResetScan = () => {
    setAnalysisResult(null);
    setSelectedImage(null);
  };

  const translateRelationType = (type?: string) => {
    switch (type) {
      case 'generalization':
        return 'Generalización (Herencia)';
      case 'composition':
        return 'Composición';
      case 'aggregation':
        return 'Agregación';
      case 'dependency':
        return 'Dependencia';
      case 'associationClass':
        return 'Asociación de clases';
      default:
        return 'Asociación';
    }
  };

  if (!isOpen) return null;

  const hasExistingNodes = nodes.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div>
              <h2 className="modal-title">Escanear Imagen o Archivo</h2>
              <p className="modal-subtitle">
                {analysisResult
                  ? 'Revisa el resultado detectado antes de insertarlo en el lienzo'
                  : 'Sube una imagen o fotografía para que el sistema diseñe el diagrama'}
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="Cerrar ventana">
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {!analysisResult ? (
            <>
              {/* Dropzone de subida directa sin pestañas */}
              <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileChange}
                />
                {selectedImage ? (
                  <div className="image-preview-box">
                    <img src={selectedImage} alt="Foto seleccionada" className="preview-img" />
                    <span className="change-img-text">Clic para cambiar de imagen</span>
                  </div>
                ) : (
                  <div className="dropzone-empty">
                    <p className="dropzone-text">Haz clic para seleccionar la imagen del diagrama</p>
                    <span className="dropzone-sub">Formatos compatibles: JPG, PNG, WEBP</span>
                  </div>
                )}
              </div>

              {/* Configuración opcional de clave API */}
              <div className="api-key-accordion">
                <button
                  type="button"
                  className="toggle-key-btn"
                  onClick={() => setShowKeyInput(!showKeyInput)}
                >
                  {showKeyInput ? 'Ocultar' : 'Configurar'} Gemini Vision API Key (opcional)
                </button>
                {showKeyInput && (
                  <div className="key-input-row">
                    <input
                      type="password"
                      className="gemini-key-input"
                      placeholder="Pega tu Gemini API Key aquí si deseas usar una personalizada..."
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                    />
                    <span className="key-hint">
                      El servidor cuenta con una clave preconfigurada. Solo introduce una si deseas utilizar tu propia cuenta.
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Vista Previa Interactiva de lo Detectado */
            <div className="scan-preview-container">
              <div className="preview-summary-header">
                <span className="summary-badge">
                  {analysisResult.classes.length} Clases identificadas
                </span>
                <span className="summary-badge">
                  {analysisResult.relations.length} Relaciones identificadas
                </span>
              </div>

              {/* Lista de clases detectadas */}
              <div className="preview-section-title">Clases y Atributos:</div>
              <div className="preview-classes-grid">
                {analysisResult.classes.map((cls, idx) => (
                  <div key={idx} className="preview-class-card">
                    <div className="preview-class-header">
                      <span className="preview-class-name">{cls.name}</span>
                    </div>

                    <div className="preview-compartment">
                      <span className="compartment-label">Atributos:</span>
                      {cls.attributes && cls.attributes.length > 0 ? (
                        <ul className="preview-items-list">
                          {cls.attributes.map((attr, aIdx) => (
                            <li key={aIdx}>{attr}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="empty-compartment">Sin atributos</span>
                      )}
                    </div>

                    <div className="preview-compartment">
                      <span className="compartment-label">Métodos:</span>
                      {cls.methods && cls.methods.length > 0 ? (
                        <ul className="preview-items-list">
                          {cls.methods.map((meth, mIdx) => (
                            <li key={mIdx}>{meth}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="empty-compartment">Sin métodos</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Lista de relaciones detectadas */}
              {analysisResult.relations && analysisResult.relations.length > 0 && (
                <>
                  <div className="preview-section-title mt-3">Relaciones:</div>
                  <div className="preview-relations-list">
                    {analysisResult.relations.map((rel, rIdx) => (
                      <div key={rIdx} className="preview-relation-item">
                        <span className="rel-class-name">{rel.source}</span>
                        <span className="rel-type-tag">{translateRelationType(rel.type)}</span>
                        <span className="rel-class-name">{rel.target}</span>
                        {(rel.sourceMultiplicity || rel.targetMultiplicity) && (
                          <span className="rel-multiplicity">
                            ({rel.sourceMultiplicity || '1'} : {rel.targetMultiplicity || '1'})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Mensaje de confirmación de lienzo si ya tiene nodos */}
              {hasExistingNodes && (
                <div className="existing-canvas-notice">
                  <span className="notice-title">El lienzo actual contiene elementos</span>
                  <span className="notice-desc">
                    Tienes {nodes.length} elemento(s) en el diagrama actual. Elige si deseas reemplazar el lienzo por completo o conservar las clases actuales y añadir las nuevas a un lado.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          <button type="button" className="modal-cancel-btn" onClick={onClose}>
            Cancelar
          </button>

          {!analysisResult ? (
            <button
              type="button"
              className="modal-submit-btn"
              disabled={!selectedImage || isAnalyzing}
              onClick={handleAnalyzeImage}
            >
              {isAnalyzing ? (
                <>
                  <span className="spinner-small"></span>
                  <span>Analizando dibujo...</span>
                </>
              ) : (
                <span>Analizar y Diseñar Diagrama</span>
              )}
            </button>
          ) : (
            <div className="preview-actions-group">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={handleResetScan}
              >
                Volver a escanear
              </button>

              {hasExistingNodes ? (
                <>
                  <button
                    type="button"
                    className="modal-replace-btn"
                    onClick={() => handleApplyToCanvas('replace')}
                    title="Borra el diagrama actual y coloca el nuevo"
                  >
                    Reemplazar todo el lienzo
                  </button>
                  <button
                    type="button"
                    className="modal-submit-btn"
                    onClick={() => handleApplyToCanvas('append')}
                    title="Mantiene tus clases actuales y añade las del dibujo"
                  >
                    Conservar y agregar al lienzo
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="modal-submit-btn"
                  onClick={() => handleApplyToCanvas('replace')}
                >
                  Volcar al lienzo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
