class UmlAttribute {
  final String id;
  final String name;
  final String type;
  final String visibility;

  UmlAttribute({
    required this.id,
    required this.name,
    required this.type,
    this.visibility = '+',
  });

  factory UmlAttribute.fromMap(Map<String, dynamic> map) {
    return UmlAttribute(
      id: map['id']?.toString() ?? '',
      name: map['name']?.toString() ?? '',
      type: map['type']?.toString() ?? 'String',
      visibility: map['visibility']?.toString() ?? '+',
    );
  }
}

class UmlMethod {
  final String id;
  final String name;
  final String returnType;
  final String parameters;
  final String visibility;

  UmlMethod({
    required this.id,
    required this.name,
    this.returnType = 'void',
    this.parameters = '',
    this.visibility = '+',
  });

  factory UmlMethod.fromMap(Map<String, dynamic> map) {
    return UmlMethod(
      id: map['id']?.toString() ?? '',
      name: map['name']?.toString() ?? '',
      returnType: map['returnType']?.toString() ?? 'void',
      parameters: map['parameters']?.toString() ?? '',
      visibility: map['visibility']?.toString() ?? '+',
    );
  }
}

class UmlClassNode {
  final String id;
  final String name;
  final String stereotype;
  final double x;
  final double y;
  final List<UmlAttribute> attributes;
  final List<UmlMethod> methods;

  UmlClassNode({
    required this.id,
    required this.name,
    this.stereotype = '',
    required this.x,
    required this.y,
    required this.attributes,
    required this.methods,
  });

  factory UmlClassNode.fromMap(Map<String, dynamic> map) {
    final pos = map['position'] as Map<String, dynamic>? ?? {};
    final data = map['data'] as Map<String, dynamic>? ?? {};

    final rawAttrs = data['attributes'] as List? ?? [];
    final attrs = rawAttrs.map((a) {
      if (a is Map<String, dynamic>) {
        return UmlAttribute.fromMap(a);
      }
      return UmlAttribute(id: '', name: a.toString(), type: '');
    }).toList();

    final rawMethods = data['methods'] as List? ?? [];
    final methods = rawMethods.map((m) {
      if (m is Map<String, dynamic>) {
        return UmlMethod.fromMap(m);
      }
      return UmlMethod(id: '', name: m.toString());
    }).toList();

    return UmlClassNode(
      id: map['id']?.toString() ?? '',
      name: data['name']?.toString() ?? 'SinNombre',
      stereotype: data['stereotype']?.toString() ?? '',
      x: (pos['x'] as num?)?.toDouble() ?? 100.0,
      y: (pos['y'] as num?)?.toDouble() ?? 100.0,
      attributes: attrs,
      methods: methods,
    );
  }
}

class UmlEdge {
  final String id;
  final String source;
  final String target;
  final String type;
  final String sourceMultiplicity;
  final String targetMultiplicity;
  final String label;

  UmlEdge({
    required this.id,
    required this.source,
    required this.target,
    this.type = 'association',
    this.sourceMultiplicity = '',
    this.targetMultiplicity = '',
    this.label = '',
  });

  factory UmlEdge.fromMap(Map<String, dynamic> map) {
    final data = map['data'] as Map<String, dynamic>? ?? {};
    return UmlEdge(
      id: map['id']?.toString() ?? '',
      source: map['source']?.toString() ?? '',
      target: map['target']?.toString() ?? '',
      type: data['relationType']?.toString() ?? 'association',
      sourceMultiplicity: data['sourceMultiplicity']?.toString() ?? '',
      targetMultiplicity: data['targetMultiplicity']?.toString() ?? '',
      label: data['label']?.toString() ?? '',
    );
  }
}

class TeamChatMessage {
  final String id;
  final String role; // 'user' o 'assistant'
  final String senderName;
  final String senderColor;
  final String text;
  final String timestamp;
  final List<dynamic>? actions;

  TeamChatMessage({
    required this.id,
    required this.role,
    required this.senderName,
    required this.senderColor,
    required this.text,
    required this.timestamp,
    this.actions,
  });

  factory TeamChatMessage.fromMap(Map<String, dynamic> map) {
    return TeamChatMessage(
      id: map['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
      role: map['role']?.toString() ?? 'user',
      senderName: map['senderName']?.toString() ?? map['sender_name']?.toString() ?? 'Colaborador',
      senderColor: map['senderColor']?.toString() ?? map['sender_color']?.toString() ?? '#2563eb',
      text: map['text']?.toString() ?? map['message']?.toString() ?? '',
      timestamp: map['timestamp']?.toString() ?? map['created_at']?.toString() ?? DateTime.now().toIso8601String(),
      actions: map['actions'] as List<dynamic>?,
    );
  }
}
