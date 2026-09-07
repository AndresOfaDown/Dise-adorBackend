import React from 'react';
import { useViewport } from 'reactflow';
import type { RemoteCursor } from '../../hooks/useDiagramSocket';

interface RemoteCursorsProps {
  cursors: RemoteCursor[];
}

export const RemoteCursors: React.FC<RemoteCursorsProps> = ({ cursors }) => {
  const { x, y, zoom } = useViewport();

  if (!cursors || cursors.length === 0) return null;

  return (
    <div
      className="remote-cursors-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    >
      {cursors.map((c) => {
        const screenX = c.x * zoom + x;
        const screenY = c.y * zoom + y;

        return (
          <div
            key={c.clientId}
            className="remote-cursor-item"
            style={{
              position: 'absolute',
              left: `${screenX}px`,
              top: `${screenY}px`,
              transform: 'translate(0, 0)',
              transition: 'left 0.06s ease-out, top 0.06s ease-out',
              zIndex: 1000,
              pointerEvents: 'none',
            }}
          >
            {/* Flecha del cursor */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))',
              }}
            >
              <path
                d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
                fill={c.color || '#3b82f6'}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            {/* Insignia con el nombre del usuario */}
            <div
              className="remote-cursor-badge"
              style={{
                backgroundColor: c.color || '#3b82f6',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '999px',
                whiteSpace: 'nowrap',
                marginLeft: '14px',
                marginTop: '-6px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                letterSpacing: '0.2px',
              }}
            >
              {c.username}
            </div>
          </div>
        );
      })}
    </div>
  );
};
