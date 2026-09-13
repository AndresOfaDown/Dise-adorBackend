from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from .models import Proyecto, Diagrama
from .serializers import ProyectoSerializer, ProyectoCreateSerializer, DiagramaSerializer
from .uml_service import export_diagram_to_xmi, export_diagram_to_puml, parse_uml_file

class ProyectoListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        proyectos = Proyecto.objects.filter(usuario=request.user).order_by('-last_edited_at')
        serializer = ProyectoSerializer(proyectos, many=True)
        return Response(serializer.data)

    def post(self, request):
        package_base = request.data.get('package_base', '').strip()
        if not package_base:
            package_base = 'com.example.uml'
        
        serializer = ProyectoCreateSerializer(
            data={'package_base': package_base},
            context={'request': request}
        )
        if serializer.is_valid():
            proyecto = serializer.save()
            diagrama = getattr(proyecto, 'diagrama', None)
            return Response({
                'proyecto': ProyectoSerializer(proyecto).data,
                'diagrama': DiagramaSerializer(diagrama).data if diagrama else None
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DiagramaDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id)
        diagrama, _ = Diagrama.objects.get_or_create(
            proyecto=proyecto,
            defaults={'nodes': [], 'edges': [], 'viewport': {'x': 0, 'y': 0, 'zoom': 1}}
        )
        return Response({
            'proyecto': ProyectoSerializer(proyecto).data,
            'diagrama': DiagramaSerializer(diagrama).data
        })

    def put(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id)
        diagrama, _ = Diagrama.objects.get_or_create(proyecto=proyecto)
        
        nodes = request.data.get('nodes', diagrama.nodes)
        edges = request.data.get('edges', diagrama.edges)
        viewport = request.data.get('viewport', diagrama.viewport)

        diagrama.nodes = nodes
        diagrama.edges = edges
        diagrama.viewport = viewport
        diagrama.save()

        # Actualizar fecha de edición del proyecto
        if 'package_base' in request.data:
            proyecto.package_base = request.data['package_base']
        proyecto.save()

        return Response({
            'message': 'Diagrama guardado correctamente',
            'proyecto': ProyectoSerializer(proyecto).data,
            'diagrama': DiagramaSerializer(diagrama).data
        })


class ProyectoDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id)
        return Response(ProyectoSerializer(proyecto).data)

    def put(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id)
        package_base = request.data.get('package_base', '').strip()
        if not package_base:
            return Response({'error': 'El nombre del proyecto no puede estar vacío.'}, status=status.HTTP_400_BAD_REQUEST)
        
        proyecto.package_base = package_base
        proyecto.save()
        return Response(ProyectoSerializer(proyecto).data)

    def patch(self, request, project_id):
        return self.put(request, project_id)

    def delete(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id, usuario=request.user)
        proyecto.delete()
        return Response({'message': 'Proyecto eliminado correctamente.'}, status=status.HTTP_200_OK)


class DiagramaExportXmiAPIView(APIView):
    """
    CU06: Exporta el diagrama en formato XMI 2.1 estándar para Enterprise Architect.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id, usuario=request.user)
        diagrama, _ = Diagrama.objects.get_or_create(proyecto=proyecto)
        xmi_xml = export_diagram_to_xmi(diagrama.nodes, diagrama.edges, proyecto.package_base)

        response = HttpResponse(xmi_xml, content_type='application/xml; charset=utf-8')
        safe_name = (proyecto.package_base or 'diagrama').replace(' ', '_')
        response['Content-Disposition'] = f'attachment; filename="{safe_name}.xmi"'
        return response


class DiagramaExportPumlAPIView(APIView):
    """
    CU06: Exporta el diagrama en formato PlantUML (.puml).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id, usuario=request.user)
        diagrama, _ = Diagrama.objects.get_or_create(proyecto=proyecto)
        puml_text = export_diagram_to_puml(diagrama.nodes, diagrama.edges, proyecto.package_base)

        response = HttpResponse(puml_text, content_type='text/plain; charset=utf-8')
        safe_name = (proyecto.package_base or 'diagrama').replace(' ', '_')
        response['Content-Disposition'] = f'attachment; filename="{safe_name}.puml"'
        return response


class DiagramaImportUmlAPIView(APIView):
    """
    CU06: Importa archivos XMI o PlantUML y retorna las clases y relaciones detectadas.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id, usuario=request.user)
        file_obj = request.FILES.get('file')
        raw_content = request.data.get('content', '')
        filename = ''

        if file_obj:
            raw_content = file_obj.read().decode('utf-8', errors='ignore')
            filename = file_obj.name

        if not raw_content or not raw_content.strip():
            return Response(
                {'error': 'No se proporcionó archivo ni contenido para importar.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            parsed = parse_uml_file(raw_content, filename)
            return Response(parsed, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': f'Error al procesar el archivo UML: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

