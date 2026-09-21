from rest_framework import serializers
from .models import Proyecto, Diagrama


class DiagramaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Diagrama
        fields = ['id', 'nodes', 'edges', 'viewport']


class ProyectoSerializer(serializers.ModelSerializer):
    owner_username = serializers.ReadOnlyField(source='usuario.username')
    owner_email = serializers.ReadOnlyField(source='usuario.email')
    is_owner = serializers.SerializerMethodField()
    colaboradores = serializers.SerializerMethodField()

    class Meta:
        model = Proyecto
        fields = [
            'id',
            'package_base',
            'create_at',
            'update_at',
            'last_edited_at',
            'owner_username',
            'owner_email',
            'is_owner',
            'colaboradores',
        ]
        read_only_fields = ['id', 'create_at', 'update_at', 'last_edited_at']

    def get_is_owner(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.usuario_id == request.user.id
        return False

    def get_colaboradores(self, obj):
        return [
            {
                'id': c.id,
                'username': c.username,
                'email': c.email,
            }
            for c in obj.colaboradores.all()
        ]


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
