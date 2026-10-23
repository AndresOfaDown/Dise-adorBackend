import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import '../models/chat_message.dart';
import '../models/schema_definition.dart';
import '../models/sync_operation.dart';
import 'api_service.dart';
import 'database_service.dart';

enum CrudIntent {
  create,
  read,
  update,
  delete,
  help,
  unknown,
}

class NluParseResult {
  final CrudIntent intent;
  final DynamicEntity? matchedEntity;
  final String? targetId;
  final String? mainSubject;
  final Map<String, dynamic> extractedPayload;
  final double confidence;

  NluParseResult({
    required this.intent,
    this.matchedEntity,
    this.targetId,
    this.mainSubject,
    this.extractedPayload = const {},
    this.confidence = 0.0,
  });
}

class DynamicNluService with ChangeNotifier {
  final ApiService apiService;
  final DatabaseService databaseService = DatabaseService();

  DynamicSchema _activeSchema = DynamicSchema(
    businessName: 'Sin configurar',
    entities: [],
  );

  DynamicSchema get activeSchema => _activeSchema;

  DynamicNluService({required this.apiService}) {
    _loadStoredSchema();
  }

  Future<void> _loadStoredSchema() async {
    try {
      final stored = await databaseService.getActiveSchema();
      if (stored != null && stored.entities.isNotEmpty) {
        _activeSchema = stored;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Error cargando esquema de SQLite: $e');
    }
  }

  Future<void> setActiveSchema(DynamicSchema schema) async {
    _activeSchema = schema;
    await databaseService.saveActiveSchema(schema);
    notifyListeners();
  }

  // ==========================================
  // PROCESAMIENTO CONVERSACIONAL DE COMANDOS
  // ==========================================

  Future<ChatMessage> processCommand(String rawInput) async {
    final input = rawInput.trim();
    if (input.isEmpty) {
      return _msg('Por favor, dime o escribe lo que necesitas realizar.');
    }

    final parseResult = parseUserInput(input, _activeSchema);

    // Intent de ayuda
    if (parseResult.intent == CrudIntent.help) {
      return _buildHelpResponse();
    }

    // Intent desconocido
    if (parseResult.intent == CrudIntent.unknown) {
      return _buildUnknownResponse();
    }

    // No se detectó entidad
    if (parseResult.matchedEntity == null) {
      final available = _activeSchema.entities.map((e) => e.label).join(', ');
      return _msg(
        'No identifiqué la entidad en el esquema de "${_activeSchema.businessName}". '
        'Entidades disponibles: $available.\n\n'
        'Intenta algo como: "Muestra los ${_activeSchema.entities.firstOrNull?.label ?? "registros"}"',
      );
    }

    switch (parseResult.intent) {
      case CrudIntent.read:
        return await _handleRead(parseResult, input);
      case CrudIntent.create:
        return await _handleCreate(parseResult, input);
      case CrudIntent.update:
        return await _handleUpdate(parseResult, input);
      case CrudIntent.delete:
        return await _handleDelete(parseResult, input);
      default:
        return _buildUnknownResponse();
    }
  }

  // ==========================================
  // PARSER NLU DINÁMICO CON FUZZY MATCHING
  // ==========================================

  NluParseResult parseUserInput(String text, DynamicSchema schema) {
    final clean = _normalizeText(text);
    final tokens = clean.split(RegExp(r'\s+')).where((t) => t.isNotEmpty).toList();

    // 1. Detección de Intención CRUD
    CrudIntent intent = _detectIntent(clean);

    if (intent == CrudIntent.help) {
      return NluParseResult(intent: intent);
    }

    // 2. Detección Difusa (Fuzzy Matching) de Entidad en el Esquema
    final entityMatch = _matchEntity(tokens, schema.entities);
    final DynamicEntity? entity = entityMatch?['entity'] as DynamicEntity?;

    // Si la intención es desconocida pero se detectó una entidad válida del negocio,
    // por lógica conversacional el usuario está pidiendo consultar dicha entidad
    if (intent == CrudIntent.unknown && entity != null) {
      intent = CrudIntent.read;
    }

    // 3. Extracción de ID
    String? targetId = _extractId(clean, intent);

    // 4. Extracción Dinámica de Atributos según los campos de la entidad
    final extractedPayload = <String, dynamic>{};
    String? mainSubject;

    if (entity != null) {
      mainSubject = _extractMainSubject(text, clean, entity);
      _extractFieldValues(clean, text, entity, extractedPayload, mainSubject);
    }

    return NluParseResult(
      intent: intent,
      matchedEntity: entity,
      targetId: targetId,
      mainSubject: mainSubject,
      extractedPayload: extractedPayload,
      confidence: entityMatch != null ? (entityMatch['score'] as double) : 0.0,
    );
  }

  // ==========================================
  // DETECCIÓN DE INTENCIÓN (AMPLIADA)
  // ==========================================

  CrudIntent _detectIntent(String text) {
    // Primero verificar ayuda / saludo
    if (_containsAny(text, [
      'ayuda', 'help', 'que puedes hacer', 'opciones', 'como funciona',
      'que sabes hacer', 'que haces', 'instrucciones', 'comandos',
    ])) {
      return CrudIntent.help;
    }

    // DELETE antes de CREATE porque "elimina" contiene "a" que podría confundir
    if (_containsAny(text, [
      'elimina', 'eliminar', 'borra', 'borrar', 'quita', 'quitar',
      'remover', 'remueve', 'suprime', 'suprimir', 'descarta',
      'da de baja', 'dar de baja',
    ])) {
      return CrudIntent.delete;
    }

    if (_containsAny(text, [
      'actualiza', 'actualizar', 'modifica', 'modificar', 'cambia', 'cambiar',
      'edita', 'editar', 'corrige', 'corregir', 'establece', 'establecer',
      'asigna', 'asignar', 'renombra', 'renombrar',
      'sube el precio', 'baja el precio', 'pon precio', 'cambia el nombre',
      'pon el nombre',
    ])) {
      return CrudIntent.update;
    }

    if (_containsAny(text, [
      'crea', 'crear', 'registra', 'registrar', 'agrega', 'agregar',
      'nuevo', 'nueva', 'inserta', 'insertar', 'anade', 'anadir',
      'ingresa', 'ingresar', 'guarda', 'guardar', 'mete', 'meter',
      'da de alta', 'dar de alta',
    ])) {
      return CrudIntent.create;
    }

    if (_containsAny(text, [
      'consulta', 'consultar', 'muestra', 'mostrar', 'cuantos', 'cuantas',
      'lista', 'listar', 'busca', 'buscar', 'precio de', 'stock de',
      'ver', 'dame', 'cual es', 'cuales son', 'hay', 'existe',
      'informacion', 'info', 'detalle', 'detalles', 'dime',
      'cuanto cuesta', 'cuanto vale', 'cuanto tiene',
      'datos', 'que datos', 'tenemos', 'sabemos', 'quien es', 'quienes son',
      'que hay', 'sobre', 'acerca de', 'historial', 'reporte', 'registro',
    ])) {
      return CrudIntent.read;
    }

    return CrudIntent.unknown;
  }

  // ==========================================
  // FUZZY MATCHING CON LEVENSHTEIN DISTANCE
  // ==========================================

  Map<String, dynamic>? _matchEntity(List<String> tokens, List<DynamicEntity> entities) {
    DynamicEntity? bestEntity;
    double maxScore = 0.0;

    for (var entity in entities) {
      double entityScore = 0.0;

      // Candidatos principales: nombre y label de la entidad (mayor peso)
      final nameCandidates = <String>[
        entity.name.toLowerCase(),
        entity.label.toLowerCase(),
        entity.endpoint.split('/').last.toLowerCase(),
      ];

      // Candidatos secundarios: nombres de campos (menor peso)
      final fieldCandidates = <String>[];
      for (var f in entity.fields) {
        fieldCandidates.add(f.name.toLowerCase());
        if (f.label.toLowerCase() != f.name.toLowerCase()) {
          fieldCandidates.add(f.label.toLowerCase());
        }
      }

      for (var token in tokens) {
        if (_isStopWord(token)) continue;

        // Comparar con nombre/label de entidad (score alto)
        for (var candidate in nameCandidates) {
          if (candidate.contains(token) || token.contains(candidate)) {
            entityScore = math.max(entityScore, 0.95);
          }
          if (_isPlural(token, candidate)) {
            entityScore = math.max(entityScore, 0.95);
          }
          final sim = _tokenSimilarity(token, candidate);
          if (sim >= 0.75) {
            entityScore = math.max(entityScore, sim);
          }
        }

        // Comparar con campos (score menor, 0.6x del valor)
        for (var candidate in fieldCandidates) {
          if (candidate.contains(token) || token.contains(candidate)) {
            entityScore = math.max(entityScore, 0.60);
          }
        }
      }

      if (entityScore > maxScore) {
        maxScore = entityScore;
        bestEntity = entity;
      }
    }

    if (bestEntity != null && maxScore >= 0.55) {
      return {'entity': bestEntity, 'score': maxScore};
    }
    return null;
  }

  /// Verifica si dos palabras son singular/plural
  bool _isPlural(String s1, String s2) {
    if (s1 == s2) return true;
    // producto/productos, categoria/categorias
    if ('${s1}s' == s2 || '${s2}s' == s1) return true;
    // doctor/doctores, orden/ordenes
    if ('${s1}es' == s2 || '${s2}es' == s1) return true;
    return false;
  }

  /// Calcula la similitud entre dos palabras normalizadas (0.0 a 1.0)
  double _tokenSimilarity(String s1, String s2) {
    if (s1 == s2) return 1.0;
    if (_isPlural(s1, s2)) return 0.95;

    final dist = _levenshteinDistance(s1, s2);
    final maxLen = math.max(s1.length, s2.length);
    if (maxLen == 0) return 1.0;
    return (1.0 - (dist / maxLen)).clamp(0.0, 1.0);
  }

  /// Distancia clásica de edición de Levenshtein
  int _levenshteinDistance(String s, String t) {
    if (s == t) return 0;
    if (s.isEmpty) return t.length;
    if (t.isEmpty) return s.length;

    List<int> v0 = List<int>.generate(t.length + 1, (i) => i);
    List<int> v1 = List<int>.filled(t.length + 1, 0);

    for (int i = 0; i < s.length; i++) {
      v1[0] = i + 1;
      for (int j = 0; j < t.length; j++) {
        int cost = (s[i] == t[j]) ? 0 : 1;
        v1[j + 1] = math.min(v1[j] + 1, math.min(v0[j + 1] + 1, v0[j] + cost));
      }
      for (int j = 0; j < t.length + 1; j++) {
        v0[j] = v1[j];
      }
    }
    return v1[t.length];
  }

  // ==========================================
  // EXTRACCIÓN DE DATOS
  // ==========================================

  String? _extractId(String clean, CrudIntent intent) {
    final idMatch = RegExp(r'(?:id|numero|#)\s*(\d+)').firstMatch(clean);
    if (idMatch != null) return idMatch.group(1);

    // Para delete/update, buscar número aislado
    if (intent == CrudIntent.delete || intent == CrudIntent.update) {
      final isolatedNum = RegExp(r'\b(\d+)\b').firstMatch(clean);
      if (isolatedNum != null) return isolatedNum.group(1);
    }
    return null;
  }

  String? _extractMainSubject(String originalText, String clean, DynamicEntity entity) {
    // 1. Si el usuario dijo explícitamente "con nombre X" o "llamado X" o "nombre es X"
    final explicitNameMatch = RegExp(
      r'(?:con\s+nombre|de\s+nombre|llamado|llamada|nombre(?:\s+es)?)\s+([A-Za-zÀ-ÿ0-9\s]+?)(?:\s+con|\s+de|\s+en|\s+y|\s+para|\?|$)',
      caseSensitive: false,
    ).firstMatch(originalText);

    if (explicitNameMatch != null) {
      String name = explicitNameMatch.group(1)?.trim() ?? '';
      name = _cleanPrefixes(name);
      if (name.isNotEmpty && !_isStopWord(name.toLowerCase())) {
        return name;
      }
    }

    // 2. Extraer sujeto principal tras la mención de la entidad
    final entityName = entity.name.toLowerCase();
    final patterns = [
      RegExp('(?:$entityName|nuevo|nueva)\\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\\s]*?)(?:\\s+con|\\s+precio|\\s+tarifa|\\s+stock|\\s+edad|\\s+email|\\s+correo|\\s+a\\s+\\d|\\s+en\\s|\\s+para\\s|\\?|\$)', caseSensitive: false),
    ];

    for (var pattern in patterns) {
      final match = pattern.firstMatch(originalText);
      if (match != null) {
        var subject = match.group(1)?.trim() ?? '';
        subject = _cleanPrefixes(subject);
        if (subject.isNotEmpty && !_isStopWord(subject.toLowerCase())) {
          return subject;
        }
      }
    }
    return null;
  }

  String _cleanPrefixes(String text) {
    var out = text.trim();
    out = out.replaceAll(RegExp(r'[¿?¡!,;:]'), '');
    out = out.replaceAll(RegExp(r'^(con\s+nombre\s+(?:de\s+)?|con\s+el\s+nombre\s+(?:de\s+)?|nombre\s+(?:es\s+)?|llamado\s+|llamada\s+|de\s+nombre\s+)', caseSensitive: false), '');
    out = out.replaceAll(RegExp(r'^(del\s+|de\s+|el\s+|la\s+|un\s+|una\s+)', caseSensitive: false), '');
    return out.trim();
  }

  void _extractFieldValues(
    String clean, String originalText, DynamicEntity entity,
    Map<String, dynamic> payload, String? mainSubject,
  ) {
    // 1. Extraer Email/Correo si existe algún campo para ello
    final emailField = entity.fields.where((f) {
      final n = f.name.toLowerCase();
      return n.contains('email') || n.contains('correo');
    }).firstOrNull;

    if (emailField != null) {
      final emailMatch = RegExp(r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})')
          .firstMatch(originalText);
      if (emailMatch != null) {
        payload[emailField.name] = emailMatch.group(1)!.trim();
      }
    }

    // 2. Extraer campos restantes
    for (var field in entity.fields) {
      if (field.primaryKey) continue;
      final fNameLower = field.name.toLowerCase();
      final fLabelLower = field.label.toLowerCase();
      final fieldType = field.type.toLowerCase();

      // Si ya se extrajo (como el email), continuar
      if (payload.containsKey(field.name)) continue;

      // Campo principal de texto: usar mainSubject
      if (mainSubject != null &&
          (fNameLower.contains('nombre') || fieldType == 'string') &&
          !payload.values.contains(mainSubject)) {
        payload[field.name] = mainSubject;
        continue;
      }

      // Campos numéricos (edad, precio, tarifa, stock, cantidad, etc.)
      if (fieldType.contains('double') || fieldType.contains('float') ||
          fieldType.contains('int') || fieldType.contains('long') ||
          fieldType.contains('bigdecimal') || fieldType.contains('integer')) {
        final numPatterns = [
          RegExp('(?:$fNameLower|$fLabelLower)\\s*(?:de|es|a|en|:)?\\s*(\\d+(?:\\.\\d+)?)'),
          RegExp('(?:edad|precio|tarifa|costo|stock|cantidad|monto|total|valor)\\s*(?:de|es|a|en|:)?\\s*(\\d+(?:\\.\\d+)?)'),
          RegExp('(?:a|por|vale|cuesta)\\s+(\\d+(?:\\.\\d+)?)'),
        ];

        for (var pattern in numPatterns) {
          final match = pattern.firstMatch(clean);
          if (match != null) {
            final valStr = match.group(1)!;
            if (fieldType.contains('double') || fieldType.contains('float') || fieldType.contains('bigdecimal')) {
              payload[field.name] = double.tryParse(valStr) ?? 0.0;
            } else {
              payload[field.name] = int.tryParse(valStr) ?? 0;
            }
            break;
          }
        }
      }

      // Campos fecha
      if (fieldType.contains('date') || fieldType.contains('localdate')) {
        if (!payload.containsKey(field.name)) {
          payload[field.name] = DateTime.now().toIso8601String().split('T').first;
        }
      }

      // Campos String secundarios (buscar mención explícita)
      if (fieldType == 'string' && !payload.containsKey(field.name)) {
        final textMatch = RegExp(
          '(?:$fNameLower|$fLabelLower)\\s*(?:es|de|:)?\\s*([A-Za-zÀ-ÿ0-9._%+-@]+)',
        ).firstMatch(originalText);
        if (textMatch != null) {
          String val = textMatch.group(1)!.trim();
          val = _cleanPrefixes(val);
          if (val.isNotEmpty) {
            payload[field.name] = val;
          }
        }
      }
    }
  }

