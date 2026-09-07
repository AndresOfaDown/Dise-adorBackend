from rest_framework import serializers
from .models import Proyecto, Diagrama


class DiagramaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Diagrama
        fields = ['id', 'nodes', 'edges', 'viewport']


class ProyectoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proyecto
        fields = ['id', 'package_base', 'create_at', 'update_at', 'last_edited_at']
        read_only_fields = ['id', 'create_at', 'update_at', 'last_edited_at']


class ProyectoCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proyecto
        fields = ['id', 'package_base']

    def create(self, validated_data):
        usuario = self.context['request'].user
        proyecto = Proyecto.objects.create(usuario=usuario, **validated_data)
        # Crear diagrama vacío asociado al proyecto
        Diagrama.objects.create(
            proyecto=proyecto,
            nodes=[],
            edges=[],
            viewport={'x': 0, 'y': 0, 'zoom': 1}
        )
        return proyecto
