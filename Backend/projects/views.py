from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from .models import Proyecto, Diagrama
from .serializers import ProyectoSerializer, ProyectoCreateSerializer, DiagramaSerializer

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