  // ==========================================
  // EJECUCIÓN OFFLINE-FIRST (GET / POST / PUT / DELETE)
  // ==========================================

  Future<ChatMessage> _handleRead(NluParseResult parse, String input) async {
    final entity = parse.matchedEntity ?? _activeSchema.entities.firstOrNull;
    if (entity == null) {
      return _msg('No hay entidades definidas en el esquema para consultar.');
    }

    final isOnline = await apiService.testConnection();

    if (isOnline) {
      final response = await apiService.get(entity.endpoint);
      if (response.isSuccess && response.data is List) {
        final List<dynamic> list = response.data;
        await databaseService.cacheEntityList(entity.name, list);
        return _formatReadResponse(entity, list, parse.mainSubject, isOffline: false);
      }
    }

    // Modo Offline: Lectura directa de entity_cache
    debugPrint('Modo Offline: consultando entity_cache para "${entity.name}"...');
    final cached = await databaseService.getCachedEntities(entity.name, filterQuery: parse.mainSubject);

    if (cached.isNotEmpty) {
      return _formatReadResponse(entity, cached, parse.mainSubject, isOffline: true);
    } else {
      return ChatMessage(
        id: _genId(),
        text: '🔴 Modo sin conexión: No hay registros locales guardados para ${entity.label}. '
            'Conéctate una vez al servidor para sincronizar los datos.',
        isUser: false,
        timestamp: DateTime.now(),
        status: MessageStatus.offlineQueued,
      );
    }
  }

