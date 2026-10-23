import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/environment.dart';
import '../models/schema_definition.dart';
import 'database_service.dart';

class ApiResponse {
  final bool isSuccess;
  final int statusCode;
  final dynamic data;
  final String? errorMessage;
  final bool isOffline;

  ApiResponse({
    required this.isSuccess,
    required this.statusCode,
    this.data,
    this.errorMessage,
    this.isOffline = false,
  });
}

class ApiService {
  final Environment environment;
  final DatabaseService dbService = DatabaseService();

  static const Duration timeoutDuration = Duration(seconds: 6);

  ApiService({required this.environment});

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

  /// Prueba rápida de conectividad hacia el backend
  Future<bool> testConnection() async {
    try {
      // Intentar con el endpoint de schema (siempre existe en backends generados)
      final url = Uri.parse(environment.buildUrl('/api/v1/schema'));
      final response = await http.get(url, headers: _headers).timeout(const Duration(seconds: 4));
      return response.statusCode >= 200 && response.statusCode < 300;
    } catch (_) {
      return false;
    }
  }

  /// Petición GET con auto-cacheo de resultados
  Future<ApiResponse> get(String endpoint, {String? entityTypeToCache}) async {
    final fullUrl = environment.buildUrl(endpoint);
    try {
      final response = await http
          .get(Uri.parse(fullUrl), headers: _headers)
          .timeout(timeoutDuration);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));

        // Cachear automáticamente si es una lista de entidades
        if (entityTypeToCache != null && decoded is List) {
          await dbService.cacheEntityList(entityTypeToCache, decoded);
        }

        return ApiResponse(
          isSuccess: true,
          statusCode: response.statusCode,
          data: decoded,
        );
      } else {
        return ApiResponse(
          isSuccess: false,
          statusCode: response.statusCode,
          errorMessage: 'Error en el servidor (${response.statusCode}): ${response.body}',
        );
      }
    } on SocketException catch (e) {
      return ApiResponse(
        isSuccess: false,
        statusCode: 0,
        errorMessage: 'Sin conexión al servidor: ${e.message}',
        isOffline: true,
      );
    } on TimeoutException {
      return ApiResponse(
        isSuccess: false,
        statusCode: 408,
        errorMessage: 'Tiempo de espera agotado al conectar con el servidor',
        isOffline: true,
      );
    } catch (e) {
      return ApiResponse(
        isSuccess: false,
        statusCode: 500,
        errorMessage: 'Excepción de red: $e',
        isOffline: true,
      );
    }
  }

  /// Petición POST
  Future<ApiResponse> post(String endpoint, Map<String, dynamic> body) async {
    final fullUrl = environment.buildUrl(endpoint);
    try {
      final response = await http
          .post(
            Uri.parse(fullUrl),
            headers: _headers,
            body: jsonEncode(body),
          )
          .timeout(timeoutDuration);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final decoded = response.body.isNotEmpty
            ? jsonDecode(utf8.decode(response.bodyBytes))
            : null;
        return ApiResponse(
          isSuccess: true,
          statusCode: response.statusCode,
          data: decoded,
        );
      } else {
        return ApiResponse(
          isSuccess: false,
          statusCode: response.statusCode,
          errorMessage: 'Error ${response.statusCode}: ${response.body}',
        );
      }
    } on SocketException catch (e) {
      return ApiResponse(
        isSuccess: false,
        statusCode: 0,
        errorMessage: 'Sin conexión: ${e.message}',
        isOffline: true,
      );
    } on TimeoutException {
      return ApiResponse(
        isSuccess: false,
        statusCode: 408,
        errorMessage: 'Tiempo agotado conectando con el servidor',
        isOffline: true,
      );
    } catch (e) {
      return ApiResponse(
        isSuccess: false,
        statusCode: 500,
        errorMessage: 'Error de conexión: $e',
        isOffline: true,
      );
    }
  }

  /// Petición PUT
  Future<ApiResponse> put(String endpoint, Map<String, dynamic> body) async {
    final fullUrl = environment.buildUrl(endpoint);
    try {
      final response = await http
          .put(
            Uri.parse(fullUrl),
            headers: _headers,
            body: jsonEncode(body),
          )
          .timeout(timeoutDuration);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        final decoded = response.body.isNotEmpty
            ? jsonDecode(utf8.decode(response.bodyBytes))
            : null;
        return ApiResponse(
          isSuccess: true,
          statusCode: response.statusCode,
          data: decoded,
        );
      } else {
        return ApiResponse(
          isSuccess: false,
          statusCode: response.statusCode,
          errorMessage: 'Error ${response.statusCode}: ${response.body}',
        );
      }
    } catch (e) {
      return ApiResponse(
        isSuccess: false,
        statusCode: 0,
        errorMessage: 'Error de red en PUT: $e',
        isOffline: true,
      );
    }
  }

  /// Petición DELETE
  Future<ApiResponse> delete(String endpoint) async {
    final fullUrl = environment.buildUrl(endpoint);
    try {
      final response = await http
          .delete(Uri.parse(fullUrl), headers: _headers)
          .timeout(timeoutDuration);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return ApiResponse(
          isSuccess: true,
          statusCode: response.statusCode,
          data: 'Eliminado con éxito',
        );
      } else {
        return ApiResponse(
          isSuccess: false,
          statusCode: response.statusCode,
          errorMessage: 'Error ${response.statusCode}: ${response.body}',
        );
      }
    } catch (e) {
      return ApiResponse(
        isSuccess: false,
        statusCode: 0,
        errorMessage: 'Error de red en DELETE: $e',
        isOffline: true,
      );
    }
  }

  /// Descubrimiento dinámico de esquemas desde el backend
  Future<DynamicSchema?> fetchSchema() async {
    try {
      final response = await get('/api/v1/schema');
      if (response.isSuccess && response.data is List) {
        final list = response.data as List;
        final schema = DynamicSchema.fromJsonList(list, businessName: 'Backend Spring Boot');
        await dbService.saveActiveSchema(schema);
        return schema;
      }
    } catch (e) {
      debugPrint('No se pudo obtener esquema online, consultando caché local: $e');
    }
    // Fallback a SQLite
    return await dbService.getActiveSchema();
  }
}
