class AuthUser {
  final int id;
  final String username;
  final String email;
  final String? nombre;

  AuthUser({
    required this.id,
    required this.username,
    required this.email,
    this.nombre,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id'].toString()) ?? 0,
      username: json['username']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      nombre: json['nombre']?.toString() ?? json['first_name']?.toString(),
    );
  }
}

class ProjectItem {
  final int id;
  final String name;
  final String description;
  final String lastEditedAt;
  final String role;
  final int collaboratorsCount;

  ProjectItem({
    required this.id,
    required this.name,
    required this.description,
    required this.lastEditedAt,
    required this.role,
    required this.collaboratorsCount,
  });

  factory ProjectItem.fromJson(Map<String, dynamic> json) {
    final rawCollabs = json['colaboradores'] as List? ?? [];
    return ProjectItem(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id'].toString()) ?? 0,
      name: json['nombre']?.toString() ?? json['name']?.toString() ?? 'Proyecto #${json['id']}',
      description: json['descripcion']?.toString() ?? json['description']?.toString() ?? '',
      lastEditedAt: json['last_edited_at']?.toString() ?? json['updated_at']?.toString() ?? '',
      role: json['rol']?.toString() ?? 'colaborador',
      collaboratorsCount: rawCollabs.length,
    );
  }
}
