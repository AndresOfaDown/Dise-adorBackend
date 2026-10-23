from django.db import models
from django.conf import settings
from projects.models import Proyecto

class MensajeColaborativoIA(models.Model):
    """
    Registra el historial de conversación en sala con la IA Senior (CU-11 y CU-12).
    """
    proyecto = models.ForeignKey(
        Proyecto,
        on_delete=models.CASCADE,
        related_name='mensajes_ia'
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mensajes_ia_enviados'
    )
    sender_name = models.CharField(max_length=150, help_text="Nombre visible de quien envió el mensaje")
    sender_color = models.CharField(max_length=50, blank=True, default="#2563eb")
    role = models.CharField(
        max_length=20,
        choices=[('user', 'Usuario'), ('assistant', 'IA Senior')],
        default='user'
    )
    text = models.TextField(help_text="Texto del mensaje")
    actions = models.JSONField(
        default=list,
        blank=True,
        help_text="Acciones ejecutadas en el canvas por la IA"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mensaje_colaborativo_ia'
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.proyecto_id}] {self.sender_name} ({self.role}): {self.text[:30]}"
