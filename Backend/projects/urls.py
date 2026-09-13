from django.urls import path
from .views import (
    ProyectoListCreateAPIView,
    ProyectoDetailAPIView,
    DiagramaDetailAPIView,
    DiagramaExportXmiAPIView,
    DiagramaExportPumlAPIView,
    DiagramaImportUmlAPIView,
)

urlpatterns = [
    path('', ProyectoListCreateAPIView.as_view(), name='proyecto_list_create'),
    path('<int:project_id>/', ProyectoDetailAPIView.as_view(), name='proyecto_detail'),
    path('<int:project_id>/diagrama/', DiagramaDetailAPIView.as_view(), name='diagrama_detail'),
    path('<int:project_id>/export-xmi/', DiagramaExportXmiAPIView.as_view(), name='diagrama_export_xmi'),
    path('<int:project_id>/export-puml/', DiagramaExportPumlAPIView.as_view(), name='diagrama_export_puml'),
    path('<int:project_id>/import-uml/', DiagramaImportUmlAPIView.as_view(), name='diagrama_import_uml'),
]

