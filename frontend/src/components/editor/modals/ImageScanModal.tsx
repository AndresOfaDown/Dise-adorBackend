import React, { useState, useRef, useEffect, useCallback } from 'react';
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

  const [activeTab, setActiveTab] = useState<'file' | 'camera'>('camera');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('user_gemini_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Estados de cámara web
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Resultado de análisis
  const [analysisResult, setAnalysisResult] = useState<{
    classes: DetectedClass[];
    relations: DetectedRelation[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detener cámara web
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraLoading(false);
  }, []);

  // Iniciar cámara web
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setIsCameraLoading(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Tu navegador no soporta captura de cámara en este contexto.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'environment',
          },
        });
      } catch {
        // Fallback básico
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Error al encender cámara:', err);
      const msg = err?.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Permite el acceso a la cámara en tu navegador.'
        : err?.message || 'No se pudo activar la cámara.';
      setCameraError(msg);
      toast.error(msg);
    } finally {
      setIsCameraLoading(false);
    }
  }, [stopCamera]);

  // Capturar foto del video
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setSelectedImage(dataUrl);
      setAnalysisResult(null);
      stopCamera();
      toast.success('¡Fotografía capturada!');
    }
  };

  // Manejar cambio de pestaña
  const handleTabChange = (tab: 'file' | 'camera') => {
    setActiveTab(tab);
    if (tab === 'camera') {
      if (!selectedImage) {
        startCamera();
      }
    } else {
      stopCamera();
    }
  };

  // Si se cierra el modal, limpiar todo y apagar cámara
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setSelectedImage(null);
      setAnalysisResult(null);
      setCameraError(null);
    } else {
      if (activeTab === 'camera' && !selectedImage) {
        startCamera();
      }
    }
  }, [isOpen, activeTab, selectedImage, startCamera, stopCamera]);

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
      toast.error('Por favor captura o selecciona una imagen');
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
    stopCamera();
    setSelectedImage(null);
    setAnalysisResult(null);
    onClose();
  };

  const handleResetScan = () => {
    setAnalysisResult(null);
    setSelectedImage(null);
    if (activeTab === 'camera') {
      startCamera();
    }
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
    <div className="modal-overlay" onClick={() => { stopCamera(); onClose(); }}>
      <div className="modal-container" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div>
              <h2 className="modal-title">Escanear Diagrama con Cámara / Imagen</h2>
              <p className="modal-subtitle">
                {analysisResult
                  ? 'Revisa el resultado detectado antes de insertarlo en el lienzo'
                  : 'Muestra tu cuaderno frente a la cámara o sube una imagen'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => { stopCamera(); onClose(); }}
            title="Cerrar ventana"
          >
            ×
          </button>
        </div>

        {/* Pestañas de modo: Cámara vs Archivo */}
        {!analysisResult && (
          <div style={{ display: 'flex', gap: '8px', padding: '12px 24px 0', borderBottom: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => handleTabChange('camera')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                border: 'none',
                borderBottom: activeTab === 'camera' ? '2px solid #2563eb' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === 'camera' ? '#2563eb' : '#64748b',
                fontWeight: activeTab === 'camera' ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📸 Usar Cámara Web</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('file')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                border: 'none',
                borderBottom: activeTab === 'file' ? '2px solid #2563eb' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === 'file' ? '#2563eb' : '#64748b',
                fontWeight: activeTab === 'file' ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📁 Subir Archivo</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="modal-body">
          {!analysisResult ? (
            <>
              {activeTab === 'camera' ? (
                /* Modo Cámara Web */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  {selectedImage ? (
                    /* Foto tomada con éxito */
                    <div style={{ position: 'relative', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '2px solid #3b82f6', backgroundColor: '#0f172a' }}>
                      <img
                        src={selectedImage}
                        alt="Foto capturada del cuaderno"
                        style={{ width: '100%', maxHeight: '360px', objectFit: 'contain', display: 'block' }}
                      />
                      <div style={{
                        position: 'absolute',
                        bottom: '12px',
                        left: '0',
                        right: '0',
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '12px',
                      }}>
                        <button
                          type="button"
                          onClick={() => { setSelectedImage(null); startCamera(); }}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: 'rgba(15, 23, 42, 0.85)',
                            color: '#ffffff',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            backdropFilter: 'blur(6px)',
                          }}
                        >
                          🔄 Volver a Tomar Foto
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Visor de Cámara en Vivo */
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      minHeight: '280px',
                      maxHeight: '380px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      backgroundColor: '#0f172a',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px dashed #94a3b8',
                    }}>
                      {/* Elemento de video en vivo */}
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        style={{
                          width: '100%',
                          height: '100%',
                          maxHeight: '380px',
                          objectFit: 'contain',
                          display: isCameraActive ? 'block' : 'none',
                        }}
                      />
                      <canvas ref={canvasRef} style={{ display: 'none' }} />

                      {/* Cargando cámara */}
                      {isCameraLoading && (
                        <div style={{ color: '#ffffff', textAlign: 'center', padding: '24px' }}>
                          <div className="spinner-small" style={{ margin: '0 auto 12px' }}></div>
                          <p style={{ fontSize: '14px', margin: 0 }}>Activando cámara web...</p>
                        </div>
                      )}

                      {/* Error de cámara */}
                      {cameraError && !isCameraLoading && (
                        <div style={{ color: '#ef4444', textAlign: 'center', padding: '24px' }}>
                          <p style={{ fontSize: '14px', marginBottom: '12px' }}>⚠️ {cameraError}</p>
                          <button
                            type="button"
                            onClick={startCamera}
                            style={{
                              padding: '6px 14px',
                              backgroundColor: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            Reintentar Conectar
                          </button>
                        </div>
                      )}

                      {/* Botón flotante para capturar foto */}
                      {isCameraActive && (
                        <div style={{
                          position: 'absolute',
                          bottom: '16px',
                          left: '0',
                          right: '0',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                        }}>
                          <button
                            type="button"
                            onClick={handleCapturePhoto}
                            style={{
                              padding: '10px 24px',
                              backgroundColor: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '24px',
                              fontSize: '14px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.5)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <circle cx="12" cy="12" r="4" fill="currentColor" />
                            </svg>
                            <span>📸 Tomar Foto al Cuaderno</span>
                          </button>
                          <span style={{
                            fontSize: '11px',
                            color: '#ffffff',
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                          }}>
                            Apunta tu cuaderno de forma iluminada y nítida
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Modo Subir Archivo */
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
              )}

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
                          {cls.methods.map((method, mIdx) => (
                            <li key={mIdx}>{method}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="empty-compartment">Sin métodos</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Relaciones detectadas */}
              {analysisResult.relations.length > 0 && (
                <div className="preview-relations-section">
                  <div className="preview-section-title">Relaciones identificadas:</div>
                  <div className="preview-relations-list">
                    {analysisResult.relations.map((rel, idx) => (
                      <div key={idx} className="preview-relation-item">
                        <span className="rel-class-source">{rel.source}</span>
                        <span className="rel-cardinality">({rel.sourceMultiplicity || '1'})</span>
                        <span className="rel-arrow">
                          ──[{translateRelationType(rel.type)}
                          {rel.label ? `: ${rel.label}` : ''}]──▶
                        </span>
                        <span className="rel-cardinality">({rel.targetMultiplicity || '1..*'})</span>
                        <span className="rel-class-target">{rel.target}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          <button type="button" className="modal-cancel-btn" onClick={() => { stopCamera(); onClose(); }}>
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
                <span>✨ Analizar y Diseñar Diagrama</span>
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
