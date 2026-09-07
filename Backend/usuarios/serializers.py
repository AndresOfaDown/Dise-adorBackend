from rest_framework import serializers
from django.contrib.auth import get_user_model

Usuario = get_user_model()

class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ['id', 'username', 'nombre', 'email', 'date_joined']
        read_only_fields = ['id', 'date_joined']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, style={'input_type': 'password'})

    class Meta:
        model = Usuario
        fields = ['nombre', 'username', 'email', 'password']

    def validate_email(self, value):
        norm_email = value.lower()
        if Usuario.objects.filter(email__iexact=norm_email).exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo electrónico.")
        return norm_email

    def validate_username(self, value):
        if Usuario.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Este nombre de usuario ya está en uso.")
        return value

    def create(self, validated_data):
        user = Usuario.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            nombre=validated_data.get('nombre', ''),
            password=validated_data['password']
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate(self, attrs):
        email = attrs.get('email', '').strip().lower()
        password = attrs.get('password', '')

        if not email or not password:
            raise serializers.ValidationError("Debe ingresar correo y contraseña.")

        try:
            user = Usuario.objects.get(email__iexact=email)
        except Usuario.DoesNotExist:
            raise serializers.ValidationError("Credenciales incorrectas. Verifique su correo y contraseña.")

        if not user.check_password(password):
            raise serializers.ValidationError("Credenciales incorrectas. Verifique su correo y contraseña.")

        if not user.is_active:
            raise serializers.ValidationError("Esta cuenta se encuentra inactiva.")

        attrs['user'] = user
        return attrs
