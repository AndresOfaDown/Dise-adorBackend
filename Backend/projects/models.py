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
