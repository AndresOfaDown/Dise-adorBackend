import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../config/environment.dart';
import '../services/api_service.dart';
import '../models/schema_definition.dart';
import '../services/dynamic_nlu_service.dart';

class ServerConfigDialog extends StatefulWidget {
  const ServerConfigDialog({super.key});

  @override
  State<ServerConfigDialog> createState() => _ServerConfigDialogState();
}

class _ServerConfigDialogState extends State<ServerConfigDialog> {
  late TextEditingController _urlController;
  bool _isTesting = false;
  String? _testResult;
  bool? _testSuccess;

  @override
  void initState() {
    super.initState();
    final env = Provider.of<Environment>(context, listen: false);
    _urlController = TextEditingController(text: env.baseUrl);
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTesting = true;
      _testResult = null;
      _testSuccess = null;
    });

    final env = Provider.of<Environment>(context, listen: false);
    final originalUrl = env.baseUrl;

    // Aplicar temporalmente para probar
    await env.setBaseUrl(_urlController.text.trim());
    final apiService = ApiService(environment: env);
    final success = await apiService.testConnection();

    if (!mounted) return;

    setState(() {
      _isTesting = false;
      _testSuccess = success;
      _testResult = success
          ? '🟢 Servidor alcanzable (HTTP 200 OK)'
          : '🔴 Sin respuesta del servidor en esta dirección';
    });

    // Si falló, restaurar temporal
    if (!success) {
      await env.setBaseUrl(originalUrl);
    }
  }

  Future<void> _saveAndClose() async {
    final env = Provider.of<Environment>(context, listen: false);
    final nlu = Provider.of<DynamicNluService>(context, listen: false);
    await env.setBaseUrl(_urlController.text.trim());

    // Auto-descargar schema del nuevo backend
    try {
      final api = ApiService(environment: env);
      final res = await api.get('/api/v1/schema');
      if (res.isSuccess && res.data is List) {
        final list = res.data as List;
        final newSchema = DynamicSchema.fromJsonList(list);
        await nlu.setActiveSchema(newSchema);
      }
    } catch (e) {
      debugPrint('No se pudo descargar schema automáticamente: $e');
    }

    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.surfaceDark,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppTheme.borderDark),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.neonCyan.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.settings, color: AppTheme.neonCyan, size: 22),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    'Ajuste del Servidor',
                    style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'Dirección Base de la API REST de Spring Boot:',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _urlController,
                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
                decoration: const InputDecoration(
                  hintText: 'http://10.0.2.2:8080/api',
                  prefixIcon: Icon(Icons.dns_rounded, color: AppTheme.neonCyan, size: 20),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Accesos rápidos:',
                style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _buildPresetChip('Emulador (10.0.2.2)', 'http://10.0.2.2:8080/api'),
                  _buildPresetChip('AWS (18.225.109.198)', 'http://18.225.109.198:8080/api'),
                  _buildPresetChip('Localhost', 'http://localhost:8080/api'),
                ],
              ),
              const SizedBox(height: 16),
              if (_testResult != null)
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: _testSuccess == true
                        ? AppTheme.statusOnline.withValues(alpha: 0.15)
                        : AppTheme.statusError.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _testSuccess == true
                          ? AppTheme.statusOnline.withValues(alpha: 0.4)
                          : AppTheme.statusError.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    _testResult!,
                    style: TextStyle(
                      color: _testSuccess == true
                          ? AppTheme.statusOnline
                          : AppTheme.statusError,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: _isTesting ? null : _testConnection,
                    icon: _isTesting
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.network_check_rounded, size: 18),
                    label: const Text('Probar'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppTheme.neonCyan,
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _saveAndClose,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.neonViolet,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Guardar'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPresetChip(String label, String url) {
    return InkWell(
      onTap: () {
        setState(() {
          _urlController.text = url;
        });
      },
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppTheme.borderDark),
        ),
        child: Text(
          label,
          style: const TextStyle(color: AppTheme.neonCyan, fontSize: 12),
        ),
      ),
    );
  }
}
