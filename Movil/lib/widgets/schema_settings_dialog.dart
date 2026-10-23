import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../config/environment.dart';
import '../models/schema_definition.dart';
import '../services/api_service.dart';
import '../services/dynamic_nlu_service.dart';

class SchemaSettingsDialog extends StatefulWidget {
  const SchemaSettingsDialog({super.key});

  @override
  State<SchemaSettingsDialog> createState() => _SchemaSettingsDialogState();
}

class _SchemaSettingsDialogState extends State<SchemaSettingsDialog>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late TextEditingController _urlController;
  late TextEditingController _jsonController;

  bool _isTesting = false;
  bool _isDownloading = false;
  String? _statusFeedback;
  bool? _isSuccess;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    final env = Provider.of<Environment>(context, listen: false);
    final nlu = Provider.of<DynamicNluService>(context, listen: false);

    _urlController = TextEditingController(text: env.baseUrl);
    _jsonController = TextEditingController(text: nlu.activeSchema.toJsonString());
  }

  @override
  void dispose() {
    _tabController.dispose();
    _urlController.dispose();
    _jsonController.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTesting = true;
      _statusFeedback = null;
      _isSuccess = null;
    });

    final env = Provider.of<Environment>(context, listen: false);
    await env.setBaseUrl(_urlController.text.trim());
    final api = ApiService(environment: env);
    final ok = await api.testConnection();

    if (!mounted) return;
    setState(() {
      _isTesting = false;
      _isSuccess = ok;
      _statusFeedback = ok ? '🟢 Conexión exitosa con el backend' : '🔴 No se pudo contactar al servidor';
    });
  }

  Future<void> _downloadSchema() async {
    setState(() {
      _isDownloading = true;
      _statusFeedback = null;
    });

    final env = Provider.of<Environment>(context, listen: false);
    final nlu = Provider.of<DynamicNluService>(context, listen: false);
    await env.setBaseUrl(_urlController.text.trim());
    final api = ApiService(environment: env);

    final res = await api.get('/api/v1/schema');
    if (!mounted) return;

    if (res.isSuccess && res.data is List) {
      final list = res.data as List;
      final newSchema = DynamicSchema.fromJsonList(list);
      await nlu.setActiveSchema(newSchema);
      _jsonController.text = newSchema.toJsonString();

      setState(() {
        _isDownloading = false;
        _isSuccess = true;
        _statusFeedback = '✅ Esquema "${newSchema.businessName}" detectado (${newSchema.entities.length} entidades)';
      });
    } else {
      setState(() {
        _isDownloading = false;
        _isSuccess = false;
        _statusFeedback = '⚠️ No se pudo obtener el esquema en /api/v1/schema';
      });
    }
  }



  void _applyCustomJson() {
    try {
      final decoded = jsonDecode(_jsonController.text);
      DynamicSchema schema;
      if (decoded is List) {
        schema = DynamicSchema.fromJsonList(decoded);
      } else if (decoded is Map<String, dynamic>) {
        schema = DynamicSchema.fromJson(decoded);
      } else {
        throw Exception('Formato JSON no reconocido');
      }

      final nlu = Provider.of<DynamicNluService>(context, listen: false);
      nlu.setActiveSchema(schema);

      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✅ Esquema "${schema.businessName}" cargado correctamente'),
          backgroundColor: AppTheme.statusOnline,
        ),
      );
    } catch (e) {
      setState(() {
        _isSuccess = false;
        _statusFeedback = 'Error en JSON: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final nlu = context.watch<DynamicNluService>();

    return Dialog(
      backgroundColor: AppTheme.surfaceDark,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppTheme.borderDark),
      ),
      child: Container(
        width: double.maxFinite,
        constraints: const BoxConstraints(maxHeight: 600),
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 10),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.tune_rounded, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Ajustes del Backend',
                          style: TextStyle(
                            color: AppTheme.textPrimary,
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          'Backend actual: ${nlu.activeSchema.businessName}',
                          style: const TextStyle(
                            color: AppTheme.neonCyan,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: AppTheme.textSecondary, size: 20),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            // Tab Bar (2 tabs: Servidor y JSON Schema)
            TabBar(
              controller: _tabController,
              indicatorColor: AppTheme.neonCyan,
              labelColor: AppTheme.neonCyan,
              unselectedLabelColor: AppTheme.textMuted,
              tabs: const [
                Tab(text: 'Servidor'),
                Tab(text: 'JSON Schema'),
              ],
            ),

            // Contenido de Tabs
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildServerTab(),
                  _buildJsonEditorTab(),
                ],
              ),
            ),

            if (_statusFeedback != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: (_isSuccess == true ? AppTheme.statusOnline : AppTheme.statusError)
                    .withValues(alpha: 0.15),
                child: Text(
                  _statusFeedback!,
                  style: TextStyle(
                    color: _isSuccess == true ? AppTheme.statusOnline : AppTheme.statusError,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildServerTab() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: ListView(
        children: [
          const Text(
            'URL del backend Spring Boot:',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _urlController,
            style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
            decoration: const InputDecoration(
              hintText: 'http://10.0.2.2:8080/api',
              prefixIcon: Icon(Icons.dns_rounded, color: AppTheme.neonCyan),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              ActionChip(
                label: const Text('10.0.2.2 (Emulador)'),
                backgroundColor: AppTheme.cardDark,
                labelStyle: const TextStyle(color: AppTheme.neonCyan, fontSize: 11),
                onPressed: () => _urlController.text = 'http://10.0.2.2:8080/api',
              ),
              ActionChip(
                label: const Text('AWS IP'),
                backgroundColor: AppTheme.cardDark,
                labelStyle: const TextStyle(color: AppTheme.neonCyan, fontSize: 11),
                onPressed: () => _urlController.text = 'http://18.225.109.198:8080/api',
              ),
              ActionChip(
                label: const Text('localhost'),
                backgroundColor: AppTheme.cardDark,
                labelStyle: const TextStyle(color: AppTheme.neonCyan, fontSize: 11),
                onPressed: () => _urlController.text = 'http://localhost:8080/api',
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _isTesting ? null : _testConnection,
                  icon: _isTesting
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.network_check, size: 18),
                  label: const Text('Probar'),
                  style: OutlinedButton.styleFrom(foregroundColor: AppTheme.neonCyan),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isDownloading ? null : _downloadSchema,
                  icon: _isDownloading
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.cloud_download_rounded, size: 18),
                  label: const Text('Descargar'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.neonViolet,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildJsonEditorTab() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const Text(
            'Pega aquí cualquier schema.json generado del diagrama UML:',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 12),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: TextField(
              controller: _jsonController,
              maxLines: null,
              expands: true,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 11,
                color: AppTheme.neonCyanLight,
              ),
              decoration: InputDecoration(
                contentPadding: const EdgeInsets.all(12),
                fillColor: AppTheme.bgDark.withValues(alpha: 0.9),
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _applyCustomJson,
              icon: const Icon(Icons.save_rounded),
              label: const Text('Guardar y Aplicar Esquema'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.neonCyan,
                foregroundColor: Colors.black,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
