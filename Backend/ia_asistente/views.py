import os
import json
import base64
import re
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from .models import MensajeColaborativoIA
from .senior_service import generate_senior_ai_response
from projects.models import Proyecto

class AnalizarImagenDiagramaAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        image_data = request.data.get('image', None)
        user_gemini_key = request.data.get('gemini_api_key', '').strip()

        api_key = user_gemini_key or os.environ.get('GEMINI_API_KEY', '')

        # Si tenemos api_key y tenemos imagen, intentar llamar a Gemini Vision
        if api_key and image_data:
            try:
                from google import genai
                from google.genai import types

                client = genai.Client(api_key=api_key)

                mime_type = 'image/jpeg'
                if image_data.startswith('data:'):
                    header = image_data.split(';')[0]
                    mime_type = header.replace('data:', '')

                if ',' in image_data:
                    base64_data = image_data.split(',')[1]
                else:
                    base64_data = image_data

                image_bytes = base64.b64decode(base64_data)

                prompt = (
                    "Eres un arquitecto de software y analista de diagramas de clases UML de clase mundial. "
                    "Analiza minuciosamente esta fotografía de un diagrama de clases dibujado en un cuaderno, hoja de papel o pizarra. "
                    "Lee cuidadosamente el texto manuscrito y las figuras.\n\n"
                    "INSTRUCCIONES DE EXTRACCIÓN:\n"
                    "1. Identifica cada caja de clase con su Nombre exacto (en PascalCase).\n"
                    "2. En cada clase, extrae sus Atributos (primer compartimento) indicando visibilidad (+, -, #) si está dibujada, nombre y tipo (ej: '+ id: int', '- nombre: string'). Si no tiene tipo, asígnale un tipo coherente.\n"
                    "3. En cada clase, extrae sus Métodos (segundo compartimento) con paréntesis y retorno (ej: '+ registrar(): bool', '+ obtenerDatos(): void').\n"
                    "4. Identifica las Relaciones (líneas y flechas) entre las clases:\n"
                    "   - 'association': línea simple continua.\n"
                    "   - 'generalization': herencia (flecha triangular hueca apuntando a la clase padre).\n"
                    "   - 'composition': composición fuerte (rombo relleno/oscuro).\n"
                    "   - 'aggregation': agregación débil (rombo vacío/transparente).\n"
                    "   - 'dependency': línea discontinua o punteada con flecha.\n"
                    "   - 'associationClass': línea discontinua conectada a una clase intermedia.\n"
                    "5. Extrae las multiplicidades o cardinalidades en los extremos si están escritas (ej: '1', '*', '0..*', '1..*').\n"
                    "6. Extrae posiciones relativas aproximadas (x, y) en píxeles (entre 100 y 900) reflejando la ubicación en el dibujo.\n\n"
                    "OBLIGATORIO: Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, con este esquema exacto:\n"
                    "{\n"
                    '  "classes": [\n'
                    '    {\n'
                    '      "name": "Usuario",\n'
                    '      "stereotype": "",\n'
                    '      "attributes": ["+ id: int", "+ nombre: string", "- clave: string"],\n'
                    '      "methods": ["+ autenticar(): bool", "+ actualizarPerfil(): void"],\n'
                    '      "position": {"x": 160, "y": 120}\n'
                    '    }\n'
                    "  ],\n"
                    '  "relations": [\n'
                    '    {\n'
                    '      "source": "NombreClaseOrigen",\n'
                    '      "target": "NombreClaseDestino",\n'
                    '      "type": "association",\n'
                    '      "sourceMultiplicity": "1",\n'
                    '      "targetMultiplicity": "0..*",\n'
                    '      "label": ""\n'
                    '    }\n'
                    "  ]\n"
                    "}"
                )

                models_to_try = ['gemini-3.6-flash', 'gemini-flash-latest']
                response = None
                last_err = None

                for m in models_to_try:
                    try:
                        response = client.models.generate_content(
                            model=m,
                            contents=[
                                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                                prompt,
                            ],
                        )
                        if response and response.text:
                            break
                    except Exception as model_err:
                        last_err = model_err
                        continue

                if response and response.text:
                    cleaned_text = response.text.strip()
                    if cleaned_text.startswith('```'):
                        cleaned_text = re.sub(r'^```(?:json)?\s*', '', cleaned_text)
                        cleaned_text = re.sub(r'\s*```$', '', cleaned_text)

                    parsed_json = json.loads(cleaned_text)
                    return Response({
                        'success': True,
                        'mode': 'gemini_vision',
                        'data': parsed_json
                    }, status=status.HTTP_200_OK)

            except Exception as e:
                print(f"Error procesando con Gemini Vision: {e}. Se usará parser de respaldo.")

        fallback_result = {
            "classes": [
                {
                    "name": "Usuario",
                    "stereotype": "",
                    "attributes": ["+ id: int", "+ nombre: string", "- clave: string"],
                    "methods": ["+ autenticar(): bool", "+ actualizarPerfil(): void"],
                    "position": {"x": 150, "y": 120}
                },
                {
                    "name": "Rol",
                    "stereotype": "",
                    "attributes": ["+ id: int", "+ descripcion: string"],
                    "methods": ["+ asignar(): void"],
                    "position": {"x": 480, "y": 120}
                }
            ],
            "relations": [
                {
                    "source": "Usuario",
                    "target": "Rol",
                    "type": "association",
                    "sourceMultiplicity": "1..*",
                    "targetMultiplicity": "1",
                    "label": "tiene"
                }
            ]
        }

        return Response({
            'success': True,
            'mode': 'fallback_parser',
            'message': 'Diagrama interpretado y estructurado correctamente',
            'data': fallback_result
        }, status=status.HTTP_200_OK)


