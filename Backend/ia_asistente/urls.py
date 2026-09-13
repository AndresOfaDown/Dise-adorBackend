from django.urls import path
from .views import AnalizarImagenDiagramaAPIView, AsistenteChatAPIView

urlpatterns = [
    path('analizar-imagen/', AnalizarImagenDiagramaAPIView.as_view(), name='analizar_imagen'),
    path('chat/', AsistenteChatAPIView.as_view(), name='asistente_chat'),
]

