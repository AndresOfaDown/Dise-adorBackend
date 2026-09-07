import React, { useState, useRef, useEffect } from 'react';
import type { NodeProps } from 'reactflow';
import { useDiagramStore, type UmlTextNodeData } from '../../../store/diagramStore';

export const UmlTextNode: React.FC<NodeProps<UmlTextNodeData>> = ({ id, data, selected }) => {
  const { updateTextNodeData } = useDiagramStore();
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(data.text || 'texto');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(data.text || 'texto');
  }, [data.text]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    updateTextNodeData(id, text.trim() || 'texto');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
      setText(data.text || 'texto');
    } else if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div
      className={`simple-uml-text-node ${selected ? 'is-selected' : ''}`}
      onClick={() => {
        const store = useDiagramStore.getState();
        if (store.selectedTool !== 'select') {
          store.setSelectedTool('select');
        }
        if (store.connectingSourceNodeId) {
          store.setConnectingSourceNodeId(null);
        }
        // Al estar seleccionado, un clic permite editar directamente
        if (selected && !isEditing) {
          setIsEditing(true);
        }
      }}
      onDoubleClick={() => setIsEditing(true)}
    >
      {/* 8 puntos / cuadritos en los bordes cuando está seleccionado (idéntico a la imagen de referencia) */}
      {selected && (
        <>
          <span className="text-select-handle top-left" />
          <span className="text-select-handle top-center" />
          <span className="text-select-handle top-right" />
          <span className="text-select-handle middle-left" />
          <span className="text-select-handle middle-right" />
          <span className="text-select-handle bottom-left" />
          <span className="text-select-handle bottom-center" />
          <span className="text-select-handle bottom-right" />
        </>
      )}

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="simple-text-input nodrag"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{ width: `${Math.max(45, (text.length + 2) * 8.5)}px` }}
        />
      ) : (
        <div className="simple-text-display">
          {text || 'texto'}
        </div>
      )}
    </div>
  );
};
