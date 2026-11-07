import os
import json
import re
import requests
from google import genai
from google.genai import types

OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')
DEFAULT_LOCAL_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2:3b')

LOCAL_SENIOR_SYSTEM_PROMPT = """Eres el Arquitecto de Software Senior en una sesión de modelado UML colaborativo.
Tus respuestas deben ser MUY CORTAS (máximo 1 sola línea).
OBLIGATORIO: Cuando el usuario pida agregar, modificar o eliminar clases o relaciones, confirma en 1 línea y coloca SIEMPRE al final el bloque JSON con la clave "actions":

1. Para ELIMINAR una clase:
```json
{
  "actions": [
    { "type": "deleteNode", "data": { "targetName": "NombreClase" } }
  ]
}
```

2. Para RELACIONAR dos clases existentes (NUNCA agregues clases existentes, solo addEdge):
```json
{
  "actions": [
    { "type": "addEdge", "data": { "source": "ClaseA", "target": "ClaseB", "type": "association", "sourceMultiplicity": "1", "targetMultiplicity": "0..*" } }
  ]
}
```

3. Para CREAR una nueva clase:
```json
{
  "actions": [
    { "type": "addNode", "data": { "name": "NombreClase", "attributes": ["+ id: Long"], "methods": [] } }
  ]
}
```

Si la consulta es un saludo o pregunta teórica, responde amablemente en 1 línea en español SIN bloque JSON."""

SENIOR_ARCHITECT_SYSTEM_PROMPT = """Eres un Arquitecto de Software Senior y Desarrollador Líder mentorizando a un equipo en una sesión de modelado colaborativo de diagramas de clases UML.

TUS RESPONSABILIDADES Y ROL:
1. COMUNICACIÓN CONCISA, PRECISA Y DIRECTA:
   - Dirígete al usuario por su nombre de forma cordial pero breve (ej: "Hola Trevor, listo.", "Carlos, respecto a tu duda...").
   - IMPORTANTE: Tus respuestas deben ser CORTAS, PUNTUALES Y AL GRANO (máximo 2 a 3 oraciones cortas cuando ejecutes una acción).
   - NO redactes discursos largos ni ensayos teóricos no solicitados cuando te pidan crear, modificar o eliminar elementos del diagrama.
   - Solo da explicaciones teóricas extensas si el usuario te lo pide explícitamente (ej: "¿Me puedes explicar en detalle...?").

2. CAPACIDAD DE ACCIÓN SOBRE EL DIAGRAMA:
   - Si el usuario te pide explícitamente agregar, modificar, eliminar clases, atributos, métodos o relaciones, o refactorizar el diseño:
     a) Confirma la acción en 1 o 2 líneas claras (ej: "Listo Carlos, he creado la clase Factura con los atributos solicitados.").
     b) Incluye al final de tu respuesta el bloque JSON delimitado con ```json ... ``` con la clave "actions".
   - Si la consulta del usuario es puramente conceptual, de orientación, saludo o resumen, NO incluyas bloque de acciones JSON, responde brevemente en texto enriquecido Markdown.

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
   - Clases siempre en PascalCase (ej: Cliente, FacturaDetalle, Pago).
   - Atributos y métodos en camelCase con tipado estándar compatible con Java/Spring Boot (Long, Integer, String, Boolean, Double, LocalDate, BigDecimal).
   - Posiciones calculadas coherentemente sin sobreponer las clases existentes.

Responde SIEMPRE en español, directo al grano y sin relleno innecesario.
"""


def check_ollama_status(base_url: str = OLLAMA_BASE_URL) -> dict:
    """
    Verifica si el servicio de Ollama local está activo y devuelve los modelos instalados.
    """
    try:
        res = requests.get(f"{base_url.rstrip('/')}/api/tags", timeout=3)
        if res.status_code == 200:
            data = res.json()
            models = [m.get('name') for m in data.get('models', [])]
            return {
                'available': True,
                'models': models,
                'default_model': DEFAULT_LOCAL_MODEL if DEFAULT_LOCAL_MODEL in models else (models[0] if models else DEFAULT_LOCAL_MODEL)
            }
    except Exception as e:
        print(f"[Ollama Check] No disponible en {base_url}: {e}")
    return {
        'available': False,
        'models': [],
        'default_model': None
    }


