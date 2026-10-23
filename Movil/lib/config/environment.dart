import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Environment with ChangeNotifier {
  static const String _keyBaseUrl = 'backend_base_url';
  static const String defaultUrl = 'http://10.0.2.2:8080/api';

  String _baseUrl = defaultUrl;

  String get baseUrl => _baseUrl;

  Environment() {
    _loadSavedUrl();
  }

  Future<void> _loadSavedUrl() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_keyBaseUrl);
      if (saved != null && saved.trim().isNotEmpty) {
        _baseUrl = saved.trim();
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Error loading saved base URL: $e');
    }
  }

  Future<void> setBaseUrl(String newUrl) async {
    String cleanUrl = newUrl.trim();
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
    }
    _baseUrl = cleanUrl;
    notifyListeners();

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_keyBaseUrl, _baseUrl);
    } catch (e) {
      debugPrint('Error persisting base URL: $e');
    }
  }

  /// Normaliza una ruta asegurando el prefijo correcto de versión si es necesario.
  /// Ejemplos:
  /// baseUrl: "http://10.0.2.2:8080/api"
  /// endpoint: "/api/v1/productos" o "/productos" o "productos"
  /// Resultado: "http://10.0.2.2:8080/api/v1/productos"
  String buildUrl(String endpoint) {
    String cleanEndpoint = endpoint.trim();
    if (!cleanEndpoint.startsWith('/')) {
      cleanEndpoint = '/$cleanEndpoint';
    }

    // Si baseUrl ya termina con /api o /api/v1
    String base = _baseUrl;
    if (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }

    // Si el endpoint empieza con /api/v1 o /api, evitamos duplicarlo
    if (cleanEndpoint.startsWith('/api/v1/')) {
      if (base.endsWith('/api/v1')) {
        return '$base${cleanEndpoint.replaceFirst('/api/v1', '')}';
      } else if (base.endsWith('/api')) {
        return '$base${cleanEndpoint.replaceFirst('/api', '')}';
      }
    } else if (cleanEndpoint.startsWith('/api/')) {
      if (base.endsWith('/api')) {
        return '$base${cleanEndpoint.replaceFirst('/api', '')}';
      }
    } else {
      // Si el endpoint es relativo como /productos y la baseUrl es /api
      // La API de Spring Boot mapea a /api/v1/...
      if (base.endsWith('/api') && !cleanEndpoint.startsWith('/v1/')) {
        cleanEndpoint = '/v1$cleanEndpoint';
      }
    }

    return '$base$cleanEndpoint';
  }
}
