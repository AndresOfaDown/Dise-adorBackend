from django.db import models
from django.conf import settings

class Proyecto(models.Model):
    package_base = models.CharField(max_length=255, help_text='Ej: com.example.salud')
    create_at = models.DateTimeField(auto_now_add=True)
    update_at = models.DateTimeField(auto_now=True)
    last_edited_at = models.DateTimeField(auto_now=True)

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='proyectos'
    )
    colaboradores = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='proyectos_colaborando',
        blank=True
    )

    class Meta:
        db_table = 'proyecto'

    def __str__(self):
        return self.package_base


class Diagrama(models.Model):
    nodes = models.JSONField(default=list, help_text='Entidades UML en formato React Flow')
    edges = models.JSONField(default=list, help_text='Relaciones entre entidades en formato React Flow')
    viewport = models.JSONField(default=dict, help_text='Posicion y zoom del canvas')

    proyecto = models.OneToOneField(
        Proyecto,
        on_delete=models.CASCADE,
        related_name='diagrama'
    )

    class Meta:
        db_table = 'diagrama'

    def __str__(self):
        return f'Diagrama de {self.proyecto.package_base}'


class HistorialCambioDiagrama(models.Model):
    ACCION_CHOICES = [
        ('crear_clase', 'Crear Clase'),
        ('modificar_clase', 'Modificar Clase'),
        ('eliminar_clase', 'Eliminar Clase'),
        ('crear_atributo', 'Añadir Atributo'),
        ('modificar_atributo', 'Modificar Atributo'),
        ('eliminar_atributo', 'Eliminar Atributo'),
        ('crear_metodo', 'Añadir Método'),
        ('eliminar_metodo', 'Eliminar Método'),
        ('crear_relacion', 'Crear Relación'),
        ('eliminar_relacion', 'Eliminar Relación'),
        ('ia_accion', 'Acción Asistente IA'),
    ]

    proyecto = models.ForeignKey(
        Proyecto,
        on_delete=models.CASCADE,
        related_name='historial_cambios'
    )
    usuario_nombre = models.CharField(max_length=150, default='Colaborador')
    usuario_color = models.CharField(max_length=30, default='#2563eb')
    tipo_accion = models.CharField(max_length=50, choices=ACCION_CHOICES, default='modificar_clase')
    entidad_afectada = models.CharField(max_length=200, blank=True, help_text='Nombre de clase o relación')
    descripcion = models.TextField(help_text='Detalle legible del cambio realizado')
    detalles = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'historial_cambio_diagrama'
        ordering = ['-created_at']

    def __str__(self):
        return f'[{self.created_at.strftime("%Y-%m-%d %H:%M")}] {self.usuario_nombre}: {self.descripcion}'

