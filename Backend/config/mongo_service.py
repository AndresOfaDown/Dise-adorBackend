"""
Servicio centralizado de persistencia NoSQL con MongoDB para UMLSynapse.
Garantiza persistencia dual (PostgreSQL relacional + MongoDB documental).
Colecciones:
  - diagramas_uml: Documentos completos de canvas, nodos, edges y viewport.
  - sesiones_ia_colaborativa: Historial conversacional y acciones generadas por la IA.
  - auditoria_cambios: Registro cronológico no estructurado de auditoría de modificaciones.
"""

from datetime import datetime, timezone
import logging
from pymongo import MongoClient, DESCENDING
from django.conf import settings

logger = logging.getLogger(__name__)

_mongo_client = None
_mongo_db = None


def get_mongo_client():
    global _mongo_client
    if _mongo_client is None:
        try:
            try:
                from django.conf import settings
                host = getattr(settings, 'MONGO_HOST', 'localhost')
                port = getattr(settings, 'MONGO_PORT', 27017)
            except Exception:
                host = 'localhost'
                port = 27017

            _mongo_client = MongoClient(
                host=host,
                port=port,
                serverSelectionTimeoutMS=2500,
                connectTimeoutMS=2500
            )
            # Test ping
            _mongo_client.admin.command('ping')
        except Exception as e:
            logger.warning(f"[MongoDB] No se pudo conectar a MongoDB ({e}). Continuando con fallback relacional.")
            return None
    return _mongo_client


def get_mongo_db():
    global _mongo_db
    if _mongo_db is None:
        client = get_mongo_client()
        if client is not None:
            try:
                from django.conf import settings
                db_name = getattr(settings, 'MONGO_DB_NAME', 'diagramas_uml_nosql')
            except Exception:
                db_name = 'diagramas_uml_nosql'
            _mongo_db = client[db_name]
            _ensure_indexes(_mongo_db)
    return _mongo_db


def _ensure_indexes(db):
    try:
        db.diagramas_uml.create_index([("project_id", 1)], unique=True)
        db.sesiones_ia_colaborativa.create_index([("project_id", 1), ("created_at", -1)])
        db.auditoria_cambios.create_index([("project_id", 1), ("created_at", -1)])
    except Exception as e:
        logger.warning(f"[MongoDB] Error creando índices: {e}")


# =====================================================================
# 1. Colección: diagramas_uml
# =====================================================================
def mongo_save_diagram(project_id, package_base=None, nodes=None, edges=None, viewport=None, editor_name='Sistema'):
    """
    Guarda o actualiza el documento JSON completo del diagrama en MongoDB.
    """
    db = get_mongo_db()
    if db is None:
        return False
    try:
        now = datetime.now(timezone.utc)
        doc = {
            "$set": {
                "project_id": int(project_id),
                "updated_at": now,
                "last_editor": editor_name,
            },
            "$inc": {"version": 1},
            "$setOnInsert": {
                "created_at": now,
            }
        }
        if package_base is not None:
            doc["$set"]["package_base"] = str(package_base)
        if nodes is not None:
            doc["$set"]["nodes"] = list(nodes)
        if edges is not None:
            doc["$set"]["edges"] = list(edges)
        if viewport is not None:
            doc["$set"]["viewport"] = dict(viewport)

        db.diagramas_uml.update_one(
            {"project_id": int(project_id)},
            doc,
            upsert=True
        )
        return True
    except Exception as e:
        logger.error(f"[MongoDB] Error guardando diagrama {project_id}: {e}")
        return False


def mongo_get_diagram(project_id):
    """
    Recupera el documento del diagrama desde MongoDB.
    """
    db = get_mongo_db()
    if db is None:
        return None
    try:
        doc = db.diagramas_uml.find_one({"project_id": int(project_id)}, {"_id": 0})
        return doc
    except Exception as e:
        logger.error(f"[MongoDB] Error obteniendo diagrama {project_id}: {e}")
        return None


