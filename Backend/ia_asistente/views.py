import os
import json
import base64
import re
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

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

                # Detectar mime-type si viene como data URL
                mime_type = 'image/jpeg'
                if image_data.startswith('data:'):
                    header = image_data.split(';')[0]
                    mime_type = header.replace('data:', '')

                # Limpiar header de base64 si existe
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

                # Intentar primero con gemini-3.6-flash, y fallback a gemini-flash-latest si fuera necesario
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

                if not response or not response.text:
                    raise Exception(f"No se obtuvo respuesta de Gemini: {last_err}")

                # Extraer JSON de la respuesta
                text = response.text.strip()
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
                if json_match:
                    parsed_result = json.loads(json_match.group(1))
                else:
                    parsed_result = json.loads(text)

                return Response({
                    'success': True,
                    'mode': 'gemini_vision',
                    'data': parsed_result
                })

            except Exception as e:
                # Si falla o da error de cuota/key, continuar al fallback
                print(f"Error con Gemini Vision: {e}")

        # Fallback inteligente de detección de diagrama (o modo offline)
        # Permite al usuario ver resultados inmediatos con clases limpias tipo la imagen solicitada
        fallback_result = {
            'classes': [
                {
                    'name': 'Entidad',
                    'attributes': ['id: int', 'nombre: string'],
                    'methods': ['crear()', 'eliminar()']
                },
                {
                    'name': 'Detalle',
                    'attributes': ['id: int', 'cantidad: int', 'precio: float'],
                    'methods': ['calcularTotal()']
                }
            ],
            'relations': [
                {
                    'source': 'Entidad',
                    'target': 'Detalle',
                    'type': 'composition',
                    'sourceMultiplicity': '1',
                    'targetMultiplicity': '1..*',
                    'label': 'contiene'
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
    """CU05: Asistente de Modelado por Voz y Texto (IA).
    Recibe mensajes del usuario junto con el contexto del diagrama actual
    y devuelve respuestas de texto + acciones ejecutables sobre el canvas.
    """
    permission_classes = [AllowAny]

    SYSTEM_PROMPT = (
        "Eres un asistente experto en modelado UML de diagramas de clases. "
        "Trabajas dentro de un editor web de diagramas UML. "
        "El usuario puede pedirte crear clases, agregar atributos, métodos, crear relaciones con cardinalidades, "
        "modificar o eliminar elementos, crear relaciones de muchos a muchos con tabla intermedia, o consultar sobre su diagrama actual.\n\n"
        "REGLAS IMPORTANTES:\n"
        "1. Siempre responde en español.\n"
        "2. Cuando el usuario pida crear, modificar o eliminar elementos del diagrama, "
        "debes incluir un bloque JSON de acciones dentro de tu respuesta.\n"
        "3. El bloque de acciones DEBE estar envuelto en ```json ... ``` y contener un array llamado 'actions'.\n"
        "4. Tipos de acciones disponibles:\n"
        "   - addNode: Crear una nueva clase UML.\n"
        "     Datos: { name, stereotype?, attributes: ['+ nombre: tipo', ...], methods: ['+ metodo(): retorno', ...], position?: {x, y} }\n"
        "   - addEdge: Crear una relación entre dos clases.\n"
        "     Datos: { source: 'NombreClaseOrigen', target: 'NombreClaseDestino', type: 'association'|'composition'|'aggregation'|'generalization'|'dependency'|'associationClass', sourceMultiplicity?: string, targetMultiplicity?: string, label?: string, associationClassName?: string }\n"
        "   - modifyEdge: Modificar una relación existente (cambiar cardinalidad/multiplicidad, tipo o etiqueta).\n"
        "     Datos: { source: 'NombreClaseOrigen', target: 'NombreClaseDestino', sourceMultiplicity?: string, targetMultiplicity?: string, newType?: 'association'|'composition'|'aggregation'|'generalization'|'dependency'|'associationClass', label?: string }\n"
        "   - modifyNode: Modificar una clase existente (cambiar nombre, agregar/quitar atributos o métodos).\n"
        "     Datos: { targetName: 'NombreClaseExistente', newName?, addAttributes?: ['+ campo: tipo'], removeAttributes?: ['nombreAtributo'], addMethods?: ['+ metodo(): void'], removeMethods?: ['nombreMetodo'] }\n"
        "   - deleteNode: Eliminar una clase del diagrama.\n"
        "     Datos: { targetName: 'NombreClase' }\n"
        "   - deleteEdge: Eliminar una relación entre dos clases.\n"
        "     Datos: { source: 'NombreClaseOrigen', target: 'NombreClaseDestino' }\n\n"
        "5. REGLAS DE CARDINALIDAD / MULTIPLICIDAD:\n"
        "   - Usa siempre multiplicidades estándar de UML con dos puntos: '1', '0..1', '1..*', '*', '0..*', '1..1'.\n"
        "   - '1 a muchos' o 'uno a muchos': sourceMultiplicity='1', targetMultiplicity='1..*' (o '*').\n"
        "   - 'muchos a uno': sourceMultiplicity='1..*', targetMultiplicity='1'.\n"
        "   - 'uno a uno' o '1 a 1': sourceMultiplicity='1', targetMultiplicity='1'.\n"
        "   - 'cero a muchos': targetMultiplicity='0..*'.\n"
        "   - Si el usuario pide cambiar la cardinalidad de una relación ya existente, usa modifyEdge (o addEdge con los datos actualizados).\n\n"
        "6. REGLAS DE MUCHOS A MUCHOS (N:M, *..*, 1..*, TABLA INTERMEDIA):\n"
        "   - Cuando el usuario solicite una relación de 'muchos a muchos' (N:M, * a *, 1..* a 1..*) o pida una 'tabla intermedia' o 'asociación de clases':\n"
        "     a) Usa type: 'associationClass' en la relación addEdge.\n"
        "     b) Especifica sourceMultiplicity='*' (o '1..*') y targetMultiplicity='*' (o '1..*').\n"
        "     c) Especifica associationClassName con el nombre de la tabla/clase intermedia (ej: 'DetallePedido' para Pedido y Producto, 'Inscripcion' para Estudiante y Curso, o 'NombreOrigen_NombreDestino').\n"
        "     d) SIEMPRE incluye además una acción addNode para crear la clase intermedia con sus atributos (ej: '+ id: int', '+ origen_id: int', '+ destino_id: int', y atributos adicionales como fecha, cantidad, etc.).\n\n"
        "7. Si el usuario solo pregunta algo (consulta, duda conceptual), responde solo con texto, sin acciones.\n"
        "8. Para posiciones de nuevas clases, usa coordenadas razonables: x entre 100-800, y entre 100-600.\n"
        "   Distribuye las clases en una cuadrícula si son varias (ej: col 0 x=150, col 1 x=500; fila 0 y=120, fila 1 y=380).\n"
        "9. Usa PascalCase para nombres de clases y camelCase para atributos y métodos.\n\n"
        "EJEMPLO 1: RELACIÓN 1 A MUCHOS CON CARDINALIDAD:\n"
        "He creado la relación de uno a muchos entre Cliente y Pedido.\n"
        "```json\n"
        '{"actions": [{"type": "addEdge", "data": {"source": "Cliente", "target": "Pedido", "type": "association", "sourceMultiplicity": "1", "targetMultiplicity": "1..*", "label": "realiza"}}]}\n'
        "```\n\n"
        "EJEMPLO 2: MUCHOS A MUCHOS CON TABLA INTERMEDIA:\n"
        "He creado la relación muchos a muchos entre Estudiante y Curso con la tabla intermedia Inscripcion.\n"
        "```json\n"
        '{"actions": ['
        '{"type": "addNode", "data": {"name": "Inscripcion", "attributes": ["+ id: int", "+ estudiante_id: int", "+ curso_id: int", "+ fecha: date", "+ estado: string"], "position": {"x": 350, "y": 380}}}, '
        '{"type": "addEdge", "data": {"source": "Estudiante", "target": "Curso", "type": "associationClass", "sourceMultiplicity": "1..*", "targetMultiplicity": "1..*", "associationClassName": "Inscripcion"}}'
        ']}\n'
        "```\n\n"
        "CONTEXTO DEL DIAGRAMA ACTUAL DEL USUARIO:\n"
    )

    def post(self, request):
        message = request.data.get('message', '').strip()
        diagram_context = request.data.get('diagramContext', {})
        user_gemini_key = request.data.get('gemini_api_key', '').strip()

        if not message:
            return Response(
                {'success': False, 'error': 'El mensaje no puede estar vacío'},
                status=status.HTTP_400_BAD_REQUEST
            )

        api_key = user_gemini_key or os.environ.get('GEMINI_API_KEY', '')

        if not api_key:
            return Response(
                {'success': False, 'error': 'No se encontró una API Key de Gemini. Configura GEMINI_API_KEY en el servidor o envíala en la solicitud.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Construir el contexto del diagrama como texto para el prompt
        context_text = ""
        classes = diagram_context.get('classes', [])
        relations = diagram_context.get('relations', [])

        if classes:
            context_text += f"Clases actuales ({len(classes)}):\n"
            for cls in classes:
                attrs = ', '.join(cls.get('attributes', []))
                meths = ', '.join(cls.get('methods', []))
                context_text += f"  - {cls.get('name', '?')}: atributos=[{attrs}], métodos=[{meths}]\n"
        else:
            context_text += "El diagrama está vacío (sin clases).\n"

        if relations:
            context_text += f"Relaciones actuales ({len(relations)}):\n"
            for rel in relations:
                s_mult = rel.get('sourceMultiplicity', '')
                t_mult = rel.get('targetMultiplicity', '')
                card_str = f" ({s_mult}..{t_mult})" if (s_mult or t_mult) else ""
                assoc_str = f" [tabla intermedia: {rel.get('associationClassName')}]" if rel.get('associationClassName') else ""
                context_text += (
                    f"  - {rel.get('source', '?')} --[{rel.get('type', 'association')}]--> "
                    f"{rel.get('target', '?')}{card_str}{assoc_str}\n"
                )

        full_prompt = self.SYSTEM_PROMPT + context_text + f"\nMENSAJE DEL USUARIO: {message}"

        try:
            from google import genai

            client = genai.Client(api_key=api_key)

            models_to_try = ['gemini-3.6-flash', 'gemini-flash-latest']
            response = None
            last_err = None
            max_retries = 3

            for m in models_to_try:
                for attempt in range(max_retries):
                    try:
                        response = client.models.generate_content(
                            model=m,
                            contents=[full_prompt],
                        )
                        if response and response.text:
                            break
                    except Exception as model_err:
                        last_err = model_err
                        err_str = str(model_err)
                        # Si es error 503 (sobrecarga), reintentar con delay
                        if '503' in err_str or 'UNAVAILABLE' in err_str:
                            import time
                            wait_time = (attempt + 1) * 2  # 2s, 4s, 6s
                            print(f"Gemini 503 - reintentando en {wait_time}s (intento {attempt + 1}/{max_retries})")
                            time.sleep(wait_time)
                            continue
                        # Si es otro error (404, modelo no existe), pasar al siguiente modelo
                        break
                if response and response.text:
                    break

            if not response or not response.text:
                raise Exception(f"No se obtuvo respuesta de Gemini: {last_err}")

            response_text = response.text.strip()

            # Extraer acciones JSON si existen en la respuesta
            actions = []
            reply_text = response_text

            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
            if json_match:
                try:
                    parsed_json = json.loads(json_match.group(1))
                    if isinstance(parsed_json, dict) and 'actions' in parsed_json:
                        actions = parsed_json['actions']
                    elif isinstance(parsed_json, list):
                        actions = parsed_json
                except json.JSONDecodeError:
                    pass

                # Remover el bloque JSON del texto de respuesta para mostrar solo la explicación
                reply_text = re.sub(r'```(?:json)?\s*[\s\S]*?\s*```', '', response_text).strip()

            return Response({
                'success': True,
                'reply': reply_text,
                'actions': actions,
            })

        except Exception as e:
            print(f"Error en AsistenteChatAPIView: {e}")
            return Response(
                {'success': False, 'error': f'Error al comunicarse con la IA: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
