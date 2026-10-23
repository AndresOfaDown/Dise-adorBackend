class SchemaField {
  final String name;
  final String type;
  final String label;
  final bool primaryKey;

  SchemaField({
    required this.name,
    required this.type,
    required this.label,
    required this.primaryKey,
  });

  factory SchemaField.fromJson(Map<String, dynamic> json) {
    return SchemaField(
      name: json['name'] as String? ?? '',
      type: json['type'] as String? ?? 'String',
      label: json['label'] as String? ?? '',
      primaryKey: json['primaryKey'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'type': type,
        'label': label,
        'primaryKey': primaryKey,
      };
}

class SchemaRelation {
  final String type;
  final String targetEntity;
  final String propertyName;

  SchemaRelation({
    required this.type,
    required this.targetEntity,
    required this.propertyName,
  });

  factory SchemaRelation.fromJson(Map<String, dynamic> json) {
    return SchemaRelation(
      type: json['type'] as String? ?? '',
      targetEntity: json['targetEntity'] as String? ?? '',
      propertyName: json['propertyName'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'type': type,
        'targetEntity': targetEntity,
        'propertyName': propertyName,
      };
}

class EntitySchema {
  final String name;
  final String label;
  final String endpoint;
  final String idType;
  final List<SchemaField> fields;
  final List<SchemaRelation> relations;

  EntitySchema({
    required this.name,
    required this.label,
    required this.endpoint,
    required this.idType,
    required this.fields,
    required this.relations,
  });

  factory EntitySchema.fromJson(Map<String, dynamic> json) {
    return EntitySchema(
      name: json['name'] as String? ?? '',
      label: json['label'] as String? ?? '',
      endpoint: json['endpoint'] as String? ?? '',
      idType: json['idType'] as String? ?? 'Long',
      fields: (json['fields'] as List<dynamic>?)
              ?.map((f) => SchemaField.fromJson(f as Map<String, dynamic>))
              .toList() ??
          [],
      relations: (json['relations'] as List<dynamic>?)
              ?.map((r) => SchemaRelation.fromJson(r as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'label': label,
        'endpoint': endpoint,
        'idType': idType,
        'fields': fields.map((f) => f.toJson()).toList(),
        'relations': relations.map((r) => r.toJson()).toList(),
      };
}
