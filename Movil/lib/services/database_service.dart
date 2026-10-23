import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:sqflite_common_ffi_web/sqflite_ffi_web.dart';
import 'package:path/path.dart' as p;
import '../models/schema_definition.dart';
import '../models/sync_operation.dart';
import '../models/chat_message.dart';

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  factory DatabaseService() => _instance;
  DatabaseService._internal();

  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDatabase();
    return _db!;
  }

  Future<Database> _initDatabase() async {
    if (kIsWeb) {
      databaseFactory = databaseFactoryFfiWeb;
    } else if (Platform.isWindows || Platform.isLinux) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    }

    String path;
    if (kIsWeb) {
      path = 'assistant.db';
    } else {
      final dbPath = await getDatabasesPath();
      path = p.join(dbPath, 'assistant.db');
    }

    return await openDatabase(
      path,
      version: 2,
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute('''
            CREATE TABLE IF NOT EXISTS chat_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              message_id TEXT NOT NULL,
              text TEXT NOT NULL,
              is_user INTEGER NOT NULL,
              timestamp TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'none',
              structured_data TEXT,
              list_data TEXT
            )
          ''');
        }
      },
      onCreate: (db, version) async {
        // 1. schema_metadata: Entidades y atributos del negocio actual
        await db.execute('''
          CREATE TABLE schema_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schema_key TEXT UNIQUE NOT NULL,
            schema_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        ''');

        // 2. offline_sync_queue: Peticiones pendientes encoladas cuando no hay conexión
        await db.execute('''
          CREATE TABLE offline_sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL,
            payload TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            status TEXT NOT NULL
          )
        ''');

        // 3. entity_cache: Datos locales de lectura para responder GET sin conexión
        await db.execute('''
          CREATE TABLE entity_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_name TEXT NOT NULL,
            record_id TEXT,
            data_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        ''');

        // 4. chat_history: Historial de conversación persistente
        await db.execute('''
          CREATE TABLE chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            text TEXT NOT NULL,
            is_user INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'none',
            structured_data TEXT,
            list_data TEXT
          )
        ''');

        debugPrint('Base de datos SQLite assistant.db inicializada correctamente.');
      },
    );
  }

  // ==========================================
  // SCHEMA METADATA
  // ==========================================

  Future<void> saveActiveSchema(DynamicSchema schema) async {
    final db = await database;
    final now = DateTime.now().toIso8601String();
    await db.insert(
      'schema_metadata',
      {
        'schema_key': 'active_business_schema',
        'schema_json': schema.toJsonString(),
        'updated_at': now,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    debugPrint('Esquema dinámico guardado en SQLite: ${schema.businessName} con ${schema.entities.length} entidades.');
  }

  Future<DynamicSchema?> getActiveSchema() async {
    final db = await database;
    final maps = await db.query(
      'schema_metadata',
      where: 'schema_key = ?',
      whereArgs: ['active_business_schema'],
      limit: 1,
    );

    if (maps.isNotEmpty) {
      try {
        final decoded = jsonDecode(maps.first['schema_json'] as String) as Map<String, dynamic>;
        return DynamicSchema.fromJson(decoded);
      } catch (e) {
        debugPrint('Error leyendo esquema activo de SQLite: $e');
      }
    }
    return null;
  }

  // ==========================================
  // OFFLINE SYNC QUEUE
  // ==========================================

  Future<int> enqueueOperation(SyncOperation op) async {
    final db = await database;
    final id = await db.insert('offline_sync_queue', op.toMap());
    debugPrint('Petición encolada en offline_sync_queue con ID: $id [${op.method} ${op.endpoint}]');
    return id;
  }

  Future<List<SyncOperation>> getPendingOperations() async {
    final db = await database;
    final maps = await db.query(
      'offline_sync_queue',
      where: 'status = ?',
      whereArgs: ['PENDING'],
      orderBy: 'id ASC',
    );
    return maps.map((m) => SyncOperation.fromMap(m)).toList();
  }

  Future<int> getPendingCount() async {
    final db = await database;
    final result = await db.rawQuery(
      "SELECT COUNT(*) as count FROM offline_sync_queue WHERE status = 'PENDING'",
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<void> updateOperationStatus(int id, String status) async {
    final db = await database;
    await db.update(
      'offline_sync_queue',
      {'status': status},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> deleteOperation(int id) async {
    final db = await database;
    await db.delete('offline_sync_queue', where: 'id = ?', whereArgs: [id]);
  }

  // ==========================================
  // ENTITY CACHE (LECTURA OFFLINE)
  // ==========================================

  Future<void> cacheEntityList(String entityName, List<dynamic> items) async {
    final db = await database;
    final batch = db.batch();

    // Eliminar caché previa de esta entidad
    batch.delete('entity_cache', where: 'entity_name = ?', whereArgs: [entityName.toLowerCase()]);

    final now = DateTime.now().toIso8601String();
    for (var item in items) {
      if (item is Map<String, dynamic>) {
        final id = item['id']?.toString() ?? item['codigo']?.toString() ?? '';
        batch.insert('entity_cache', {
          'entity_name': entityName.toLowerCase(),
          'record_id': id,
          'data_json': jsonEncode(item),
          'updated_at': now,
        });
      }
    }
    await batch.commit(noResult: true);
    debugPrint('Cacheadas ${items.length} entidades de "$entityName" en entity_cache.');
  }

  Future<List<Map<String, dynamic>>> getCachedEntities(String entityName, {String? filterQuery, String? searchQuery}) async {
    final db = await database;
    final maps = await db.query(
      'entity_cache',
      where: 'entity_name = ?',
      whereArgs: [entityName.toLowerCase()],
    );

    final results = <Map<String, dynamic>>[];
    final query = (filterQuery ?? searchQuery)?.toLowerCase().trim();

    for (var row in maps) {
      try {
        final data = jsonDecode(row['data_json'] as String) as Map<String, dynamic>;
        if (query == null || query.isEmpty) {
          results.add(data);
        } else {
          final matches = data.values.any(
            (val) => val != null && val.toString().toLowerCase().contains(query),
          );
          if (matches) {
            results.add(data);
          }
        }
      } catch (e) {
        debugPrint('Error parseando entity_cache: $e');
      }
    }
    return results;
  }

  // ==========================================
  // CHAT HISTORY
  // ==========================================

  Future<void> saveChatMessage(ChatMessage message) async {
    final db = await database;
    await db.insert('chat_history', {
      'message_id': message.id,
      'text': message.text,
      'is_user': message.isUser ? 1 : 0,
      'timestamp': message.timestamp.toIso8601String(),
      'status': message.status.name,
      'structured_data': message.structuredData != null ? jsonEncode(message.structuredData) : null,
      'list_data': message.listData != null ? jsonEncode(message.listData) : null,
    });
  }

  Future<List<ChatMessage>> loadChatHistory({int limit = 50}) async {
    final db = await database;
    final maps = await db.query(
      'chat_history',
      orderBy: 'id DESC',
      limit: limit,
    );

    return maps.reversed.map((row) {
      final statusStr = row['status'] as String? ?? 'none';
      MessageStatus status;
      try {
        status = MessageStatus.values.firstWhere((s) => s.name == statusStr);
      } catch (_) {
        status = MessageStatus.none;
      }

      return ChatMessage(
        id: row['message_id'] as String,
        text: row['text'] as String,
        isUser: (row['is_user'] as int) == 1,
        timestamp: DateTime.parse(row['timestamp'] as String),
        status: status,
        structuredData: row['structured_data'] != null
            ? jsonDecode(row['structured_data'] as String) as Map<String, dynamic>?
            : null,
        listData: row['list_data'] != null
            ? jsonDecode(row['list_data'] as String) as List<dynamic>?
            : null,
      );
    }).toList();
  }

  Future<void> clearChatHistory() async {
    final db = await database;
    await db.delete('chat_history');
  }
}
