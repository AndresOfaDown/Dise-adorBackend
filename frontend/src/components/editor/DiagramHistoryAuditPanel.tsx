import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../../api/client';

export interface AuditChangeItem {
  id: number;
  usuario_nombre: string;
  usuario_color: string;
  tipo_accion: string;
  entidad_afectada: string;
  descripcion: string;
  detalles: any;
  created_at: string;
}

interface DiagramHistoryAuditPanelProps {
  projectId: number | null;
}

export const DiagramHistoryAuditPanel: React.FC<DiagramHistoryAuditPanelProps> = ({ projectId }) => {
  const [historyItems, setHistoryItems] = useState<AuditChangeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedActionType, setSelectedActionType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Cargar historial de auditoría desde el backend
  const fetchAuditHistory = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await apiClient.get<{ success: boolean; historial: AuditChangeItem[] }>(
        `/api/projects/${projectId}/historial-cambios/`
      );
      if (res.data?.success && Array.isArray(res.data.historial)) {
        setHistoryItems(res.data.historial);
      }
    } catch (err) {
      console.warn('Error cargando historial de cambios:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditHistory();
  }, [projectId]);

  // Escuchar eventos en tiempo real si se difunde un cambio de auditoría por WebSocket
  useEffect(() => {
    const handleAuditChangeEvent = (e: any) => {
      const newChange = e.detail;
      if (newChange) {
        setHistoryItems((prev) => {
          if (prev.some((item) => item.id === newChange.id)) return prev;
          return [newChange, ...prev];
        });
      }
    };
    window.addEventListener('audit_change_event', handleAuditChangeEvent);
    return () => window.removeEventListener('audit_change_event', handleAuditChangeEvent);
  }, []);

  // Lista única de usuarios que han hecho cambios
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    historyItems.forEach((item) => {
      if (!map.has(item.usuario_nombre)) {
        map.set(item.usuario_nombre, item.usuario_color || '#2563eb');
      }
    });
    return Array.from(map.entries()).map(([name, color]) => ({ name, color }));
  }, [historyItems]);

  // Filtrado de eventos
  const filteredItems = useMemo(() => {
    return historyItems.filter((item) => {
      // Filtro por usuario
      if (selectedUser !== 'all' && item.usuario_nombre.toLowerCase() !== selectedUser.toLowerCase()) {
        return false;
      }
      // Filtro por tipo de acción
      if (selectedActionType !== 'all') {
        if (selectedActionType === 'clase' && !item.tipo_accion.includes('clase')) return false;
        if (selectedActionType === 'relacion' && !item.tipo_accion.includes('relacion')) return false;
        if (selectedActionType === 'atributo' && !item.tipo_accion.includes('atributo')) return false;
        if (selectedActionType === 'ia' && item.tipo_accion !== 'ia_accion') return false;
      }
      // Filtro por búsqueda de texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesEntity = (item.entidad_afectada || '').toLowerCase().includes(term);
        const matchesDesc = (item.descripcion || '').toLowerCase().includes(term);
        const matchesUser = (item.usuario_nombre || '').toLowerCase().includes(term);
        if (!matchesEntity && !matchesDesc && !matchesUser) return false;
      }
      return true;
    });
  }, [historyItems, selectedUser, selectedActionType, searchTerm]);

  // Helper para badge de tipo de acción
  const getActionBadge = (tipo: string) => {
    if (tipo === 'crear_clase') {
      return { text: '+ Clase', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
    }
    if (tipo === 'eliminar_clase') {
      return { text: '- Clase', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' };
    }
    if (tipo === 'crear_relacion') {
      return { text: '+ Relación', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
    }
    if (tipo === 'eliminar_relacion') {
      return { text: '- Relación', bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
    }
    if (tipo === 'crear_atributo' || tipo === 'modificar_atributo') {
      return { text: '~ Atributo', bg: '#f3e8ff', color: '#7e22ce', border: '#e9d5ff' };
    }
    if (tipo === 'ia_accion') {
      return { text: '🤖 IA Senior', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
    }
    return { text: 'Modificación', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
  };

  const formatExactDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return {
        date: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
    } catch {
      return { date: '', time: '' };
    }
  };

  return (
    <div className="diagram-audit-panel-content">
      <div className="audit-history-container">
        {/* Cabecera Informativa de Auditoría Compacta */}
        <div className="audit-header-summary">
          <div className="audit-summary-title">
            <span className="audit-live-dot"></span>
            <span>Historial Diagrama</span>
            <span className="audit-kpi-chip">{historyItems.length} cambios</span>
            <span className="audit-kpi-chip">{uniqueUsers.length} autores</span>
          </div>
          <button
            type="button"
            className="audit-refresh-btn-compact"
            onClick={fetchAuditHistory}
            disabled={isLoading}
            title="Actualizar registro"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={isLoading ? 'spinning' : ''}
            >
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            <span>Refrescar</span>
          </button>
        </div>

        {/* Filtros: por usuario y tipo de acción */}
        <div className="audit-filters-bar">
          {/* Buscador rápido */}
          <div className="audit-search-input-wrapper">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="audit-search-input"
              placeholder="Buscar por clase, atributo o autor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="audit-clear-search-btn"
                onClick={() => setSearchTerm('')}
              >
                ×
              </button>
            )}
          </div>

          {/* Chips de usuarios */}
          <div className="audit-filter-chips">
            <button
              type="button"
              className={`audit-chip ${selectedUser === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedUser('all')}
            >
              Todos ({historyItems.length})
            </button>
            {uniqueUsers.map((u) => (
              <button
                key={u.name}
                type="button"
                className={`audit-chip ${selectedUser.toLowerCase() === u.name.toLowerCase() ? 'active' : ''}`}
                onClick={() => setSelectedUser(u.name)}
              >
                <span className="chip-avatar-dot" style={{ backgroundColor: u.color }}></span>
                <span>{u.name}</span>
              </button>
            ))}
          </div>

          {/* Selector de tipo de acción */}
          <div className="audit-action-type-select-row">
            <span className="filter-label">Tipo:</span>
            <select
              value={selectedActionType}
              onChange={(e) => setSelectedActionType(e.target.value)}
              className="audit-type-select"
            >
              <option value="all">Todas las acciones</option>
              <option value="clase">Clases / Tablas</option>
              <option value="relacion">Relaciones / Enlaces</option>
              <option value="atributo">Atributos</option>
              <option value="ia">IA Senior</option>
            </select>
          </div>
        </div>

        {/* Lista Timeline de Eventos de Auditoría */}
        <div className="audit-timeline-list">
          {filteredItems.length === 0 ? (
            <div className="audit-empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <p className="empty-txt">No se encontraron cambios con los filtros seleccionados.</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const badge = getActionBadge(item.tipo_accion);
              const dt = formatExactDate(item.created_at);
              const isAi = item.usuario_nombre.toLowerCase().includes('ia');
              const initials = item.usuario_nombre.slice(0, 2).toUpperCase();

              return (
                <div key={item.id} className="audit-timeline-card">
                  {/* Encabezado: Avatar + Nombre + Badge de Acción */}
                  <div className="audit-card-top">
                    <div className="audit-user-profile">
                      <div
                        className="audit-user-avatar"
                        style={{ backgroundColor: item.usuario_color || (isAi ? '#10b981' : '#2563eb') }}
                      >
                        {isAi ? '🤖' : initials}
                      </div>
                      <div className="audit-user-meta">
                        <span className="audit-user-name">
                          {isAi ? 'IA Senior (Arquitecto)' : item.usuario_nombre}
                        </span>
                        <span className="audit-datetime">
                          {dt.date} • {dt.time}
                        </span>
                      </div>
                    </div>
                    <span
                      className="audit-action-badge"
                      style={{
                        backgroundColor: badge.bg,
                        color: badge.color,
                        borderColor: badge.border,
                      }}
                    >
                      {badge.text}
                    </span>
                  </div>

                  {/* Descripción del cambio */}
                  <div className="audit-card-body">
                    <p className="audit-desc-text">{item.descripcion}</p>
                    {item.entidad_afectada && (
                      <div className="audit-affected-entity">
                        <span className="entity-label">Elemento:</span>
                        <span className="entity-chip">{item.entidad_afectada}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