  ChatMessage _formatReadResponse(DynamicEntity entity, List<dynamic> items, String? filter, {required bool isOffline}) {
    final prefix = isOffline ? '🟠 [Offline] ' : '🟢 [En línea] ';
    final status = isOffline ? MessageStatus.offlineQueued : MessageStatus.online;

    // Búsqueda filtrada por nombre
    if (filter != null && filter.isNotEmpty) {
      final matched = items.where((item) {
        if (item is! Map<String, dynamic>) return false;
        return item.values.any((v) => v != null && v.toString().toLowerCase().contains(filter.toLowerCase()));
      }).toList();

      if (matched.isNotEmpty) {
        final item = matched.first as Map<String, dynamic>;
        final details = item.entries
            .where((e) => e.value != null && e.key != 'id')
            .map((e) => '  • ${e.key}: ${e.value}')
            .join('\n');
        return ChatMessage(
          id: _genId(),
          text: '$prefix Encontré "$filter" en ${entity.label}:\n$details',
          isUser: false,
          timestamp: DateTime.now(),
          status: status,
          structuredData: item,
        );
      }
    }

    // Listar todos
    final count = items.length;
    final preview = items.take(5).map((i) {
      if (i is Map<String, dynamic>) {
        final title = i['nombre'] ?? i['nombreComercial'] ?? i['cliente'] ?? i['titulo'] ?? i['id'] ?? 'Registro';
        final extra = i.entries
            .where((e) => e.key != 'nombre' && e.key != 'id' && e.value != null)
            .take(2)
            .map((e) => '${e.key}: ${e.value}')
            .join(' | ');
        return '  • $title ${extra.isNotEmpty ? "($extra)" : ""}';
      }
      return '  • $i';
    }).join('\n');

    final moreText = count > 5 ? '\n  ...y ${count - 5} más.' : '';

    return ChatMessage(
      id: _genId(),
      text: '$prefix Hay $count registros de ${entity.label}:\n$preview$moreText',
      isUser: false,
      timestamp: DateTime.now(),
      status: status,
      listData: items,
    );
  }

