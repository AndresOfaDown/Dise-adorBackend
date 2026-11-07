import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/uml_diagram_model.dart';

enum ConnectionStateStatus {
  disconnected,
  connecting,
  connected,
  error,
}

class DiagramMonitorService with ChangeNotifier {
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;

  ConnectionStateStatus _status = ConnectionStateStatus.disconnected;
  ConnectionStateStatus get status => _status;

  String? _currentProjectId;
  String? get currentProjectId => _currentProjectId;

  String _host = '127.0.0.1:8000';
  String get host => _host;

  List<UmlClassNode> _nodes = [];
  List<UmlClassNode> get nodes => _nodes;

  List<UmlEdge> _edges = [];
  List<UmlEdge> get edges => _edges;

  final List<TeamChatMessage> _messages = [];
  List<TeamChatMessage> get messages => _messages;

  final List<String> _notifications = [];
  List<String> get notifications => _notifications;

  bool _isAiTyping = false;
  bool get isAiTyping => _isAiTyping;
  String? _aiTypingFor;
  String? get aiTypingFor => _aiTypingFor;

  List<Map<String, dynamic>> _collaborators = [];
  List<Map<String, dynamic>> get collaborators => _collaborators;

  void setHost(String newHost) {
    _host = newHost.trim().replaceAll('http://', '').replaceAll('https://', '').replaceAll('ws://', '').replaceAll('wss://', '');
    if (_host.endsWith('/')) {
      _host = _host.substring(0, _host.length - 1);
    }
    notifyListeners();
  }

  void connect(String projectId, {String username = 'Monitor Móvil', String? token}) {
    disconnect();

    _currentProjectId = projectId;
    _status = ConnectionStateStatus.connecting;
    notifyListeners();

    // 1. Carga inmediata por REST API (Diagrama e Historial de Chat previo)
    _fetchInitialData(projectId, token);

    // 2. Conectar al canal WebSocket en tiempo real
    try {
      final wsUrl = Uri.parse(
        'ws://$_host/ws/diagrama/$projectId/?username=${Uri.encodeComponent(username)}&clientId=movil_${DateTime.now().millisecondsSinceEpoch}',
      );

      debugPrint('Conectando WebSocket Móvil: $wsUrl');
      _channel = WebSocketChannel.connect(wsUrl);

      _subscription = _channel!.stream.listen(
        (data) {
          _handleIncomingMessage(data);
        },
        onDone: () {
          debugPrint('WebSocket desconectado');
          _status = ConnectionStateStatus.disconnected;
          notifyListeners();
        },
        onError: (err) {
          debugPrint('Error en WebSocket: $err');
          _status = ConnectionStateStatus.error;
          notifyListeners();
        },
      );

      _status = ConnectionStateStatus.connected;
      _addNotification('Conectado a la sala del proyecto #$projectId');
      notifyListeners();
    } catch (e) {
      debugPrint('Excepción al conectar WebSocket: $e');
      _status = ConnectionStateStatus.error;
      notifyListeners();
    }
  }