# =====================================================================
# 2. Colección: sesiones_ia_colaborativa
# =====================================================================
def mongo_log_ai_message(project_id, sender_name, sender_color, role, text, actions=None, provider=None, reply_to_user=None):
    """
    Inserta un mensaje de la sala colaborativa / IA en MongoDB.
    """
    db = get_mongo_db()
    if db is None:
        return False
    try:
        now = datetime.now(timezone.utc)
        record = {
            "project_id": int(project_id),
            "sender_name": sender_name,
            "sender_color": sender_color or "#2563eb",
            "role": role,
            "text": text,
            "reply_to_user": reply_to_user,
            "actions": actions or [],
            "provider": provider,
            "created_at": now,
            "timestamp_iso": now.isoformat()
        }
        db.sesiones_ia_colaborativa.insert_one(record)
        return True
    except Exception as e:
        logger.error(f"[MongoDB] Error guardando mensaje IA {project_id}: {e}")
        return False


def mongo_get_ai_history(project_id, limit=300):
    """
    Obtiene los últimos mensajes colaborativos de MongoDB.
    """
    db = get_mongo_db()
    if db is None:
        return []
    try:
        cursor = db.sesiones_ia_colaborativa.find(
            {"project_id": int(project_id)},
            {"_id": 0}
        ).sort("created_at", DESCENDING).limit(limit)
        results = list(cursor)
        results.reverse()
        return results
    except Exception as e:
        logger.error(f"[MongoDB] Error consultando mensajes IA {project_id}: {e}")
        return []


# =====================================================================
# 3. Colección: auditoria_cambios
# =====================================================================
def mongo_log_audit_event(project_id, usuario_nombre, usuario_color, tipo_accion, entidad_afectada, descripcion, detalles=None, created_at=None):
    """
    Registra un evento de auditoría en la colección NoSQL.
    """
    db = get_mongo_db()
    if db is None:
        return False
    try:
        ts = created_at if created_at is not None else datetime.now(timezone.utc)
        record = {
            "project_id": int(project_id),
            "usuario_nombre": usuario_nombre,
            "usuario_color": usuario_color or "#2563eb",
            "tipo_accion": tipo_accion,
            "entidad_afectada": entidad_afectada or "",
            "descripcion": descripcion,
            "detalles": detalles or {},
            "created_at": ts,
            "timestamp_iso": ts.isoformat() if hasattr(ts, 'isoformat') else str(ts)
        }
        db.auditoria_cambios.insert_one(record)
        return True
    except Exception as e:
        logger.error(f"[MongoDB] Error guardando auditoría {project_id}: {e}")
        return False


def mongo_get_audit_events(project_id, limit=100):
    """
    Recupera los eventos de auditoría desde MongoDB.
    """
    db = get_mongo_db()
    if db is None:
        return []
    try:
        cursor = db.auditoria_cambios.find(
            {"project_id": int(project_id)},
            {"_id": 0}
        ).sort("created_at", DESCENDING).limit(limit)
        return list(cursor)
    except Exception as e:
        logger.error(f"[MongoDB] Error obteniendo auditoría {project_id}: {e}")
        return []


# =====================================================================
# Estadísticas y Diagnóstico NoSQL (útil para mostrar al docente)
# =====================================================================
def mongo_get_stats():
    """
    Devuelve métricas en vivo de la BD MongoDB para verificar persistencia.
    """
    db = get_mongo_db()
    if db is None:
        return {"status": "disconnected", "database": None}
    try:
        return {
            "status": "connected",
            "database": db.name,
            "collections": {
                "diagramas_uml": db.diagramas_uml.count_documents({}),
                "sesiones_ia_colaborativa": db.sesiones_ia_colaborativa.count_documents({}),
                "auditoria_cambios": db.auditoria_cambios.count_documents({})
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
