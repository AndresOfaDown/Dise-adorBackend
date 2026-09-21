from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from .models import Proyecto, Diagrama
from .serializers import ProyectoSerializer, ProyectoCreateSerializer, DiagramaSerializer
from .uml_service import export_diagram_to_xmi, export_diagram_to_puml, parse_uml_file

from django.db.models import Q
from django.contrib.auth import get_user_model

User = get_user_model()

class ProyectoListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        proyectos = Proyecto.objects.filter(
            Q(usuario=request.user) | Q(colaboradores=request.user)
        ).distinct().order_by('-last_edited_at')
        serializer = ProyectoSerializer(proyectos, many=True, context={'request': request})
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
                'proyecto': ProyectoSerializer(proyecto, context={'request': request}).data,
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
        proyecto = get_object_or_404(
            Proyecto.objects.filter(Q(usuario=request.user) | Q(colaboradores=request.user)).distinct(),
            id=project_id
        )
        return Response(ProyectoSerializer(proyecto, context={'request': request}).data)

    def put(self, request, project_id):
        proyecto = get_object_or_404(
            Proyecto.objects.filter(Q(usuario=request.user) | Q(colaboradores=request.user)).distinct(),
            id=project_id
        )
        package_base = request.data.get('package_base', '').strip()
        if not package_base:
            return Response({'error': 'El nombre del proyecto no puede estar vacío.'}, status=status.HTTP_400_BAD_REQUEST)
        
        proyecto.package_base = package_base
        proyecto.save()
        return Response(ProyectoSerializer(proyecto, context={'request': request}).data)

    def patch(self, request, project_id):
        return self.put(request, project_id)

    def delete(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id, usuario=request.user)
        proyecto.delete()
        return Response({'message': 'Proyecto eliminado correctamente.'}, status=status.HTTP_200_OK)


class ProyectoColaboradorAPIView(APIView):
    """
    Gestiona colaboradores de un proyecto:
    - GET: Lista los colaboradores actuales.
    - POST: Invita/agrega un colaborador por username o email.
    - DELETE: Remueve un colaborador del proyecto.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        proyecto = get_object_or_404(
            Proyecto.objects.filter(Q(usuario=request.user) | Q(colaboradores=request.user)).distinct(),
            id=project_id
        )
        colaboradores = [
            {'id': c.id, 'username': c.username, 'email': c.email}
            for c in proyecto.colaboradores.all()
        ]
        return Response({
            'project_id': proyecto.id,
            'owner': {'id': proyecto.usuario.id, 'username': proyecto.usuario.username},
            'colaboradores': colaboradores
        })

    def post(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id)
        # Solo el dueño o colaboradores existentes pueden invitar
        if proyecto.usuario_id != request.user.id and not proyecto.colaboradores.filter(id=request.user.id).exists():
            return Response({'error': 'No tienes permisos para invitar a este proyecto.'}, status=status.HTTP_403_FORBIDDEN)

        identifier = request.data.get('identifier', '').strip()
        if not identifier:
            return Response({'error': 'Debes ingresar un nombre de usuario o correo electrónico.'}, status=status.HTTP_400_BAD_REQUEST)

        target_user = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
        if not target_user:
            return Response({'error': f'No se encontró ningún usuario con "{identifier}". Asegúrate de que esté registrado.'}, status=status.HTTP_404_NOT_FOUND)

        if target_user.id == proyecto.usuario_id:
            return Response({'message': 'Este usuario es el propietario del proyecto.'}, status=status.HTTP_200_OK)

        if proyecto.colaboradores.filter(id=target_user.id).exists():
            return Response({'message': f'{target_user.username} ya es colaborador del proyecto.'}, status=status.HTTP_200_OK)

        proyecto.colaboradores.add(target_user)

        return Response({
            'message': f'¡{target_user.username} ha sido añadido como colaborador exitosamente!',
            'colaborador': {'id': target_user.id, 'username': target_user.username, 'email': target_user.email},
            'colaboradores': [
                {'id': c.id, 'username': c.username, 'email': c.email}
                for c in proyecto.colaboradores.all()
            ]
        }, status=status.HTTP_201_CREATED)

    def delete(self, request, project_id):
        proyecto = get_object_or_404(Proyecto, id=project_id, usuario=request.user)
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'Falta especificar user_id.'}, status=status.HTTP_400_BAD_REQUEST)
        
        target_user = User.objects.filter(id=user_id).first()
        if target_user:
            proyecto.colaboradores.remove(target_user)
        return Response({'message': 'Colaborador removido.'}, status=status.HTTP_200_OK)


class ProyectoJoinAPIView(APIView):
    """
    Permite a un usuario unirse a un proyecto mediante su Código / ID.
    Al unirse, se agrega automáticamente a la lista de colaboradores del proyecto.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = request.data.get('code', '').strip()
        if not code:
            return Response({'error': 'Ingresa el código o ID del proyecto.'}, status=status.HTTP_400_BAD_REQUEST)

        # Limpiar si ingresaron "PROJ-3", "#3" o "3"
        clean_id = code.upper().replace('PROJ-', '').replace('PROJ_', '').replace('#', '').strip()
        try:
            p_id = int(clean_id)
        except ValueError:
            return Response({'error': 'Formato de código inválido. Debe ser un número o PROJ-ID.'}, status=status.HTTP_400_BAD_REQUEST)

        proyecto = Proyecto.objects.filter(id=p_id).first()
        if not proyecto:
            return Response({'error': f'No se encontró ningún proyecto con el ID #{p_id}.'}, status=status.HTTP_404_NOT_FOUND)

        # Si el usuario no es el dueño ni está en colaboradores, agregarlo
        if proyecto.usuario_id != request.user.id and not proyecto.colaboradores.filter(id=request.user.id).exists():
            proyecto.colaboradores.add(request.user)

        diagrama, _ = Diagrama.objects.get_or_create(
            proyecto=proyecto,
            defaults={'nodes': [], 'edges': [], 'viewport': {'x': 0, 'y': 0, 'zoom': 1}}
        )

        return Response({
            'message': f'¡Te has unido exitosamente a "{proyecto.package_base}"!',
            'proyecto': ProyectoSerializer(proyecto, context={'request': request}).data,
            'diagrama': DiagramaSerializer(diagrama).data
        }, status=status.HTTP_200_OK)


class DiagramaExportXmiAPIView(APIView):
    """
    CU06: Exporta el diagrama en formato XMI 2.1 estándar para Enterprise Architect.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        proyecto = get_object_or_404(
            Proyecto.objects.filter(Q(usuario=request.user) | Q(colaboradores=request.user)).distinct(),
            id=project_id
        )
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
        proyecto = get_object_or_404(
            Proyecto.objects.filter(Q(usuario=request.user) | Q(colaboradores=request.user)).distinct(),
            id=project_id
        )
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
        proyecto = get_object_or_404(
            Proyecto.objects.filter(Q(usuario=request.user) | Q(colaboradores=request.user)).distinct(),
            id=project_id
        )
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