  Future<void> _fetchInitialData(String projectId, String? token) async {
    // A. Cargar historial de chat previo de la sala
    try {
      final histUri = Uri.parse('http://$_host/api/ia/historial/$projectId/');
      final histRes = await http.get(histUri).timeout(const Duration(seconds: 4));
      if (histRes.statusCode == 200) {
        final json = jsonDecode(histRes.body);
        final rawList = json['messages'] as List? ?? [];
        if (rawList.isNotEmpty) {
          _mergeChatHistory(rawList);
        }
      }
    } catch (e) {
      debugPrint('Error obteniendo historial inicial por HTTP: $e');
    }

    // B. Cargar estado inicial del diagrama (clases y relaciones)
    try {
      final diagUri = Uri.parse('http://$_host/api/projects/$projectId/diagrama/');
      final headers = <String, String>{};
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
      final diagRes = await http.get(diagUri, headers: headers).timeout(const Duration(seconds: 4));
      if (diagRes.statusCode == 200) {
        final json = jsonDecode(diagRes.body);
        final diag = json['diagrama'] as Map<String, dynamic>?;
        if (diag != null && _nodes.isEmpty) {
          final rawNodes = diag['nodes'] as List? ?? [];
          final rawEdges = diag['edges'] as List? ?? [];
          _nodes = rawNodes
              .where((n) => n['type'] == 'umlClass')
              .map((n) => UmlClassNode.fromMap(n as Map<String, dynamic>))
              .toList();
          _edges = rawEdges
              .map((e) => UmlEdge.fromMap(e as Map<String, dynamic>))
              .toList();
          // Estado inicial cargado (no generar notificación de movimiento)
          notifyListeners();
        }
      }
    } catch (e) {
      debugPrint('Error obteniendo diagrama inicial por HTTP: $e');
    }

    // C. Cargar historial de cambios relevantes iniciales (CU-12)
    try {
      final auditUri = Uri.parse('http://$_host/api/projects/$projectId/historial-cambios/');
      final auditRes = await http.get(auditUri).timeout(const Duration(seconds: 4));
      if (auditRes.statusCode == 200) {
        final json = jsonDecode(auditRes.body);
        final rawAudit = json['historial'] as List? ?? [];
        for (final item in rawAudit) {
          final desc = item['descripcion']?.toString() ?? '';
          final createdAt = item['created_at']?.toString() ?? '';
          String timeStr = '';
          try {
            final dt = DateTime.parse(createdAt).toLocal();
            timeStr = '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
          } catch (_) {
            timeStr = '--:--';
          }
          if (desc.isNotEmpty) {
            final formatted = '[$timeStr] $desc';
            if (!_notifications.contains(formatted)) {
              _notifications.add(formatted);
            }
          }
        }
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Error obteniendo auditoría para notificaciones: $e');
    }
  }

  void _mergeChatHistory(List<dynamic> rawList) {
    final Set<String> existingIds = _messages.map((m) => m.id).toSet();
    bool added = false;
    for (final item in rawList) {
      if (item is Map<String, dynamic>) {
        final msg = TeamChatMessage.fromMap(item);
        if (!existingIds.contains(msg.id)) {
          _messages.add(msg);
          existingIds.add(msg.id);
          added = true;
        }
      }
    }
    if (added) {
      notifyListeners();
    }
  }

  void disconnect() {
    _subscription?.cancel();
    _channel?.sink.close();
    _subscription = null;
    _channel = null;
    _status = ConnectionStateStatus.disconnected;
    notifyListeners();
  }

  void _handleIncomingMessage(dynamic rawData) {
    try {
      final Map<String, dynamic> msg = jsonDecode(rawData as String);
      final String type = msg['type']?.toString() ?? '';

      switch (type) {
        case 'audit_change_event':
          final change = msg['change'] as Map<String, dynamic>? ?? {};
          final desc = change['descripcion']?.toString() ?? '';
          if (desc.isNotEmpty) {
            _addNotification(desc);
            notifyListeners();
          }
          break;

        case 'diagram_update':
          final rawNodes = msg['nodes'] as List? ?? [];
          final rawEdges = msg['edges'] as List? ?? [];
          
          final newNodes = rawNodes
              .where((n) => n['type'] == 'umlClass')
              .map((n) => UmlClassNode.fromMap(n as Map<String, dynamic>))
              .toList();

          final newEdges = rawEdges
              .map((e) => UmlEdge.fromMap(e as Map<String, dynamic>))
              .toList();

          // Detección inteligente de cambios estructurales (clases, atributos, métodos, relaciones)
          // Ignora por completo movimientos de posición (drag/move)
          if (_nodes.isNotEmpty) {
            _detectStructuralChanges(_nodes, newNodes, _edges, newEdges);
          }

          _nodes = newNodes;
          _edges = newEdges;

          notifyListeners();
          break;

        case 'chat_history':
          final rawMessages = msg['messages'] as List? ?? [];
          _mergeChatHistory(rawMessages);
          break;

        case 'team_ai_message':
          final chatMsg = TeamChatMessage.fromMap(msg);
          // Evitar duplicados por id
          if (!_messages.any((m) => m.id == chatMsg.id)) {
            _messages.add(chatMsg);
          }
          _isAiTyping = false;
          _aiTypingFor = null;

          if (chatMsg.role == 'assistant') {
            _addNotification('🤖 IA Senior intervino en la sala');
          }
          notifyListeners();
          break;

        case 'team_ai_typing':
          _isAiTyping = msg['isTyping'] == true;
          _aiTypingFor = msg['user']?.toString();
          notifyListeners();
          break;

        case 'presence_update':
        case 'presence_state':
          final list = (msg['users'] ?? msg['collaborators']) as List? ?? [];
          _collaborators = list.map((c) => c as Map<String, dynamic>).toList();
          notifyListeners();
          break;

        case 'project_rename':
          final newName = msg['name']?.toString() ?? '';
          _addNotification('Proyecto renombrado a: $newName');
          notifyListeners();
          break;
      }
    } catch (e) {
      debugPrint('Error parseando mensaje WebSocket en móvil: $e');
    }
  }

  void _detectStructuralChanges(
    List<UmlClassNode> oldNodes,
    List<UmlClassNode> newNodes,
    List<UmlEdge> oldEdges,
    List<UmlEdge> newEdges,
  ) {
    final oldMap = {for (var n in oldNodes) n.id: n};
    final newMap = {for (var n in newNodes) n.id: n};

    // 1. Clases agregadas
    for (var n in newNodes) {
      if (!oldMap.containsKey(n.id)) {
        _addNotification('Nueva clase agregada: \'${n.name}\'');
      }
    }

    // 2. Clases eliminadas
    for (var n in oldNodes) {
      if (!newMap.containsKey(n.id)) {
        _addNotification('Clase eliminada: \'${n.name}\'');
      }
    }

    // 3. Modificaciones estructurales en clases existentes
    for (var entry in newMap.entries) {
      final oldNode = oldMap[entry.key];
      final newNode = entry.value;
      if (oldNode == null) continue;

      // a) Cambio de nombre de clase
      if (oldNode.name != newNode.name) {
        _addNotification('Clase renombrada: \'${oldNode.name}\' ➔ \'${newNode.name}\'');
      }

      // b) Atributos
      if (newNode.attributes.length > oldNode.attributes.length) {
        final added = newNode.attributes
            .where((na) => !oldNode.attributes.any((oa) => oa.name == na.name))
            .map((a) => a.name)
            .join(', ');
        _addNotification('Atributo añadido en \'${newNode.name}\': ${added.isEmpty ? 'nuevo atributo' : added}');
      } else if (newNode.attributes.length < oldNode.attributes.length) {
        final removed = oldNode.attributes
            .where((oa) => !newNode.attributes.any((na) => na.name == oa.name))
            .map((a) => a.name)
            .join(', ');
        _addNotification('Atributo eliminado en \'${newNode.name}\': ${removed.isEmpty ? 'atributo' : removed}');
      } else {
        for (int i = 0; i < newNode.attributes.length; i++) {
          if (i < oldNode.attributes.length) {
            if (oldNode.attributes[i].name != newNode.attributes[i].name ||
                oldNode.attributes[i].type != newNode.attributes[i].type) {
              _addNotification('Atributo modificado en \'${newNode.name}\': ${newNode.attributes[i].name}');
              break;
            }
          }
        }
      }

      // c) Métodos
      if (newNode.methods.length > oldNode.methods.length) {
        final added = newNode.methods
            .where((nm) => !oldNode.methods.any((om) => om.name == nm.name))
            .map((m) => m.name)
            .join(', ');
        _addNotification('Método añadido en \'${newNode.name}\': ${added.isEmpty ? 'nuevo método' : '$added()'}');
      } else if (newNode.methods.length < oldNode.methods.length) {
        final removed = oldNode.methods
            .where((om) => !newNode.methods.any((nm) => nm.name == om.name))
            .map((m) => m.name)
            .join(', ');
        _addNotification('Método eliminado en \'${newNode.name}\': ${removed.isEmpty ? 'método' : '$removed()'}');
      } else {
        for (int i = 0; i < newNode.methods.length; i++) {
          if (i < oldNode.methods.length) {
            if (oldNode.methods[i].name != newNode.methods[i].name) {
              _addNotification('Método modificado en \'${newNode.name}\': ${newNode.methods[i].name}()');
              break;
            }
          }
        }
      }
    }

    // 4. Relaciones
    if (newEdges.length > oldEdges.length) {
      _addNotification('Nueva relación agregada en el diagrama');
    } else if (newEdges.length < oldEdges.length) {
      _addNotification('Relación eliminada del diagrama');
    }
  }

  void _addNotification(String text) {
    final clean = text.trim();
    if (clean.isEmpty) return;

    final time = DateTime.now();
    final timeStr = '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
    final fullText = '[$timeStr] $clean';

    // Evitar notificaciones duplicadas idénticas recientes
    if (_notifications.isNotEmpty) {
      final first = _notifications.first;
      if (first.endsWith(clean) || first.contains(clean)) {
        return;
      }
    }

    _notifications.insert(0, fullText);
    if (_notifications.length > 50) {
      _notifications.removeLast();
    }
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
