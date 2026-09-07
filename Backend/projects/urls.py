from django.urls import path
from .views import ProyectoListCreateAPIView, ProyectoDetailAPIView, DiagramaDetailAPIView

urlpatterns = [
    path('', ProyectoListCreateAPIView.as_view(), name='proyecto_list_create'),
    path('<int:project_id>/', ProyectoDetailAPIView.as_view(), name='proyecto_detail'),
    path('<int:project_id>/diagrama/', DiagramaDetailAPIView.as_view(), name='diagrama_detail'),
]
