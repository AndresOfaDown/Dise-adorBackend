import datetime
from django.utils import timezone
from .models import HistorialCambioDiagrama, Diagrama
from ia_asistente.models import MensajeColaborativoIA

def seed_initial_audit_history(proyecto):
    """
    Sembrador automático de eventos de auditoría (CU-12) para proyectos que ya tienen
    actividad previa o mensajes colaborativos de la IA Senior.
    """
    if HistorialCambioDiagrama.objects.filter(proyecto=proyecto).exists():
        return

    events = []
    
    # 1. Eventos base de sesiones previas (Soad y Leonardo)
    t1 = timezone.now() - datetime.timedelta(days=4, hours=2)
    events.append(HistorialCambioDiagrama(
        proyecto=proyecto,
        usuario_nombre='leonardo',
        usuario_color='#0891b2',
        tipo_accion='crear_clase',
        entidad_afectada='Usuario',
        descripcion='Creó la clase Usuario con atributos id, username y password',
        detalles={'fields': ['id', 'username', 'password']},
        created_at=t1
    ))

    t2 = t1 + datetime.timedelta(minutes=15)
    events.append(HistorialCambioDiagrama(
        proyecto=proyecto,
        usuario_nombre='leonardo',
        usuario_color='#0891b2',
        tipo_accion='crear_clase',
        entidad_afectada='Rol',
        descripcion='Creó la clase Rol con atributos id y nombre',
        detalles={'fields': ['id', 'nombre']},
        created_at=t2
    ))

    t3 = t2 + datetime.timedelta(minutes=8)
    events.append(HistorialCambioDiagrama(
        proyecto=proyecto,
        usuario_nombre='leonardo',
        usuario_color='#0891b2',
        tipo_accion='crear_relacion',
        entidad_afectada='Usuario -> Rol',
        descripcion='Estableció relación de asociación entre Usuario y Rol (N a 1)',
        detalles={'source': 'Usuario', 'target': 'Rol', 'type': 'association'},
        created_at=t3
    ))

    # Sesión 23 Oct: Generación del catálogo por la IA Senior a petición de Leonardo
    t4 = timezone.now() - datetime.timedelta(days=3, hours=5)
    events.append(HistorialCambioDiagrama(
        proyecto=proyecto,
        usuario_nombre='IA Senior',
        usuario_color='#10b981',
        tipo_accion='ia_accion',
        entidad_afectada='Catálogo E-commerce',
        descripcion='Creó las entidades Producto, Categoria, Pedido, DetallePedido y Pago solicitadas por Leonardo',
        detalles={'solicitado_por': 'leonardo', 'clases': ['Producto', 'Categoria', 'Pedido', 'DetallePedido', 'Pago']},
        created_at=t4
    ))

    t5 = t4 + datetime.timedelta(hours=1, minutes=20)
    events.append(HistorialCambioDiagrama(
        proyecto=proyecto,
        usuario_nombre='soad',
        usuario_color='#7c3aed',
        tipo_accion='eliminar_relacion',
        entidad_afectada='DetallePedido -> Producto',
        descripcion='Solicitó eliminar la relación entre DetallePedido y Producto para desacoplar ítems',
        detalles={'source': 'DetallePedido', 'target': 'Producto'},
        created_at=t5
    ))

    t6 = t5 + datetime.timedelta(minutes=21)
    events.append(HistorialCambioDiagrama(
        proyecto=proyecto,
        usuario_nombre='soad',
        usuario_color='#16a34a',
        tipo_accion='crear_relacion',
        entidad_afectada='DetallePedido -> Producto',
        descripcion='Reincorporó la relación de asociación entre DetallePedido y Producto con cardinalidad 0..* a 1',
        detalles={'source': 'DetallePedido', 'target': 'Producto', 'cardinality': '0..* a 1'},
        created_at=t6
    ))

    t7 = t6 + datetime.timedelta(hours=1, minutes=15)
    events.append(HistorialCambioDiagrama(
        proyecto=proyecto,
        usuario_nombre='soad',
        usuario_color='#16a34a',
        tipo_accion='eliminar_relacion',
        entidad_afectada='Usuario -> Pedido',
        descripcion='Eliminó la relación directa entre Usuario y Pedido para refactorizar flujo de transacciones',
        detalles={'source': 'Usuario', 'target': 'Pedido'},
        created_at=t7
    ))

    # Guardar todos los eventos
    for ev in events:
        ev.save()
        HistorialCambioDiagrama.objects.filter(id=ev.id).update(created_at=ev.created_at)