  Future<ChatMessage> _handleCreate(NluParseResult parse, String input) async {
    final entity = parse.matchedEntity!;
    final payload = Map<String, dynamic>.from(parse.extractedPayload);

    // Intentar resolver relaciones FK
    await _resolveRelationships(entity, payload, input);

    return await _dispatchOrEnqueueMutation(
      endpoint: entity.endpoint,
      method: 'POST',
      payload: payload,
      successMessage: '✅ ${entity.label} creado exitosamente${_summarizePayload(payload)}.',
      entityName: entity.name,
    );
  }

  Future<ChatMessage> _handleUpdate(NluParseResult parse, String input) async {
    final entity = parse.matchedEntity!;
    final id = parse.targetId;
    if (id == null) {
      return _msg('Para actualizar necesito el ID. Ejemplo: "Actualiza ${entity.name} id 5 con nombre NuevoNombre"');
    }
    final endpoint = '${entity.endpoint}/$id';
    final payload = Map<String, dynamic>.from(parse.extractedPayload);

    return await _dispatchOrEnqueueMutation(
      endpoint: endpoint,
      method: 'PUT',
      payload: payload,
      successMessage: '✅ ${entity.label} #$id actualizado correctamente${_summarizePayload(payload)}.',
      entityName: entity.name,
    );
  }

