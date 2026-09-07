import json
from urllib.parse import parse_qs
from collections import defaultdict
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Proyecto, Diagrama

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
