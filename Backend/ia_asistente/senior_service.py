import os
import json
import re
from google import genai
from google.genai import types

SENIOR_ARCHITECT_SYSTEM_PROMPT = """Eres un Arquitecto de Software Senior y Desarrollador Líder mentorizando a un equipo en una sesión de modelado colaborativo de diagramas de clases UML.

TUS RESPONSABILIDADES Y ROL:
1. COMUNICACIÓN CONCISA, PRECISA Y DIRECTA:
   - Dirígete al usuario por su nombre de forma cordial pero breve (ej: "Hola Soad, listo.", "Carlos, respecto a tu duda...").
   - IMPORTANTE: Tus respuestas deben ser CORTAS, PUNTUALES Y AL GRANO (máximo 2 a 3 oraciones cortas cuando ejecutes una acción).
   - NO redactes discursos largos ni ensayos teóricos no solicitados cuando te pidan crear, modificar o eliminar elementos del diagrama.
   - Solo da explicaciones teóricas extensas si el usuario te lo pide explícitamente (ej: "¿Me puedes explicar en detalle...?").

2. CAPACIDAD DE ACCIÓN SOBRE EL DIAGRAMA:
   - Si el usuario te pide explícitamente agregar, modificar, eliminar clases, atributos, métodos o relaciones, o refactorizar el diseño:
     a) Confirma la acción en 1 o 2 líneas claras (ej: "Listo Soad, he eliminado la relación entre DetallePedido y Producto.").
     b) Incluye al final de tu respuesta el bloque JSON delimitado con ```json ... ``` con la clave "actions".
   - Si la consulta del usuario es puramente conceptual, de orientación, saludo o resumen, NO incluyas bloque de acciones JSON, responde brevemente en texto enriquecido.

3. ESPECIFICACIÓN DE ACCIONES JSON DISPONIBLES:
   - addNode:
     { "type": "addNode", "data": { "name": "NombreClase", "stereotype": "", "attributes": ["+ id: Long", "+ nombre: String"], "methods": ["+ procesar(): Boolean"], "position": { "x": 250, "y": 180 } } }
   - modifyNode:
     { "type": "modifyNode", "data": { "targetName": "NombreClaseExistente", "newName": "NuevoNombreOpcional", "addAttributes": ["+ nuevoCampo: Tipo"], "removeAttributes": ["campoViejo"], "addMethods": ["+ nuevoMetodo(): void"], "removeMethods": ["metodoViejo"] } }
   - deleteNode:
     { "type": "deleteNode", "data": { "targetName": "NombreClaseAEliminar" } }
   - addEdge:
     { "type": "addEdge", "data": { "source": "ClaseOrigen", "target": "ClaseDestino", "type": "association"|"composition"|"aggregation"|"generalization"|"dependency"|"associationClass", "sourceMultiplicity": "1", "targetMultiplicity": "1..*", "label": "descripcionOpcional", "associationClassName": "ClaseIntermediaSiAplica" } }
   - modifyEdge:
     { "type": "modifyEdge", "data": { "source": "ClaseOrigen", "target": "ClaseDestino", "sourceMultiplicity": "1", "targetMultiplicity": "0..*", "newType": "composition", "label": "nuevaEtiqueta" } }
   - deleteEdge:
     { "type": "deleteEdge", "data": { "source": "ClaseOrigen", "target": "ClaseDestino" } }

4. REGLAS DE MODELADO Y TIPOS:
   - Clases siempre en PascalCase (ej: Cliente, FacturaDetalle).
   - Atributos y métodos en camelCase con tipado estándar compatible con Java/Spring Boot (Long, Integer, String, Boolean, Double, LocalDate).
   - Posiciones calculadas coherentemente sin sobreponer las clases existentes.

Responde SIEMPRE en español, directo al grano y sin relleno innecesario.
"""