  Future<ChatMessage> _handleDelete(NluParseResult parse, String input) async {
    final entity = parse.matchedEntity!;
    final id = parse.targetId;
    if (id == null) {
      return _msg('Para eliminar necesito el ID. Ejemplo: "Elimina ${entity.name} id 3"');
    }
    final endpoint = '${entity.endpoint}/$id';

    return await _dispatchOrEnqueueMutation(
      endpoint: endpoint,
      method: 'DELETE',
      payload: {},
      successMessage: '✅ ${entity.label} #$id eliminado del sistema.',
      entityName: entity.name,
    );
  }

  // ==========================================
  // RESOLUCIÓN DE RELACIONES FK
  // ==========================================

  Future<void> _resolveRelationships(DynamicEntity entity, Map<String, dynamic> payload, String input) async {
    final clean = _normalizeText(input);

    for (var otherEntity in _activeSchema.entities) {
      if (otherEntity.name == entity.name) continue;

      final otherNameLower = otherEntity.name.toLowerCase();
      // Buscar mención de otra entidad: "en categoría X", "de categoría X", "a cliente X"
      final refMatch = RegExp(
        '(?:en|de|del|a|al|para)\\s+(?:la\\s+|el\\s+)?$otherNameLower\\s+([A-Za-zÀ-ÿ0-9]+)',
      ).firstMatch(clean);

      if (refMatch != null) {
        final refName = refMatch.group(1)?.trim();
        if (refName != null && refName.isNotEmpty) {
          // Intentar buscar por nombre en la entidad referenciada
          try {
            final isOnline = await apiService.testConnection();
            if (isOnline) {
              final response = await apiService.get(otherEntity.endpoint);
              if (response.isSuccess && response.data is List) {
                final List<dynamic> items = response.data;
                final match = items.firstWhere(
                  (item) {
                    if (item is! Map<String, dynamic>) return false;
                    return item.values.any((v) =>
                        v != null && v.toString().toLowerCase().contains(refName.toLowerCase()));
                  },
                  orElse: () => null,
                );
                if (match != null && match is Map<String, dynamic>) {
                  payload[otherNameLower] = {'id': match['id']};
                  continue;
                }
              }
            }
          } catch (e) {
            debugPrint('Error resolviendo FK para $otherNameLower: $e');
          }
          // Si no se pudo resolver online, incluir como referencia
          payload[otherNameLower] = {'id': 1};
        }
      }
    }
  }

