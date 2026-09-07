import React, { useState } from 'react';
import { toJpeg } from 'html-to-image';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import { useDiagramStore, type ToolType } from '../../store/diagramStore';
import { ImageScanModal } from './modals/ImageScanModal';

export const ToolSidebar: React.FC = () => {
  const { selectedTool, setSelectedTool, addClassNode, addTextNode, projectName } = useDiagramStore();

  const [isActionsOpen, setIsActionsOpen] = useState(true);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleCreateClassQuick = () => {
    const randomOffset = Math.floor(Math.random() * 80);
    addClassNode({ x: 250 + randomOffset, y: 150 + randomOffset });
  };

  const handleCreateTextQuick = () => {
    const randomOffset = Math.floor(Math.random() * 80);
    addTextNode({ x: 300 + randomOffset, y: 220 + randomOffset });
  };

  const onDragStartClass = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', 'class');
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragStartText = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', 'text');
    event.dataTransfer.effectAllowed = 'move';
  };

  // Exportar el diagrama a Imagen en formato JPG
  const handleExportJpg = async () => {
    const canvasElement = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!canvasElement) {
      toast.error('No se pudo encontrar el canvas para exportar');
      return;
    }

    try {
      setIsExporting(true);
      const dataUrl = await toJpeg(canvasElement, {
        backgroundColor: '#ffffff',
        quality: 0.95,
      });
      saveAs(dataUrl, `${projectName || 'diagrama-uml'}.jpg`);
      toast.success('¡Imagen JPG del diagrama exportada!');
    } catch (error) {
      toast.error('Error al exportar la imagen JPG del diagrama');
    } finally {
      setIsExporting(false);
    }
  };

  const relationTools: { id: ToolType; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'association',
      label: 'Asociación',
      desc: 'Conexión estándar con multiplicidad',
      icon: (
        <svg width="22" height="16" viewBox="0 0 24 16" fill="none" stroke="currentColor">
          <line x1="2" y1="8" x2="22" y2="8" strokeWidth="2.5" />
        </svg>
      ),
    },
    {
      id: 'aggregation',
      label: 'Agregación',
      desc: 'Contiene / relación débil (todo-parte)',
      icon: (
        <svg width="22" height="16" viewBox="0 0 24 16" fill="none" stroke="currentColor">
          <polygon points="2,8 7,4 12,8 7,12" fill="#ffffff" strokeWidth="2" />
          <line x1="12" y1="8" x2="22" y2="8" strokeWidth="2" />
        </svg>
      ),
    },
    {
      id: 'composition',
      label: 'Composición',
      desc: 'Posee / relación fuerte (vida dependiente)',
      icon: (
        <svg width="22" height="16" viewBox="0 0 24 16" fill="none" stroke="currentColor">
          <polygon points="2,8 7,4 12,8 7,12" fill="currentColor" strokeWidth="2" />
          <line x1="12" y1="8" x2="22" y2="8" strokeWidth="2" />
        </svg>
      ),
    },
    {
      id: 'dependency',
      label: 'Dependencia',
      desc: 'Usa a (línea discontinua con flecha)',
      icon: (
        <svg width="22" height="16" viewBox="0 0 24 16" fill="none" stroke="currentColor">
          <line x1="2" y1="8" x2="19" y2="8" strokeWidth="2" strokeDasharray="3 3" />
          <polyline points="15,4 20,8 15,12" strokeWidth="2" />
        </svg>
      ),
    },
    {
      id: 'generalization',
      label: 'Generalización',
      desc: 'Herencia / jerarquía de clases (es-un)',
      icon: (
        <svg width="22" height="16" viewBox="0 0 24 16" fill="none" stroke="currentColor">
          <line x1="2" y1="8" x2="14" y2="8" strokeWidth="2" />
          <polygon points="14,3 22,8 14,13" fill="#ffffff" strokeWidth="2" />
        </svg>
      ),
    },
    {
      id: 'associationClass',
      label: 'Asociación de clases',
      desc: 'Muchos a muchos (genera tabla intermedia)',
      icon: (
        <svg width="22" height="16" viewBox="0 0 24 16" fill="none" stroke="currentColor">
          <line x1="2" y1="4" x2="22" y2="4" strokeWidth="2" />
          <line x1="12" y1="4" x2="12" y2="9" strokeWidth="1.5" strokeDasharray="2 2" />
          <rect x="7" y="9" width="10" height="6" rx="1" fill="#e0f2fe" strokeWidth="1.5" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="editor-tool-sidebar">
      {/* Sección Elementos UML: Clase y Texto */}
      <div className="sidebar-group">
        <span className="sidebar-group-title">Elementos UML</span>
        <div className="elements-list">
          {/* Herramienta Clase */}
          <div
            className={`sidebar-tool-btn class-tool ${selectedTool === 'class' ? 'active' : ''}`}
            draggable
            onDragStart={onDragStartClass}
            onClick={() => {
              setSelectedTool('class');
              handleCreateClassQuick();
            }}
            title="Haz clic para agregar o arrastra hacia el canvas"
          >
            <div className="tool-icon class-badge-icon">
              <span>C</span>
            </div>
            <div className="tool-info">
              <span className="tool-name">Clase</span>
              <span className="tool-desc">Entidad con atributos y métodos</span>
            </div>
          </div>

          {/* Herramienta Texto */}
          <div
            className={`sidebar-tool-btn text-tool ${selectedTool === 'text' ? 'active' : ''}`}
            draggable
            onDragStart={onDragStartText}
            onClick={() => {
              setSelectedTool('text');
              handleCreateTextQuick();
            }}
            title="Haz clic para agregar texto o arrastra hacia el canvas"
          >
            <div className="tool-icon text-badge-icon">
              <span>T</span>
            </div>
            <div className="tool-info">
              <span className="tool-name">Texto</span>
              <span className="tool-desc">Nota o anotación en el diagrama</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sección Relaciones UML */}
      <div className="sidebar-group">
        <span className="sidebar-group-title">Relaciones UML</span>
        <div className="relations-list">
          {relationTools.map((rel) => (
            <button
              key={rel.id}
              id={`tool-${rel.id}`}
              data-testid={`tool-${rel.id}`}
              type="button"
              className={`sidebar-tool-btn ${selectedTool === rel.id ? 'active' : ''}`}
              onClick={() => setSelectedTool(selectedTool === rel.id ? 'select' : rel.id)}
              title={rel.desc}
            >
              <div className="tool-icon">{rel.icon}</div>
              <div className="tool-info">
                <span className="tool-name">{rel.label}</span>
                <span className="tool-desc">{rel.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sección Herramientas y Exportación (Desplegable) */}
      <div className="sidebar-group">
        <button
          type="button"
          className="sidebar-dropdown-trigger"
          onClick={() => setIsActionsOpen(!isActionsOpen)}
          title="Haz clic para ver opciones de escaneo y exportación"
        >
          <span className="sidebar-group-title mb-0">Herramientas & Exportación</span>
          <span className={`trigger-arrow ${isActionsOpen ? 'open' : ''}`}>▾</span>
        </button>

        {isActionsOpen && (
          <div className="sidebar-actions-dropdown">
            {/* 1. Escanear Archivo o Imagen */}
            <button
              type="button"
              className="sidebar-action-item"
              onClick={() => setIsScanModalOpen(true)}
              title="Sube una foto o archivo de diagrama para que la IA genere las clases"
            >
              <span className="action-item-title">Escanear Archivo o Imagen</span>
            </button>

            {/* 2. Exportar Imagen */}
            <button
              type="button"
              className="sidebar-action-item"
              onClick={handleExportJpg}
              disabled={isExporting}
              title="Descargar diagrama en formato JPG"
            >
              <span className="action-item-title">
                {isExporting ? 'Exportando imagen...' : 'Exportar Imagen'}
              </span>
            </button>

            {/* 3. Exportar como SQL */}
            <button
              type="button"
              className="sidebar-action-item"
              onClick={() => {
                toast('Exportación a SQL disponible próximamente');
              }}
              title="Generar scripts DDL SQL"
            >
              <span className="action-item-title">Exportar como SQL</span>
            </button>

            {/* 4. Exportar a Backend */}
            <button
              type="button"
              className="sidebar-action-item"
              onClick={() => {
                toast('Generación de código Backend disponible próximamente');
              }}
              title="Generar código de backend"
            >
              <span className="action-item-title">Exportar a Backend</span>
            </button>
          </div>
        )}
      </div>

      {/* Guía rápida al pie del sidebar */}
      <div className="sidebar-footer-hint">
        <p className="hint-text">
          💡 <strong>Tip:</strong> Selecciona una relación y haz clic en dos clases para vincularlas.
        </p>
      </div>

      {/* Modal de Escaneo con IA */}
      <ImageScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
      />
    </aside>
  );
};
