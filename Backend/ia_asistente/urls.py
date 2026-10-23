from django.urls import path
from .views import AnalizarImagenDiagramaAPIView, AsistenteChatAPIView, HistorialMensajesIAAPIView

urlpatterns = [
    path('analizar-imagen/', AnalizarImagenDiagramaAPIView.as_view(), name='analizar_imagen'),
    path('chat/', AsistenteChatAPIView.as_view(), name='asistente_chat'),
    path('historial/<int:project_id>/', HistorialMensajesIAAPIView.as_view(), name='historial_mensajes_ia'),
]
