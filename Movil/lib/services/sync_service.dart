import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import '../models/sync_operation.dart';
import 'api_service.dart';
import 'database_service.dart';

class SyncService with ChangeNotifier {
  final ApiService apiService;
  final DatabaseService databaseService = DatabaseService();

  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  Timer? _periodicTimer;

  bool _isSyncing = false;
  int _pendingCount = 0;
  bool _isConnected = true;

  bool get isSyncing => _isSyncing;
  int get pendingCount => _pendingCount;
  bool get isConnected => _isConnected;

  Function(String message)? onSyncCompleted;

  SyncService({required this.apiService}) {
    _initConnectivityListener();
    refreshPendingCount();
  }

  void _initConnectivityListener() {
    // Escucha reactiva de cambios en red
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((results) async {
      final hasNet = results.any((r) => r != ConnectivityResult.none);
      _isConnected = hasNet;
      notifyListeners();

      if (hasNet) {
        debugPrint('Conexión detectada. Verificando cola de sincronización...');
        await syncPendingQueue();
      }
    });

    // Verificación periódica ligera cada 20 segundos
    _periodicTimer = Timer.periodic(const Duration(seconds: 20), (_) async {
      await refreshPendingCount();
      if (_pendingCount > 0 && !_isSyncing) {
        await syncPendingQueue();
      }
    });
  }

  Future<void> refreshPendingCount() async {
    _pendingCount = await databaseService.getPendingCount();
    notifyListeners();
  }

  /// Despacha secuencialmente las operaciones PENDING en SQLite
  Future<int> syncPendingQueue() async {
    if (_isSyncing) return 0;

    final pendingOps = await databaseService.getPendingOperations();
    _pendingCount = pendingOps.length;
    notifyListeners();

    if (pendingOps.isEmpty) return 0;

    // Verificar si el servidor realmente responde
    final canReachServer = await apiService.testConnection();
    _isConnected = canReachServer;
    notifyListeners();
    if (!canReachServer) {
      debugPrint('Servidor aún no alcanzable para sincronización.');
      return 0;
    }

    _isSyncing = true;
    notifyListeners();

    int successCount = 0;

    for (final SyncOperation op in pendingOps) {
      try {
        ApiResponse response;
        final payloadMap = op.payload.isNotEmpty
            ? jsonDecode(op.payload) as Map<String, dynamic>
            : <String, dynamic>{};

        if (op.method == 'POST') {
          response = await apiService.post(op.endpoint, payloadMap);
        } else if (op.method == 'PUT') {
          response = await apiService.put(op.endpoint, payloadMap);
        } else if (op.method == 'DELETE') {
          response = await apiService.delete(op.endpoint);
        } else {
          continue;
        }

        if (response.isSuccess) {
          if (op.id != null) {
            await databaseService.updateOperationStatus(op.id!, 'SYNCED');
          }
          successCount++;
        } else {
          debugPrint('Error sincronizando operación #${op.id}: ${response.errorMessage}');
          if (response.isOffline) {
            // El servidor volvió a caerse, suspender
            break;
          }
        }
      } catch (e) {
        debugPrint('Excepción al sincronizar op #${op.id}: $e');
        break;
      }
    }

    _isSyncing = false;
    await refreshPendingCount();

    if (successCount > 0) {
      final msg = '✅ Se han sincronizado $successCount operaciones pendientes con el servidor';
      debugPrint(msg);
      if (onSyncCompleted != null) {
        onSyncCompleted!(msg);
      }
    }

    return successCount;
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    _periodicTimer?.cancel();
    super.dispose();
  }
}
