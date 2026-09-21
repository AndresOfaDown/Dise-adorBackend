from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^/?ws/diagrama/(?P<project_id>\d+)/?$', consumers.DiagramaConsumer.as_asgi()),
]