def generate_senior_ai_response(
    sender_name: str,
    user_message: str,
    diagram_context: dict,
    recent_history: list = None,
    api_key: str = None
) -> dict:
    """
    Genera la respuesta colaborativa de la IA Senior utilizando Gemini.
    Retorna un diccionario con:
    {
        'reply': str,
        'actions': list
    }
    """
    if not api_key:
        api_key = os.environ.get('GEMINI_API_KEY', '')

    if not api_key:
        return {
            'reply': f"Hola {sender_name}, no tengo configurada una API Key de Gemini en el servidor para procesar tu consulta.",
            'actions': []
        }

    # 1. Formatear el contexto del diagrama actual
    context_str = "\n--- ESTADO ACTUAL DEL DIAGRAMA DE LA SALA ---\n"
    classes = diagram_context.get('classes', [])
    relations = diagram_context.get('relations', [])

    if classes:
        context_str += f"Clases presentes ({len(classes)}):\n"
        for cls in classes:
            attrs = ", ".join(cls.get('attributes', [])) or "ninguno"
            meths = ", ".join(cls.get('methods', [])) or "ninguno"
            pos = cls.get('position', {})
            pos_info = f" (x: {pos.get('x', 0)}, y: {pos.get('y', 0)})" if pos else ""
            context_str += f"  * {cls.get('name')}{pos_info}: Atributos=[{attrs}] | Métodos=[{meths}]\n"
    else:
        context_str += "El diagrama está actualmente vacío (sin clases).\n"

    if relations:
        context_str += f"\nRelaciones presentes ({len(relations)}):\n"
        for rel in relations:
            s_mult = rel.get('sourceMultiplicity', '')
            t_mult = rel.get('targetMultiplicity', '')
            mult_str = f" ({s_mult}..{t_mult})" if (s_mult or t_mult) else ""
            context_str += f"  * {rel.get('source')} --[{rel.get('type', 'association')}]{mult_str}--> {rel.get('target')}\n"

    # 2. Formatear historial reciente de la sala
    history_str = ""
    if recent_history:
        history_str = "\n--- HISTORIAL RECIENTE DE LA SALA COLABORATIVA ---\n"
        for msg in recent_history[-6:]:  # últimos 6 mensajes para contexto conversacional
            author = msg.get('sender_name', 'Usuario')
            role = "IA Senior" if msg.get('role') == 'assistant' else author
            history_str += f"[{role}]: {msg.get('text', '')}\n"

    # 3. Ensamblar prompt completo
    full_prompt = (
        f"{SENIOR_ARCHITECT_SYSTEM_PROMPT}\n"
        f"{context_str}\n"
        f"{history_str}\n"
        f"--- MENSAJE ACTUAL ENTRANTE ---\n"
        f"Colaborador que habla: {sender_name}\n"
        f"Mensaje: {user_message}\n\n"
        f"Responde a {sender_name} como Arquitecto de Software Senior de la sala:"
    )

    try:
        client = genai.Client(api_key=api_key)
        # Prioridad de modelos estables y de alta disponibilidad:
        models_to_try = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.6-flash']
        response = None
        last_err = None

        for m in models_to_try:
            try:
                response = client.models.generate_content(
                    model=m,
                    contents=[full_prompt],
                )
                if response and response.text:
                    break
            except Exception as e:
                last_err = e
                continue

        if not response or not response.text:
            raise Exception(f"No se obtuvo respuesta de Gemini: {last_err}")

        raw_text = response.text.strip()
        actions = []
        clean_reply = raw_text

        # Extraer acciones JSON si existen
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', raw_text)
        if json_match:
            try:
                parsed_json = json.loads(json_match.group(1))
                if isinstance(parsed_json, dict) and 'actions' in parsed_json:
                    actions = parsed_json['actions']
                elif isinstance(parsed_json, list):
                    actions = parsed_json
            except Exception as json_err:
                print(f"Error parseando JSON de acciones IA Senior: {json_err}")

            clean_reply = re.sub(r'```(?:json)?\s*[\s\S]*?\s*```', '', raw_text).strip()

        return {
            'reply': clean_reply,
            'actions': actions
        }

    except Exception as exc:
        print(f"Error al invocar IA Senior: {exc}")
        return {
            'reply': f"Hola {sender_name}, ocurrió un detalle al procesar tu solicitud: {str(exc)}",
            'actions': []
        }