def parse_ai_actions(raw_text: str) -> tuple[str, list]:
    """
    Extrae bloques JSON de acciones y limpia el texto para visualización.
    Soporta formato {"actions": [...]}, listas directas [...], objetos únicos,
    y repara JSON truncado si el modelo no alcanzó a cerrarlo.
    """
    actions = []
    clean_reply = raw_text

    # Buscar bloque json delimitado o semiabierto
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)(?:```|$)', raw_text)
    if json_match:
        raw_code = json_match.group(1).strip()
        parsed_json = None

        # Intento 1: Parseo directo
        try:
            parsed_json = json.loads(raw_code)
        except Exception:
            # Intento 2: Reparar terminación si quedó cortado
            trimmed = raw_code.rstrip()
            for suffix in [']}', '}', '"}]}', '"]}', '"}}']:
                try:
                    parsed_json = json.loads(trimmed + suffix)
                    break
                except Exception:
                    continue

        if parsed_json:
            if isinstance(parsed_json, dict):
                if 'actions' in parsed_json and isinstance(parsed_json['actions'], list):
                    actions = parsed_json['actions']
                elif 'type' in parsed_json:
                    actions = [parsed_json]
            elif isinstance(parsed_json, list):
                actions = parsed_json

        # Limpiar texto del reply removiendo el bloque de código
        clean_reply = re.sub(r'```(?:json)?\s*[\s\S]*?(?:```|$)', '', raw_text).strip()

    # Normalizar campos de acciones para garantizar compatibilidad total con el frontend
    normalized_actions = []
    for act in actions:
        if isinstance(act, dict) and 'type' in act:
            adata = act.get('data', {})
            atype = act.get('type')

            # Normalizar tipos de relación
            if atype in ['addAssociation', 'addRelation', 'createEdge', 'crearRelacion']:
                atype = 'addEdge'

            if atype in ['deleteNode', 'modifyNode']:
                if 'name' in adata and 'targetName' not in adata:
                    adata['targetName'] = adata['name']
                elif 'className' in adata and 'targetName' not in adata:
                    adata['targetName'] = adata['className']
            elif atype == 'addNode':
                if 'className' in adata and 'name' not in adata:
                    adata['name'] = adata['className']
            elif atype in ['addEdge', 'deleteEdge', 'modifyEdge']:
                src = adata.get('source') or adata.get('sourceName') or adata.get('from')
                tgt = adata.get('target') or adata.get('targetName') or adata.get('to')
                if src:
                    adata['source'] = src
                if tgt:
                    adata['target'] = tgt
                if 'type' not in adata:
                    adata['type'] = 'association'

            normalized_actions.append({'type': atype, 'data': adata})

    return clean_reply, normalized_actions


def query_ollama_local(
    user_prompt: str,
    system_prompt: str = LOCAL_SENIOR_SYSTEM_PROMPT,
    model: str = DEFAULT_LOCAL_MODEL,
    base_url: str = OLLAMA_BASE_URL,
    timeout: int = 70
) -> dict:
    """
    Ejecuta la inferencia en el modelo LLM local a través de Ollama.
    Mantiene el modelo en memoria permanente (keep_alive: 24h) y optimiza contexto a 2048 tokens.
    """
    payload = {
        'model': model,
        'prompt': user_prompt,
        'system': system_prompt,
        'stream': False,
        'keep_alive': '24h',
        'options': {
            'temperature': 0.1,
            'num_predict': 220,
            'num_ctx': 2048,
            'num_thread': 4
        }
    }
    url = f"{base_url.rstrip('/')}/api/generate"
    response = requests.post(url, json=payload, timeout=timeout)
    if response.status_code != 200:
        raise Exception(f"Ollama respondió con código HTTP {response.status_code}: {response.text}")

    data = response.json()
    raw_text = data.get('response', '').strip()
    if not raw_text:
        raise Exception("Ollama devolvió una respuesta vacía")

    clean_reply, actions = parse_ai_actions(raw_text)

    # Heurística de respaldo para modelos locales si omitieron el bloque JSON en órdenes explícitas
    has_del = any(a.get('type') == 'deleteNode' for a in actions)
    has_edge = any(a.get('type') == 'addEdge' for a in actions)

    if not has_del:
        del_match = re.search(r'elimina(?:r)?\s+(?:la\s+clase\s+)?([A-Za-z0-9_]+)', user_prompt, re.IGNORECASE)
        if del_match:
            target_class = del_match.group(1).strip()
            if target_class.lower() not in ['una', 'la', 'el', 'esta', 'clase']:
                actions.append({'type': 'deleteNode', 'data': {'targetName': target_class}})

    if not has_edge:
        rel_match = re.search(r'relacion(?:a|ar)?\s+(?:la\s+clase\s+)?([A-Za-z0-9_]+)\s+con\s+(?:la\s+clase\s+)?([A-Za-z0-9_]+)', user_prompt, re.IGNORECASE)
        if rel_match:
            s_name = rel_match.group(1).strip()
            t_name = rel_match.group(2).strip()
            if s_name.lower() not in ['una', 'la', 'clase'] and t_name.lower() not in ['una', 'la', 'clase']:
                actions.append({
                    'type': 'addEdge',
                    'data': {
                        'source': s_name,
                        'target': t_name,
                        'type': 'association',
                        'sourceMultiplicity': '1',
                        'targetMultiplicity': '0..*'
                    }
                })

    return {
        'reply': clean_reply,
        'actions': actions,
        'provider': 'local',
        'model': model
    }


def query_gemini_cloud(
    full_prompt: str,
    api_key: str = None
) -> dict:
    """
    Ejecuta la inferencia en Google Gemini Cloud con conmutación por modelos disponibles.
    """
    if not api_key:
        api_key = os.environ.get('GEMINI_API_KEY', '')

    if not api_key:
        raise Exception("No se ha configurado la clave GEMINI_API_KEY en el servidor")

    client = genai.Client(api_key=api_key)
    models_to_try = ['gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-pro-latest']
    response = None
    last_err = None
    used_model = 'gemini-flash-lite-latest'

    for m in models_to_try:
        try:
            response = client.models.generate_content(
                model=m,
                contents=[full_prompt],
            )
            if response and response.text:
                used_model = m
                break
        except Exception as e:
            last_err = e
            continue

    if not response or not response.text:
        raise Exception(f"No se obtuvo respuesta de Gemini Cloud: {last_err}")

    raw_text = response.text.strip()
    clean_reply, actions = parse_ai_actions(raw_text)

    return {
        'reply': clean_reply,
        'actions': actions,
        'provider': 'cloud',
        'model': used_model
    }


def generate_senior_ai_response(
    sender_name: str,
    user_message: str,
    diagram_context: dict,
    recent_history: list = None,
    api_key: str = None,
    preferred_provider: str = 'auto',  # 'auto' | 'local' | 'cloud'
    local_model: str = DEFAULT_LOCAL_MODEL
) -> dict:
    """
    Genera la respuesta colaborativa de la IA Senior con arquitectura híbrida:
    - 'local': Utiliza Ollama en la máquina con modelo Llama 3.2 3B y respaldo inteligente en caso de alta carga.
    - 'cloud': Utiliza la nube de Google Gemini.
    - 'auto': Prioriza la IA Local (Ollama) si responde en tiempo razonable; si no, conmuta a Gemini Cloud.
    """
    # 1. Preparar contexto compacto para el motor local y detallado para la nube
    classes = diagram_context.get('classes', [])
    relations = diagram_context.get('relations', [])

    # Formato completo (para Gemini)
    context_str = "\n--- ESTADO ACTUAL DEL DIAGRAMA DE LA SALA ---\n"
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

    history_str = ""
    if recent_history:
        history_str = "\n--- HISTORIAL RECIENTE DE LA SALA COLABORATIVA ---\n"
        for msg in recent_history[-6:]:
            author = msg.get('sender_name', 'Usuario')
            role = "IA Senior" if msg.get('role') == 'assistant' else author
            history_str += f"[{role}]: {msg.get('text', '')}\n"

    full_cloud_prompt = (
        f"{SENIOR_ARCHITECT_SYSTEM_PROMPT}\n"
        f"{context_str}\n"
        f"{history_str}\n"
        f"--- MENSAJE ACTUAL ENTRANTE ---\n"
        f"Colaborador que habla: {sender_name}\n"
        f"Mensaje: {user_message}\n\n"
        f"Responde a {sender_name} como Arquitecto de Software Senior de la sala:"
    )

    # Contexto sintético ultracompacto para Ollama (optimizado para inferencia en CPU/GPU)
    compact_classes_list = []
    for cls in classes[:10]:
        cname = cls.get('name', 'Clase')
        raw_attrs = cls.get('attributes', [])[:3]
        clean_attrs = [a.split(':')[-2].split()[-1] if ':' in a else a for a in raw_attrs]
        compact_classes_list.append(f"{cname}({', '.join(clean_attrs)})" if clean_attrs else cname)

    compact_rels_list = []
    for rel in relations[:6]:
        compact_rels_list.append(f"{rel.get('source')} -> {rel.get('target')} ({rel.get('type', 'assoc')})")

    local_diag_summary = ""
    if compact_classes_list:
        local_diag_summary += f"Diagrama: {', '.join(compact_classes_list)}."
    if compact_rels_list:
        local_diag_summary += f" Relaciones: {', '.join(compact_rels_list)}."

    # Historial ultra-corto para local (últimos 2 mensajes)
    local_hist_parts = []
    if recent_history:
        for msg in recent_history[-2:]:
            author = "IA" if msg.get('role') == 'assistant' else msg.get('sender_name', 'Usuario')
            snippet = (msg.get('text', '') or '')[:80].replace('\n', ' ')
            local_hist_parts.append(f"[{author}]: {snippet}")
    local_hist_summary = " | ".join(local_hist_parts)

    local_user_prompt = (
        f"{local_diag_summary}\n"
        f"{('Historial: ' + local_hist_summary) if local_hist_summary else ''}\n"
        f"Colaborador: {sender_name}\n"
        f"Mensaje: {user_message}\n\n"
        f"Responde a {sender_name}:"
    )

    # 4. Estrategia de Inferencia Híbrida
    target_mode = (preferred_provider or 'auto').lower()

    # Caso A: Modo estrictamente local (100% privado en máquina local)
    if target_mode == 'local':
        ollama_status = check_ollama_status()
        if not ollama_status.get('available'):
            return {
                'reply': f"Hola {sender_name}, el motor de IA Local (Ollama) está apagado o no responde en http://127.0.0.1:11434. Para utilizar este modo privado, inicia Ollama en tu computadora o cambia al selector de modo Nube o Híbrido.",
                'actions': [],
                'provider': 'local',
                'model': local_model,
                'error': 'Ollama offline'
            }
        try:
            print(f"[IA Senior Local] Ejecutando consulta compacta en Ollama ({local_model})...")
            return query_ollama_local(local_user_prompt, model=local_model, timeout=70)
        except Exception as e:
            print(f"[IA Senior Local Error]: {e}")
            return {
                'reply': f"Hola {sender_name}, ocurrió un problema al consultar el modelo local Ollama ({local_model}): {str(e)}. Verifica que Ollama esté ejecutándose en tu PC.",
                'actions': [],
                'provider': 'local',
                'model': local_model,
                'error': str(e)
            }

    # Caso B: Modo estrictamente nube
    if target_mode == 'cloud':
        try:
            print("[IA Senior Cloud] Ejecutando consulta en Gemini Cloud...")
            return query_gemini_cloud(full_cloud_prompt, api_key=api_key)
        except Exception as e:
            print(f"[IA Senior Error Cloud]: {e}")
            return {
                'reply': f"Hola {sender_name}, ocurrió un error al consultar Gemini Cloud: {str(e)}",
                'actions': [],
                'provider': 'cloud',
                'model': 'gemini',
                'error': str(e)
            }

    # Caso C: Modo 'auto' (Híbrido Inteligente con Fallback Transparente)
    ollama_status = check_ollama_status()
    if ollama_status.get('available'):
        active_model = local_model if local_model in ollama_status.get('models', []) else ollama_status.get('default_model', local_model)
        try:
            print(f"[IA Senior Auto] Ollama detectado. Ejecutando en IA Local ({active_model})...")
            result = query_ollama_local(local_user_prompt, model=active_model, timeout=25)
            return result
        except Exception as local_exc:
            print(f"[IA Senior Auto Warning] Ollama tardó más de 25s o falló ({local_exc}). Conmutando automáticamente a Gemini Cloud...")

    # Fallback a Gemini Cloud
    try:
        print("[IA Senior Auto] Conectando a Gemini Cloud (Fallback / Primario)...")
        return query_gemini_cloud(full_cloud_prompt, api_key=api_key)
    except Exception as cloud_exc:
        print(f"[IA Senior Fallback Error]: {cloud_exc}")
        return {
            'reply': f"Hola {sender_name}, ocurrió un error al procesar tu solicitud tanto en local como en la nube: {str(cloud_exc)}",
            'actions': [],
            'provider': 'error',
            'model': 'none'
        }