  // ==========================================
  // DISPATCH O ENCOLAR MUTACIÓN
  // ==========================================

  Future<ChatMessage> _dispatchOrEnqueueMutation({
    required String endpoint,
    required String method,
    required Map<String, dynamic> payload,
    required String successMessage,
    required String entityName,
  }) async {
    final isOnline = await apiService.testConnection();

    if (isOnline) {
      ApiResponse response;
      if (method == 'POST') {
        response = await apiService.post(endpoint, payload);
      } else if (method == 'PUT') {
        response = await apiService.put(endpoint, payload);
      } else {
        response = await apiService.delete(endpoint);
      }

      if (response.isSuccess) {
        // Refrescar caché local
        final baseEndpoint = _activeSchema.entities
            .firstWhere((e) => e.name == entityName, orElse: () => _activeSchema.entities.first)
            .endpoint;
        apiService.get(baseEndpoint, entityTypeToCache: entityName);

        return ChatMessage(
          id: _genId(),
          text: successMessage,
          isUser: false,
          timestamp: DateTime.now(),
          status: MessageStatus.online,
          structuredData: payload.isNotEmpty ? payload : null,
        );
      } else {
        return ChatMessage(
          id: _genId(),
          text: '❌ Error del servidor: ${response.errorMessage ?? "Error desconocido"}.\nDatos enviados: ${jsonEncode(payload)}',
          isUser: false,
          timestamp: DateTime.now(),
          status: MessageStatus.error,
        );
      }
    }

    // Sin conexión: encolar en SQLite
    final op = SyncOperation(
      endpoint: endpoint,
      method: method,
      payload: jsonEncode(payload),
      timestamp: DateTime.now().toIso8601String(),
      status: 'PENDING',
    );
    await databaseService.enqueueOperation(op);

    return ChatMessage(
      id: _genId(),
      text: '🟠 Sin conexión. Guardado localmente y se sincronizará automáticamente cuando vuelva la red.\nDatos: ${_summarizePayload(payload)}',
      isUser: false,
      timestamp: DateTime.now(),
      status: MessageStatus.offlineQueued,
      structuredData: payload.isNotEmpty ? payload : null,
    );
  }

