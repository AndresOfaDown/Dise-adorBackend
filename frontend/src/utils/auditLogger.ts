import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useDiagramStore } from '../store/diagramStore';

export interface AuditLogPayload {
  tipo_accion:
    | 'crear_clase'
    | 'eliminar_clase'
    | 'modificar_clase'
    | 'crear_relacion'
    | 'eliminar_relacion'
    | 'crear_atributo'
    | 'modificar_atributo'
    | 'crear_metodo'
    | 'eliminar_metodo'
    | 'ia_accion'
    | string;
  entidad_afectada: string;
  descripcion: string;
  detalles?: any;
}

/**
 * Registra de forma asíncrona y no bloqueante un cambio en el diagrama UML (CU-12).
 * El backend lo persiste en HistorialCambioDiagrama y lo difunde a todos los clientes por WebSocket.
 */
export const recordDiagramAudit = async (payload: AuditLogPayload): Promise<void> => {
  try {
    const projectId = useDiagramStore.getState().projectId;
    if (!projectId) return;

    const user = useAuthStore.getState().user;
    const usuario_nombre = user?.username || user?.nombre || user?.email?.split('@')[0] || 'Colaborador';

    // Recuperar color de sesión del colaborador si existe
    const collaborators = useDiagramStore.getState().collaborators;
    const currentUserCollab = collaborators.find((c) => c.username === usuario_nombre);
    const usuario_color = currentUserCollab?.color || '#2563eb';

    await apiClient.post(`/api/projects/${projectId}/historial-cambios/`, {
      usuario_nombre,
      usuario_color,
      tipo_accion: payload.tipo_accion,
      entidad_afectada: payload.entidad_afectada,
      descripcion: payload.descripcion,
      detalles: payload.detalles || {},
    });
  } catch (err) {
    // Registro silencioso para no interrumpir el flujo de modelado del usuario
    console.debug('Error registrando auditoría de cambio:', err);
  }
};
