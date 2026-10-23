import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/auth_project_model.dart';

class SessionService with ChangeNotifier {
  static const String _keyToken = 'auth_token';
  static const String _keyUser = 'auth_user_json';
  static const String _keyHost = 'auth_backend_host';

  String _host = '127.0.0.1:8000'; // Funciona directo vía adb reverse por USB
  String get host => _host;

  String? _token;
  String? get token => _token;

  AuthUser? _currentUser;
  AuthUser? get currentUser => _currentUser;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  List<ProjectItem> _projects = [];
  List<ProjectItem> get projects => _projects;

  bool get isAuthenticated => _token != null && _token!.isNotEmpty;

  SessionService() {
    _loadStoredSession();
  }

  void setHost(String newHost) {
    String clean = newHost.trim().replaceAll('http://', '').replaceAll('https://', '').replaceAll('ws://', '').replaceAll('wss://', '');
    if (clean.endsWith('/')) {
      clean = clean.substring(0, clean.length - 1);
    }
    _host = clean;
    SharedPreferences.getInstance().then((prefs) {
      prefs.setString(_keyHost, _host);
    });
    notifyListeners();
  }

  Future<void> _loadStoredSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedHost = prefs.getString(_keyHost);
      if (savedHost != null && savedHost.isNotEmpty) {
        _host = savedHost;
      }

      final savedToken = prefs.getString(_keyToken);
      final savedUserJson = prefs.getString(_keyUser);

      if (savedToken != null && savedToken.isNotEmpty && savedUserJson != null) {
        _token = savedToken;
        _currentUser = AuthUser.fromJson(jsonDecode(savedUserJson));
        notifyListeners();
        fetchProjects(); // Cargar proyectos automáticamente
      }
    } catch (e) {
      debugPrint('Error cargando sesión persistente: $e');
    }
  }

  Future<bool> login(String usernameOrEmail, String password) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final uri = Uri.parse('http://$_host/api/auth/login/');
      debugPrint('POST Login: $uri');

      final response = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'username': usernameOrEmail.trim(),
          'email': usernameOrEmail.trim(),
          'password': password.trim(),
        }),
      ).timeout(const Duration(seconds: 10));

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['token'] != null) {
        _token = data['token'];
        _currentUser = AuthUser.fromJson(data['user'] ?? {});

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_keyToken, _token!);
        await prefs.setString(_keyUser, jsonEncode(data['user'] ?? {}));
        await prefs.setString(_keyHost, _host);

        _isLoading = false;
        notifyListeners();

        await fetchProjects();
        return true;
      } else {
        _errorMessage = data['error'] ?? data['detail'] ?? data['message'] ?? 'Credenciales incorrectas';
        _isLoading = false;
        notifyListeners();
        return false;
      }
    } catch (e) {
      debugPrint('Error en login: $e');
      _errorMessage = 'No se pudo conectar con el servidor ($_host). Verifica la IP y que Django esté corriendo.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> fetchProjects() async {
    if (_token == null) return;

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final uri = Uri.parse('http://$_host/api/projects/');
      final response = await http.get(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Token $_token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final List<dynamic> list = jsonDecode(response.body);
        _projects = list.map((item) => ProjectItem.fromJson(item)).toList();
      } else {
        _errorMessage = 'Error al obtener proyectos: ${response.statusCode}';
      }
    } catch (e) {
      debugPrint('Error cargando proyectos: $e');
      _errorMessage = 'Error de conexión al cargar proyectos';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    _token = null;
    _currentUser = null;
    _projects = [];
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyToken);
    await prefs.remove(_keyUser);
    notifyListeners();
  }
}