  // ==========================================
  // RESPUESTAS DE AYUDA
  // ==========================================

  ChatMessage _buildHelpResponse() {
    if (_activeSchema.entities.isEmpty) {
      return _msg(
        '¡Hola! Soy tu asistente universal.\n\n'
        '⚠️ No hay ningún esquema de negocio configurado aún.\n'
        'Ve a ⚙️ Ajustes y configura la URL de tu backend Spring Boot, '
        'o selecciona un preset de negocio.\n\n'
        'Una vez configurado, podré ayudarte a gestionar los datos por voz o texto.',
      );
    }

    final entityList = _activeSchema.entities.map((e) {
      final fields = e.fields.where((f) => !f.primaryKey).map((f) => f.label).take(3).join(', ');
      return '  📦 ${e.label} ($fields)';
    }).join('\n');

    final firstEntity = _activeSchema.entities.first;
    final firstName = firstEntity.name;

    return _msg(
      '¡Hola! Soy tu asistente para "${_activeSchema.businessName}".\n\n'
      'Entidades disponibles:\n$entityList\n\n'
      '📝 Ejemplos de comandos:\n'
      '  • "Agrega $firstName con nombre Ejemplo"\n'
      '  • "Muestra los ${firstEntity.label}"\n'
      '  • "Actualiza $firstName id 3 con nombre NuevoNombre"\n'
      '  • "Elimina $firstName id 5"\n\n'
      'Puedes hablarme o escribirme. ¡Prueba!',
    );
  }

  ChatMessage _buildUnknownResponse() {
    final entities = _activeSchema.entities.map((e) => e.label).join(', ');
    return _msg(
      'No entendí el comando. Prueba con:\n'
      '  • "Agrega..." / "Crea..." / "Registra..."\n'
      '  • "Muestra..." / "Lista..." / "Busca..."\n'
      '  • "Actualiza... id X con..."\n'
      '  • "Elimina... id X"\n'
      '  • "Ayuda"\n\n'
      'Entidades: $entities',
    );
  }

  // ==========================================
  // UTILITARIOS
  // ==========================================

  String _normalizeText(String text) {
    var out = text.toLowerCase().trim();
    out = out.replaceAll(RegExp(r'[áàäâ]'), 'a');
    out = out.replaceAll(RegExp(r'[éèëê]'), 'e');
    out = out.replaceAll(RegExp(r'[íìïî]'), 'i');
    out = out.replaceAll(RegExp(r'[óòöô]'), 'o');
    out = out.replaceAll(RegExp(r'[úùüû]'), 'u');
    out = out.replaceAll(RegExp(r'[¿?¡!,;:]'), '');
    out = out.replaceAll('ñ', 'n');
    return out;
  }

  bool _containsAny(String text, List<String> terms) {
    return terms.any((t) => text.contains(t));
  }

  bool _isStopWord(String word) {
    const stops = {
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del',
      'a', 'al', 'en', 'para', 'con', 'por', 'que', 'es', 'son', 'y', 'o',
      'se', 'me', 'te', 'le', 'lo', 'su', 'mi', 'tu', 'nos',
    };
    return stops.contains(word);
  }

  String _genId() => DateTime.now().millisecondsSinceEpoch.toString();

  String _summarizePayload(Map<String, dynamic> payload) {
    if (payload.isEmpty) return '';
    final parts = payload.entries
        .where((e) => e.value != null)
        .take(3)
        .map((e) => '${e.key}: ${e.value}')
        .join(', ');
    return ' ($parts)';
  }

  ChatMessage _msg(String text) {
    return ChatMessage(
      id: _genId(),
      text: text,
      isUser: false,
      timestamp: DateTime.now(),
      status: MessageStatus.none,
    );
  }
}
