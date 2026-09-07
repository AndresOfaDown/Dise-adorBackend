from django.db import models
from django.contrib.auth.models import AbstractUser

class Usuario(AbstractUser):
    nombre = models.CharField(max_length=50)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'nombre']

    email = models.EmailField(unique=True)

    class Meta:
        db_table = 'usuario'

    def __str__(self):
        return self.nombre