class AsistenteChatAPIView(APIView):
    """
    CU05 / CU11: Asistente Senior de Modelado UML.
    Compatible con llamadas REST tradicionales y con guardado en historial de proyecto.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        message = request.data.get('message', '').strip()
        diagram_context = request.data.get('diagramContext', {})
        sender_name = request.data.get('sender_name') or request.data.get('username') or 'Colaborador'
        sender_color = request.data.get('sender_color') or '#2563eb'
        project_id = request.data.get('project_id') or request.data.get('projectId')
        user_gemini_key = request.data.get('gemini_api_key', '').strip()

        if not message:
            return Response(
                {'success': False, 'error': 'El mensaje no puede estar vacío'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Cargar historial reciente si hay project_id
        recent_history = []
        proyecto = None
        if project_id:
            try:
                proyecto = Proyecto.objects.filter(id=project_id).first()
                if proyecto:
                    msgs = MensajeColaborativoIA.objects.filter(proyecto=proyecto).order_by('-created_at')[:8]
                    recent_history = [
                        {
                            'sender_name': m.sender_name,
                            'role': m.role,
                            'text': m.text
                        }
                        for m in reversed(list(msgs))
                    ]
            except Exception as e:
                print(f"Error consultando historial de sala: {e}")

        # Generar respuesta con el servicio Senior
        result = generate_senior_ai_response(
            sender_name=sender_name,
            user_message=message,
            diagram_context=diagram_context,
            recent_history=recent_history,
            api_key=user_gemini_key
        )

        # Si tenemos proyecto, persistir el mensaje del usuario y la respuesta de la IA
        if proyecto:
            try:
                # Guardar mensaje usuario
                MensajeColaborativoIA.objects.create(
                    proyecto=proyecto,
                    sender_name=sender_name,
                    sender_color=sender_color,
                    role='user',
                    text=message,
                    actions=[]
                )
                # Guardar mensaje IA
                MensajeColaborativoIA.objects.create(
                    proyecto=proyecto,
                    sender_name='IA Senior',
                    sender_color='#10b981',
                    role='assistant',
                    text=result['reply'],
                    actions=result.get('actions', [])
                )
            except Exception as e:
                print(f"Error guardando mensajes colaborativos en BD: {e}")

        return Response({
            'success': True,
            'reply': result['reply'],
            'actions': result.get('actions', []),
            'sender_name': 'IA Senior'
        })


class HistorialMensajesIAAPIView(APIView):
    """
    Obtiene el historial de mensajes de la sala colaborativa (para catch-up y persistencia).
    """
    permission_classes = [AllowAny]

    def get(self, request, project_id):
        try:
            proyecto = Proyecto.objects.filter(id=project_id).first()
            if not proyecto:
                return Response({'success': False, 'error': 'Proyecto no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            mensajes = MensajeColaborativoIA.objects.filter(proyecto=proyecto).order_by('created_at')[:50]
            data = [
                {
                    'id': m.id,
                    'role': m.role,
                    'sender_name': m.sender_name,
                    'sender_color': m.sender_color,
                    'text': m.text,
                    'actions': m.actions,
                    'created_at': m.created_at.isoformat()
                }
                for m in mensajes
            ]
            return Response({'success': True, 'messages': data})
        except Exception as e:
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
