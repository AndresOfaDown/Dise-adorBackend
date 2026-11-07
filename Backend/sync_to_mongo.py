"""
Script de sincronización masiva de datos existentes desde PostgreSQL hacia MongoDB NoSQL.
Pobla las 3 colecciones:
  - diagramas_uml
  - sesiones_ia_colaborativa
  - auditoria_cambios
"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from projects.models import Proyecto, Diagrama, HistorialCambioDiagrama
from ia_asistente.models import MensajeColaborativoIA
from config.mongo_service import (
    get_mongo_db,
    mongo_save_diagram,
    mongo_log_ai_message,
    mongo_log_audit_event,
    mongo_get_stats
)


def run_sync():
    db = get_mongo_db()
    if db is None:
        print("[ERROR] No se pudo conectar a MongoDB. Asegúrate de que el servicio esté corriendo.")
        return

    print("=== INICIANDO SINCRONIZACIÓN POSTGRESQL -> MONGODB NOSQL ===")

    # 1. Sincronizar Diagramas
    print("\n[1/3] Sincronizando diagramas_uml...")
    diagramas_count = 0
    for diagrama in Diagrama.objects.select_related('proyecto').all():
        proyecto = diagrama.proyecto
        success = mongo_save_diagram(
            project_id=proyecto.id,
            package_base=proyecto.package_base,
            nodes=diagrama.nodes or [],
            edges=diagrama.edges or [],
            viewport=diagrama.viewport or {},
            editor_name='Sincronizador Inicial'
        )
        if success:
            diagramas_count += 1
    print(f" -> {diagramas_count} diagramas sincronizados en 'diagramas_uml'.")

    # 2. Sincronizar Mensajes IA Colaborativos
    print("\n[2/3] Sincronizando sesiones_ia_colaborativa...")
    mensajes_count = 0
    # Limpiamos antes para evitar duplicados si se corre varias veces
    db.sesiones_ia_colaborativa.delete_many({})
    for m in MensajeColaborativoIA.objects.all().order_by('created_at'):
        success = mongo_log_ai_message(
            project_id=m.proyecto_id,
            sender_name=m.sender_name,
            sender_color=m.sender_color,
            role=m.role,
            text=m.text,
            actions=m.actions or [],
            provider='ollama/gemini' if m.role == 'assistant' else None
        )
        if success:
            mensajes_count += 1
    print(f" -> {mensajes_count} mensajes sincronizados en 'sesiones_ia_colaborativa'.")

    # 3. Sincronizar Historial de Auditoría
    print("\n[3/3] Sincronizando auditoria_cambios...")
    auditoria_count = 0
    db.auditoria_cambios.delete_many({})
    for c in HistorialCambioDiagrama.objects.all().order_by('created_at'):
        success = mongo_log_audit_event(
            project_id=c.proyecto_id,
            usuario_nombre=c.usuario_nombre,
            usuario_color=c.usuario_color,
            tipo_accion=c.tipo_accion,
            entidad_afectada=c.entidad_afectada,
            descripcion=c.descripcion,
            detalles=c.detalles or {},
            created_at=c.created_at
        )
        if success:
            auditoria_count += 1
    print(f" -> {auditoria_count} registros de auditoría sincronizados en 'auditoria_cambios'.")

    print("\n=== ESTADO FINAL DE MONGODB ===")
    stats = mongo_get_stats()
    print(stats)
    print("\n¡Sincronización completada con éxito!")


if __name__ == '__main__':
    run_sync()
