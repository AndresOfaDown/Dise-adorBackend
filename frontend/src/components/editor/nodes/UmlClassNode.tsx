import React, { useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useDiagramStore, type UmlClassNodeData, type UmlAttribute, type UmlMethod } from '../../../store/diagramStore';
import toast from 'react-hot-toast';

export const UmlClassNode: React.FC<NodeProps<UmlClassNodeData>> = ({ id, data, selected }) => {
  const {
    updateNodeData,
    deleteNode,
    selectedTool,
    setSelectedTool,
    connectingSourceNodeId,
    setConnectingSourceNodeId,
    hoveredNodeId,
    setHoveredNodeId,
    connectTwoNodes,
  } = useDiagramStore();

  const isRelationToolActive = selectedTool !== 'select' && selectedTool !== 'class' && selectedTool !== 'text';
  const isConnectingSource = connectingSourceNodeId === id;
  const isTargetHovered = isRelationToolActive && !!connectingSourceNodeId && connectingSourceNodeId !== id && hoveredNodeId === id;

  const [isEditingName, setIsEditingName] = useState(false);
  const [className, setClassName] = useState(data.name || 'Entidad');

  // Estado de edición inline para atributos y métodos
  const [editingAttrId, setEditingAttrId] = useState<string | null>(null);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);

  // Estado de menú contextual (clic derecho) para atributos y métodos
  const [attrContextMenu, setAttrContextMenu] = useState<{
    x: number;
    y: number;
    attrId: string;
    attrName: string;
  } | null>(null);

  const [methodContextMenu, setMethodContextMenu] = useState<{
    x: number;
    y: number;
    methodId: string;
    methodName: string;
  } | null>(null);

  useEffect(() => {
    const handleClickOutside = () => {
      setAttrContextMenu(null);
      setMethodContextMenu(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Nombre de clase
  const handleNameBlur = () => {
    setIsEditingName(false);
    if (className.trim()) {
      updateNodeData(id, { name: className.trim() });
    } else {
      setClassName(data.name || 'Entidad');
    }
  };

  // Clic o inicio de conexión en la clase cuando una herramienta de relación está activa
  const handleCardClick = (e: React.MouseEvent) => {
    if (!isRelationToolActive) return;

    e.stopPropagation();

    if (!connectingSourceNodeId) {
      // Paso 1: Seleccionar esta clase como origen
      setConnectingSourceNodeId(id);
    } else if (connectingSourceNodeId === id) {
      // Si vuelve a hacer clic en la misma clase, se desactiva
      setConnectingSourceNodeId(null);
      setHoveredNodeId(null);
      setSelectedTool('select');
    } else {
      // Paso 2: Conectar clase origen con esta clase destino (se desactiva automáticamente en connectTwoNodes)
      connectTwoNodes(connectingSourceNodeId, id);
    }
  };

  const handlePointerEnter = () => {
    if (isRelationToolActive) {
      setHoveredNodeId(id);
    }
  };

  const handlePointerLeave = () => {
    if (isRelationToolActive && hoveredNodeId === id) {
      setHoveredNodeId(null);
    }
  };

  // Helper para formatear atributo "nombre: tipo"
  const formatAttributeText = (attr: UmlAttribute) => {
    return attr.type ? `${attr.name}: ${attr.type}` : attr.name;
  };

  // Helper para parsear atributo al terminar de escribir
  const parseAttributeText = (attrId: string, text: string) => {
    let cleanText = (text || '').trim();
    // Si el usuario vació el texto, eliminar el atributo directamente
    if (!cleanText) {
      handleDeleteAttribute(attrId);
      return;
    }

    let vis: '+' | '-' | '#' | '~' | undefined;
    const visMatch = cleanText.match(/^[+\-~#]/);
    if (visMatch) {
      vis = visMatch[0] as any;
      cleanText = cleanText.replace(/^[+\-~#]+\s*/, '');
    }
    const parts = cleanText.split(':').map((s) => s.trim());
    const attrName = parts[0] || 'campo';
    const attrType = parts[1] || 'string';

    updateNodeData(id, {
      attributes: (data.attributes || []).map((a) =>
        a.id === attrId
          ? {
              ...a,
              visibility: vis || a.visibility || '+',
              name: attrName,
              type: attrType,
            }
          : a
      ),
    });
  };

  // Helper para formatear método "nombre();"
  const formatMethodText = (method: UmlMethod) => {
    if (method.name.includes('(')) {
      return method.name.endsWith(';') ? method.name : `${method.name};`;
    }
    const params = method.parameters ? method.parameters : '';
    const ret = method.returnType ? `: ${method.returnType}` : '';
    return `${method.name}(${params})${ret};`;
  };

  // Helper para parsear método
  const parseMethodText = (methodId: string, text: string) => {
    const cleanText = (text || '').replace(/;$/, '').trim();
    if (!cleanText) {
      handleDeleteMethod(methodId);
      return;
    }
    updateNodeData(id, {
      methods: (data.methods || []).map((m) =>
        m.id === methodId ? { ...m, name: cleanText } : m
      ),
    });
  };

  // Agregar atributo
  const handleAddAttribute = () => {
    const newAttr: UmlAttribute = {
      id: `attr_${Date.now()}`,
      visibility: '+',
      name: `nuevoCampo`,
      type: 'string',
    };
    const updated = [...(data.attributes || []), newAttr];
    updateNodeData(id, { attributes: updated });
    setEditingAttrId(newAttr.id);
  };

  // Eliminar atributo
  const handleDeleteAttribute = (attrId: string) => {
    updateNodeData(id, {
      attributes: (data.attributes || []).filter((a) => a.id !== attrId),
    });
    toast.success('Atributo eliminado');
  };

  // Agregar método
  const handleAddMethod = () => {
    const newMethod: UmlMethod = {
      id: `method_${Date.now()}`,
      visibility: '+',
      name: `nuevoMetodo`,
      parameters: '',
      returnType: '',
    };
    const updated = [...(data.methods || []), newMethod];
    updateNodeData(id, { methods: updated });
    setEditingMethodId(newMethod.id);
  };

  // Eliminar método
  const handleDeleteMethod = (methodId: string) => {
    updateNodeData(id, {
      methods: (data.methods || []).filter((m) => m.id !== methodId),
    });
    toast.success('Método eliminado');
  };

  return (
    <div
      className={`simple-uml-card ${selected ? 'is-selected' : ''} ${
        isConnectingSource ? 'connecting-source-active' : ''
      } ${isRelationToolActive ? 'relation-mode-card' : ''} ${
        isTargetHovered ? 'connecting-target-hover' : ''
      }`}
      onClick={handleCardClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* 8 Puntos de conexión para relaciones (4 lados medios + 4 esquinas) */}
      {/* 1. Arriba Centro */}
      <Handle type="target" position={Position.Top} id="top-t" className="simple-handle" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Top} id="top-s" className="simple-handle" style={{ left: '50%' }} />

      {/* 2. Abajo Centro */}
      <Handle type="target" position={Position.Bottom} id="bottom-t" className="simple-handle" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-s" className="simple-handle" style={{ left: '50%' }} />

      {/* 3. Izquierda Centro */}
      <Handle type="target" position={Position.Left} id="left-t" className="simple-handle" style={{ top: '50%' }} />
      <Handle type="source" position={Position.Left} id="left-s" className="simple-handle" style={{ top: '50%' }} />

      {/* 4. Derecha Centro */}
      <Handle type="target" position={Position.Right} id="right-t" className="simple-handle" style={{ top: '50%' }} />
      <Handle type="source" position={Position.Right} id="right-s" className="simple-handle" style={{ top: '50%' }} />

      {/* 5. Esquina Superior Izquierda */}
      <Handle type="target" position={Position.Top} id="top-left-t" className="simple-handle" style={{ left: '0%', top: '0%' }} />
      <Handle type="source" position={Position.Top} id="top-left-s" className="simple-handle" style={{ left: '0%', top: '0%' }} />

      {/* 6. Esquina Superior Derecha */}
      <Handle type="target" position={Position.Top} id="top-right-t" className="simple-handle" style={{ left: '100%', top: '0%' }} />
      <Handle type="source" position={Position.Top} id="top-right-s" className="simple-handle" style={{ left: '100%', top: '0%' }} />

      {/* 7. Esquina Inferior Izquierda */}
      <Handle type="target" position={Position.Bottom} id="bottom-left-t" className="simple-handle" style={{ left: '0%', bottom: '0%', top: 'auto' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-left-s" className="simple-handle" style={{ left: '0%', bottom: '0%', top: 'auto' }} />

      {/* 8. Esquina Inferior Derecha */}
      <Handle type="target" position={Position.Bottom} id="bottom-right-t" className="simple-handle" style={{ left: '100%', bottom: '0%', top: 'auto' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-right-s" className="simple-handle" style={{ left: '100%', bottom: '0%', top: 'auto' }} />

      {/* Compartimiento 1: Encabezado con fondo celeste suave */}
      <div className="simple-header-box">
        {isEditingName ? (
          <input
            type="text"
            className="simple-header-input nodrag"
            value={className}
            autoFocus
            onChange={(e) => setClassName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleNameBlur()}
          />
        ) : (
          <div
            className="simple-header-title"
            onDoubleClick={() => setIsEditingName(true)}
            title="Doble clic para editar nombre"
          >
            {data.name || 'Entidad'}
          </div>
        )}

        {/* Botón flotante para eliminar clase al pasar el cursor */}
        <button
          type="button"
          className="simple-delete-node-btn nodrag"
          title="Eliminar entidad"
          onClick={(e) => {
            e.stopPropagation();
            deleteNode(id);
          }}
        >
          ×
        </button>
      </div>

      {/* Compartimiento 2: Atributos (id: int, nombre: string) */}
      <div className="simple-compartment attributes-box">
        <div className="compartment-content">
          {(data.attributes || []).length === 0 ? (
            <div
              className="simple-empty-hint"
              onClick={(e) => {
                e.stopPropagation();
                handleAddAttribute();
              }}
              title="Clic para agregar atributo"
            >
              + agregar atributo...
            </div>
          ) : (
            (data.attributes || []).map((attr) => (
              <div
                key={attr.id}
                className="simple-line-row"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMethodContextMenu(null);
                  setAttrContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    attrId: attr.id,
                    attrName: attr.name,
                  });
                }}
              >
                {editingAttrId === attr.id ? (
                  <input
                    type="text"
                    className="simple-inline-input nodrag"
                    defaultValue={formatAttributeText(attr)}
                    autoFocus
                    onBlur={(e) => {
                      parseAttributeText(attr.id, e.target.value);
                      setEditingAttrId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        parseAttributeText(attr.id, e.currentTarget.value);
                        setEditingAttrId(null);
                        handleAddAttribute();
                      } else if (e.key === 'Escape') {
                        setEditingAttrId(null);
                      }
                    }}
                  />
                ) : (
                  <div
                    className="simple-line-text"
                    onClick={(e) => {
                      if (!isRelationToolActive) {
                        e.stopPropagation();
                        setEditingAttrId(attr.id);
                      }
                    }}
                    title="Clic para editar (o clic derecho para eliminar)"
                  >
                    {formatAttributeText(attr)}
                  </div>
                )}
                <button
                  type="button"
                  className="simple-line-delete-btn nodrag"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAttribute(attr.id);
                  }}
                  title="Eliminar atributo"
                  aria-label="Eliminar atributo"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          className="simple-add-line-btn nodrag"
          onClick={(e) => {
            e.stopPropagation();
            handleAddAttribute();
          }}
          title="Agregar atributo"
        >
          +
        </button>
      </div>

      {/* Compartimiento 3: Métodos (crear();, eliminar();) */}
      <div className="simple-compartment methods-box">
        <div className="compartment-content">
          {(data.methods || []).length === 0 ? (
            <div
              className="simple-empty-hint"
              onClick={(e) => {
                e.stopPropagation();
                handleAddMethod();
              }}
              title="Clic para agregar método"
            >
              + agregar método...
            </div>
          ) : (
            (data.methods || []).map((method) => (
              <div
                key={method.id}
                className="simple-line-row"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAttrContextMenu(null);
                  setMethodContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    methodId: method.id,
                    methodName: method.name,
                  });
                }}
              >
                {editingMethodId === method.id ? (
                  <input
                    type="text"
                    className="simple-inline-input nodrag"
                    defaultValue={formatMethodText(method)}
                    autoFocus
                    onBlur={(e) => {
                      parseMethodText(method.id, e.target.value);
                      setEditingMethodId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        parseMethodText(method.id, e.currentTarget.value);
                        setEditingMethodId(null);
                        handleAddMethod();
                      } else if (e.key === 'Escape') {
                        setEditingMethodId(null);
                      }
                    }}
                  />
                ) : (
                  <div
                    className="simple-line-text"
                    onClick={(e) => {
                      if (!isRelationToolActive) {
                        e.stopPropagation();
                        setEditingMethodId(method.id);
                      }
                    }}
                    title="Clic para editar (o clic derecho para eliminar)"
                  >
                    {formatMethodText(method)}
                  </div>
                )}
                <button
                  type="button"
                  className="simple-line-delete-btn nodrag"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteMethod(method.id);
                  }}
                  title="Eliminar método"
                  aria-label="Eliminar método"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          className="simple-add-line-btn nodrag"
          onClick={(e) => {
            e.stopPropagation();
            handleAddMethod();
          }}
          title="Agregar método"
        >
          +
        </button>
      </div>

      {/* Menú contextual flotante para atributos (clic derecho) */}
      {attrContextMenu && (
        <div
          className="edge-context-menu"
          style={{
            position: 'fixed',
            top: attrContextMenu.y,
            left: attrContextMenu.x,
            zIndex: 99999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            <span>Atributo: {attrContextMenu.attrName}</span>
          </div>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              setEditingAttrId(attrContextMenu.attrId);
              setAttrContextMenu(null);
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>Editar atributo</span>
          </button>
          <button
            type="button"
            className="context-menu-item delete"
            onClick={() => {
              handleDeleteAttribute(attrContextMenu.attrId);
              setAttrContextMenu(null);
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Eliminar atributo</span>
          </button>
        </div>
      )}

      {/* Menú contextual flotante para métodos (clic derecho) */}
      {methodContextMenu && (
        <div
          className="edge-context-menu"
          style={{
            position: 'fixed',
            top: methodContextMenu.y,
            left: methodContextMenu.x,
            zIndex: 99999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            <span>Método: {methodContextMenu.methodName}</span>
          </div>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              setEditingMethodId(methodContextMenu.methodId);
              setMethodContextMenu(null);
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>Editar método</span>
          </button>
          <button
            type="button"
            className="context-menu-item delete"
            onClick={() => {
              handleDeleteMethod(methodContextMenu.methodId);
              setMethodContextMenu(null);
            }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Eliminar método</span>
          </button>
        </div>
      )}
    </div>
  );
};
