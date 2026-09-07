from django.urls import path
from .views import AnalizarImagenDiagramaAPIView

urlpatterns = [
    path('analizar-imagen/', AnalizarImagenDiagramaAPIView.as_view(), name='analizar_imagen'),
]
