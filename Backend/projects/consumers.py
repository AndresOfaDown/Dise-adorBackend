import json
import asyncio
from urllib.parse import parse_qs
from collections import defaultdict
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Proyecto, Diagrama
from ia_asistente.models import MensajeColaborativoIA
from ia_asistente.senior_service import generate_senior_ai_response

# Registro global de presencia por sala: room_name -> { channel_name: { 'username': ..., 'color': ..., 'id': ... } }
ROOM_COLLABORATORS = defaultdict(dict)

# Colores distinguidos para asignar a cada usuario colaborador
COLLABORATOR_COLORS = [
    '#2563eb', # Azul real
    '#7c3aed', # Violeta
    '#db2777', # Rosa intenso
    '#ea580c', # Naranja fuego
    '#16a34a', # Verde esmeralda
    '#0891b2', # Cian
    '#d97706', # Ámbar
    '#4f46e5', # Índigo
]

class DiagramaConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.project_id = self.scope['url_route']['kwargs']['project_id']
        self.room_group_name = f'diagrama_{self.project_id}'

        # Extraer query params (username, color, etc.)
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        params = parse_qs(query_string)
        raw_username = params.get('username', ['Colaborador'])[0]
        self.client_id = params.get('clientId', [self.channel_name])[-1]

        # Asignar color según el número de participantes en la sala
        room_count = len(ROOM_COLLABORATORS[self.room_group_name])
        assigned_color = COLLABORATOR_COLORS[room_count % len(COLLABORATOR_COLORS)]
        self.user_color = params.get('color', [assigned_color])[-1]
        self.username = raw_username

        # Unirse al grupo de canales de este proyecto
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        # Registrar en la lista de colaboradores en línea
        ROOM_COLLABORATORS[self.room_group_name][self.channel_name] = {
            'clientId': self.client_id,
            'username': self.username,
            'color': self.user_color,
        }

        await self.accept()

        # Enviar estado actual de presencia al cliente recién conectado de inmediato
        active_users = list(ROOM_COLLABORATORS[self.room_group_name].values())
        await self.send_json({
            'type': 'presence_update',
            'users': active_users,
            'count': len(active_users)
        })

        # Enviar de inmediato el estado del diagrama guardado al nuevo cliente
        diagram_data = await self.get_initial_diagram(self.project_id)
        if diagram_data:
            await self.send_json({
                'type': 'diagram_update',
                'nodes': diagram_data.get('nodes', []),
                'edges': diagram_data.get('edges', []),
                'viewport': diagram_data.get('viewport', {})
            })

        # Enviar de inmediato el historial de conversación IA de la sala al nuevo cliente
        chat_history = await self.get_initial_chat_history(self.project_id)
        if chat_history:
            await self.send_json({
                'type': 'chat_history',
                'messages': chat_history
            })

        # Notificar a todos en la sala sobre el nuevo colaborador y la lista actualizada
        await self.broadcast_presence_state()

    async def disconnect(self, close_code):
        # Remover de la lista de presencia
        if self.channel_name in ROOM_COLLABORATORS[self.room_group_name]:
            del ROOM_COLLABORATORS[self.room_group_name][self.channel_name]

        # Salir del grupo
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        # Notificar lista actualizada a los que quedan
        await self.broadcast_presence_state()

    async def receive_json(self, content):
        action_type = content.get('type')

        if action_type == 'diagram_update':
            # 1. Guardar cambios en la base de datos de manera asíncrona
            nodes = content.get('nodes')
            edges = content.get('edges')
            viewport = content.get('viewport')
            await self.persist_diagram(self.project_id, nodes, edges, viewport)

            # 2. Retransmitir al resto de los participantes en la sala
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'relay_message',
                    'data': content
                }
            )

        elif action_type == 'cursor_move':
            # Retransmitir movimiento de cursor flotante en tiempo real
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'relay_message',
                    'data': content
                }
            )

        elif action_type == 'project_rename':
            # Nombre de proyecto modificado en vivo
            new_name = content.get('name')
            if new_name:
                await self.persist_project_name(self.project_id, new_name)
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'relay_message',
                        'data': content
                    }
                )

        elif action_type == 'team_ai_message':
            # CU-11: Mensaje colaborativo para la IA Senior
            sender_name = content.get('senderName', self.username)
            sender_color = content.get('senderColor', self.user_color)
            message_text = content.get('message', '').strip()
            diagram_context = content.get('diagramContext', {})

            if not message_text:
                return

            # 1. Broadcast inmediato a toda la sala del mensaje del usuario
            user_msg_payload = {
                'type': 'team_ai_message',
                'id': f"msg_user_{content.get('id', self.channel_name)}",
                'role': 'user',
                'senderName': sender_name,
                'senderColor': sender_color,
                'text': message_text,
                'timestamp': content.get('timestamp')
            }
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'relay_message',
                    'data': user_msg_payload
                }
            )

            # 2. Broadcast de estado 'typing' de la IA Senior
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'relay_message',
                    'data': {
                        'type': 'team_ai_typing',
                        'isTyping': True,
                        'forUser': sender_name
                    }
                }
            )

            # 3. Guardar mensaje de usuario en BD
            await self.persist_team_message(
                project_id=self.project_id,
                sender_name=sender_name,
                sender_color=sender_color,
                role='user',
                text=message_text,
                actions=[]
            )

            # 4. Procesar con el servicio IA Senior asíncronamente
            asyncio.create_task(
                self.process_and_broadcast_ai_response(
                    sender_name=sender_name,
                    message_text=message_text,
                    diagram_context=diagram_context
                )
            )

    async def process_and_broadcast_ai_response(self, sender_name, message_text, diagram_context):
        try:
            # Obtener historial reciente de la BD
            history = await self.get_recent_history(self.project_id)

            # Ejecutar el servicio síncrono de IA en un threadpool
            ai_result = await asyncio.to_thread(
                generate_senior_ai_response,
                sender_name=sender_name,
                user_message=message_text,
                diagram_context=diagram_context,
                recent_history=history
            )

            reply_text = ai_result.get('reply', '')
            actions = ai_result.get('actions', [])

            # Guardar respuesta IA en BD
            saved_msg = await self.persist_team_message(
                project_id=self.project_id,
                sender_name='IA Senior',
                sender_color='#10b981',
                role='assistant',
                text=reply_text,
                actions=actions
            )

            # Retransmitir respuesta de la IA a toda la sala
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'relay_message',
                    'data': {
                        'type': 'team_ai_message',
                        'id': f"msg_ai_{saved_msg.id if saved_msg else 'temp'}",
                        'role': 'assistant',
                        'senderName': 'IA Senior',
                        'senderColor': '#10b981',
                        'text': reply_text,
                        'actions': actions,
                        'timestamp': None
                    }
                }
            )

        except Exception as e:
            print(f"Error procesando respuesta IA en sala {self.room_group_name}: {e}")
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'relay_message',
                    'data': {
                        'type': 'team_ai_message',
                        'role': 'assistant',
                        'senderName': 'IA Senior',
                        'senderColor': '#10b981',
                        'text': f"Disculpa {sender_name}, ocurrió un error al procesar tu solicitud.",
                        'actions': []
                    }
                }
            )
        finally:
            # Quitar estado typing
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'relay_message',
                    'data': {
                        'type': 'team_ai_typing',
                        'isTyping': False
                    }
                }
            )

    async def relay_message(self, event):
        # Envía el mensaje JSON al cliente WebSocket conectado
        await self.send_json(event['data'])

    async def broadcast_presence_state(self):
        # Obtener lista única de colaboradores activos
        active_users = list(ROOM_COLLABORATORS[self.room_group_name].values())
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'relay_message',
                'data': {
                    'type': 'presence_update',
                    'users': active_users,
                    'count': len(active_users)
                }
            }
        )

    @database_sync_to_async
    def persist_diagram(self, project_id, nodes, edges, viewport=None):
        try:
            proyecto = Proyecto.objects.filter(id=project_id).first()
            if not proyecto:
                return
            diagrama, _ = Diagrama.objects.get_or_create(proyecto=proyecto)
            if nodes is not None:
                diagrama.nodes = nodes
            if edges is not None:
                diagrama.edges = edges
            if viewport is not None:
                diagrama.viewport = viewport
            diagrama.save()
            proyecto.save() # actualiza last_edited_at
        except Exception as e:
            print(f"Error persistiendo diagrama colaborativo {project_id}: {e}")

    @database_sync_to_async
    def persist_project_name(self, project_id, name):
        try:
            Proyecto.objects.filter(id=project_id).update(package_base=name)
        except Exception as e:
            print(f"Error actualizando nombre de proyecto {project_id}: {e}")

    @database_sync_to_async
    def persist_team_message(self, project_id, sender_name, sender_color, role, text, actions):
        try:
            proyecto = Proyecto.objects.filter(id=project_id).first()
            if not proyecto:
                return None
            return MensajeColaborativoIA.objects.create(
                proyecto=proyecto,
                sender_name=sender_name,
                sender_color=sender_color,
                role=role,
                text=text,
                actions=actions or []
            )
        except Exception as e:
            print(f"Error guardando mensaje de equipo en BD: {e}")
            return None

    @database_sync_to_async
    def get_recent_history(self, project_id):
        try:
            proyecto = Proyecto.objects.filter(id=project_id).first()
            if not proyecto:
                return []
            msgs = MensajeColaborativoIA.objects.filter(proyecto=proyecto).order_by('-created_at')[:8]
            return [
                {
                    'sender_name': m.sender_name,
                    'role': m.role,
                    'text': m.text
                }
                for m in reversed(list(msgs))
            ]
        except Exception as e:
            print(f"Error obteniendo historial: {e}")
            return []

    @database_sync_to_async
    def get_initial_diagram(self, project_id):
        try:
            proyecto = Proyecto.objects.filter(id=project_id).first()
            if not proyecto:
                return None
            diagrama = Diagrama.objects.filter(proyecto=proyecto).first()
            if not diagrama:
                return None
            return {
                'nodes': diagrama.nodes or [],
                'edges': diagrama.edges or [],
                'viewport': diagrama.viewport or {}
            }
        except Exception as e:
            print(f"Error cargando diagrama inicial {project_id}: {e}")
            return None

    @database_sync_to_async
    def get_initial_chat_history(self, project_id):
        try:
            proyecto = Proyecto.objects.filter(id=project_id).first()
            if not proyecto:
                return []
            mensajes = MensajeColaborativoIA.objects.filter(proyecto=proyecto).order_by('created_at')[:50]
            return [
                {
                    'id': str(m.id),
                    'role': m.role,
                    'sender_name': m.sender_name,
                    'sender_color': m.sender_color,
                    'text': m.text,
                    'actions': m.actions or [],
                    'timestamp': m.created_at.isoformat()
                }
                for m in mensajes
            ]
        except Exception as e:
            print(f"Error cargando historial de chat {project_id}: {e}")
            return []
