import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useDiagramStore, type UmlClassNodeData, type UmlAttribute, type UmlMethod } from '../../../store/diagramStore';

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
    const parts = text.split(':').map((s) => s.trim());
    const attrName = parts[0] || 'campo';
    const attrType = parts[1] || 'string';

    updateNodeData(id, {
      attributes: (data.attributes || []).map((a) =>
        a.id === attrId ? { ...a, name: attrName, type: attrType } : a
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
    const cleanText = text.replace(/;$/, '').trim();
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
              <div key={attr.id} className="simple-line-row">
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
                    title="Clic para editar"
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
                  title="Eliminar"
                >
                  ×
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
              <div key={method.id} className="simple-line-row">
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
                    title="Clic para editar"
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
                  title="Eliminar"
                >
                  ×
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
    </div>
  );
};
