import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../models/chat_message.dart';
import '../services/dynamic_nlu_service.dart';
import '../services/sync_service.dart';
import '../services/voice_service.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/schema_settings_dialog.dart';
import '../services/database_service.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final List<ChatMessage> _messages = [];
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _textFocusNode = FocusNode();
  final DatabaseService _dbService = DatabaseService();

  bool _isProcessing = false;
  String _lastSchemaName = '';
  bool _hasText = false;

  @override
  void initState() {
    super.initState();

    _textController.addListener(() {
      final hasTextNow = _textController.text.trim().isNotEmpty;
      if (hasTextNow != _hasText && mounted) {
        setState(() {
          _hasText = hasTextNow;
        });
      }
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final nlu = Provider.of<DynamicNluService>(context, listen: false);
      final syncService = Provider.of<SyncService>(context, listen: false);
      final voiceService = Provider.of<VoiceService>(context, listen: false);

      _lastSchemaName = nlu.activeSchema.businessName;
      // Cargar historial de chat guardado
      _loadChatHistory(nlu, voiceService);

      // Escuchar cambios de esquema para saludar de forma reactiva
      nlu.addListener(() {
        if (!mounted) return;
        if (nlu.activeSchema.businessName != _lastSchemaName) {
          _lastSchemaName = nlu.activeSchema.businessName;
          final msg = '¡Modelo adaptado a $_lastSchemaName! Ahora puedes gestionar: ${nlu.activeSchema.entities.map((e) => e.label).join(', ')}.';
          setState(() {
            _messages.add(
              ChatMessage(
                id: DateTime.now().millisecondsSinceEpoch.toString(),
                text: msg,
                isUser: false,
                timestamp: DateTime.now(),
                status: MessageStatus.online,
              ),
            );
          });
          _scrollToBottom();
          voiceService.speak(msg);
        }
      });

      // Notificación al completar sincronización reactiva
      syncService.onSyncCompleted = (message) {
        if (!mounted) return;
        final syncMsg = ChatMessage(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          text: message,
          isUser: false,
          timestamp: DateTime.now(),
          status: MessageStatus.online,
        );
        setState(() {
          _messages.add(syncMsg);
        });
        _scrollToBottom();
        voiceService.speak(message);
      };
    });
  }

  void _addGreeting(String business, String entities) {
    _messages.add(
      ChatMessage(
        id: '1',
        text: '¡Hola! Soy tu Asistente Universal Zero-UI. Actualmente configurado para: $business.\nEntidades: $entities.\nPuedes hablarme o escribirme cualquier consulta o registro.',
        isUser: false,
        timestamp: DateTime.now(),
        status: MessageStatus.none,
      ),
    );
  }

  Future<void> _loadChatHistory(DynamicNluService nlu, VoiceService voiceService) async {
    try {
      final history = await _dbService.loadChatHistory();
      if (history.isNotEmpty && mounted) {
        setState(() {
          _messages.clear();
          _messages.addAll(history);
        });
        _scrollToBottom();
      } else {
        _addGreeting(nlu.activeSchema.businessName, nlu.activeSchema.entities.map((e) => e.label).join(', '));
      }
    } catch (e) {
      debugPrint('Error cargando historial: $e');
      _addGreeting(nlu.activeSchema.businessName, nlu.activeSchema.entities.map((e) => e.label).join(', '));
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _textFocusNode.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  DateTime? _lastSubmitTime;
  String? _lastQuery;

  Future<void> _handleSubmitted(String text) async {
    final query = text.trim();
    final now = DateTime.now();
    if (query.isEmpty || _isProcessing) return;

    // Protección absoluta: si es el mismo comando dentro de los últimos 3 segundos, descartar
    if (_lastQuery != null &&
        _lastQuery!.toLowerCase() == query.toLowerCase() &&
        _lastSubmitTime != null &&
        now.difference(_lastSubmitTime!).inMilliseconds < 3000) {
      debugPrint('Descartada petición duplicada: "$query"');
      return;
    }
    _lastSubmitTime = now;
    _lastQuery = query;
    _isProcessing = true; // Candado síncrono inmediato

    _textController.clear();
    _textFocusNode.unfocus();

    final userMsg = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      text: query,
      isUser: true,
      timestamp: DateTime.now(),
    );

    setState(() {
      _messages.add(userMsg);
    });
    _scrollToBottom();
    _dbService.saveChatMessage(userMsg);

    final nlu = Provider.of<DynamicNluService>(context, listen: false);
    final voiceService = Provider.of<VoiceService>(context, listen: false);
    final syncService = Provider.of<SyncService>(context, listen: false);

    try {
      final response = await nlu.processCommand(query);

      if (!mounted) return;
      setState(() {
        _messages.add(response);
        _isProcessing = false;
      });
      _scrollToBottom();
      _dbService.saveChatMessage(response);

      // Hablar respuesta
      await voiceService.speak(response.text);

      // Actualizar contador de cola
      await syncService.refreshPendingCount();
    } catch (e) {
      if (!mounted) return;
      final errorMsg = ChatMessage(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: 'Ocurrió un error procesando el comando: $e',
        isUser: false,
        timestamp: DateTime.now(),
        status: MessageStatus.error,
      );
      setState(() {
        _messages.add(errorMsg);
        _isProcessing = false;
      });
      _scrollToBottom();
    }
  }

  void _toggleListening() {
    final voiceService = Provider.of<VoiceService>(context, listen: false);

    if (voiceService.isListening) {
      voiceService.stopListening();
    } else {
      voiceService.startListening(
        onFinalResult: (recognized) {
          if (recognized.isNotEmpty && !_isProcessing) {
            _textController.clear();
            _handleSubmitted(recognized);
          }
        },
        onPartialResult: (partial) {
          if (partial.isNotEmpty && mounted && !_isProcessing) {
            _textController.text = partial;
          }
        },
      );
    }
  }

  void _openSchemaSettings() {
    showDialog(
      context: context,
      builder: (context) => const SchemaSettingsDialog(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final voiceService = context.watch<VoiceService>();
    final syncService = context.watch<SyncService>();
    final nlu = context.watch<DynamicNluService>();

    final businessName = nlu.activeSchema.businessName;

    return Scaffold(
      backgroundColor: AppTheme.bgDark,
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: AppTheme.primaryGradient,
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.neonCyan.withValues(alpha: 0.4),
                    blurRadius: 10,
                  ),
                ],
              ),
              child: const Icon(Icons.grain_rounded, color: Colors.white, size: 20),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'UNIVERSAL ASSISTANT',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.0,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  Text(
                    'Modelo: $businessName',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.neonCyan,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          // Chip de conectividad
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: syncService.isConnected
                  ? AppTheme.statusOnline.withValues(alpha: 0.15)
                  : AppTheme.statusQueued.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: syncService.isConnected
                    ? AppTheme.statusOnline.withValues(alpha: 0.5)
                    : AppTheme.statusQueued.withValues(alpha: 0.5),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: syncService.isConnected
                        ? AppTheme.statusOnline
                        : AppTheme.statusQueued,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  syncService.isConnected ? 'En línea' : 'Offline',
                  style: TextStyle(
                    color: syncService.isConnected
                        ? AppTheme.statusOnline
                        : AppTheme.statusQueued,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),

          // Badge de operaciones pendientes
          if (syncService.pendingCount > 0)
            InkWell(
              onTap: () => syncService.syncPendingQueue(),
              borderRadius: BorderRadius.circular(16),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.neonViolet.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppTheme.neonVioletLight),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (syncService.isSyncing)
                      const SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    else
                      const Icon(Icons.sync_rounded, size: 14, color: AppTheme.neonVioletLight),
                    const SizedBox(width: 4),
                    Text(
                      '${syncService.pendingCount}',
                      style: const TextStyle(
                        color: AppTheme.neonVioletLight,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // Botón para detener voz en AppBar si está hablando
          if (voiceService.isSpeaking)
            IconButton(
              icon: const Icon(Icons.volume_off_rounded, color: Colors.redAccent),
              tooltip: 'Silenciar voz',
              onPressed: () => voiceService.stopSpeaking(),
            ),

          IconButton(
            icon: const Icon(Icons.tune_rounded, color: AppTheme.neonCyan),
            tooltip: 'Esquema y Ajustes',
            onPressed: _openSchemaSettings,
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Feed conversacional
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.only(top: 8, bottom: 16),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  return ChatBubble(message: _messages[index]);
                },
              ),
            ),

            if (_isProcessing)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.neonCyan),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Comprendiendo y ejecutando acción...',
                      style: TextStyle(color: AppTheme.neonCyan.withValues(alpha: 0.8), fontSize: 12),
                    ),
                  ],
                ),
              ),

            // Chip flotante para detener la voz cuando la IA habla
            if (voiceService.isSpeaking)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: GestureDetector(
                  onTap: () => voiceService.stopSpeaking(),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.redAccent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.redAccent.withValues(alpha: 0.6)),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.redAccent.withValues(alpha: 0.2),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.stop_circle_rounded, size: 16, color: Colors.redAccent),
                        SizedBox(width: 6),
                        Text(
                          'Detener voz',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

            // Barra inferior estilo WhatsApp
            Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              decoration: BoxDecoration(
                color: AppTheme.surfaceDark.withValues(alpha: 0.95),
                border: Border(
                  top: BorderSide(color: AppTheme.borderDark.withValues(alpha: 0.5)),
                ),
              ),
              child: Row(
                children: [
                  // Campo de texto expandible estilo WhatsApp
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppTheme.cardDark,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(
                          color: voiceService.isListening
                              ? AppTheme.neonCyan
                              : AppTheme.borderDark,
                          width: voiceService.isListening ? 1.5 : 1.0,
                        ),
                      ),
                      child: Row(
                        children: [
                          const SizedBox(width: 14),
                          if (voiceService.isListening)
                            Container(
                              width: 10,
                              height: 10,
                              margin: const EdgeInsets.only(right: 8),
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.redAccent,
                              ),
                            ),
                          Expanded(
                            child: TextField(
                              controller: _textController,
                              focusNode: _textFocusNode,
                              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15),
                              textInputAction: TextInputAction.send,
                              onSubmitted: (text) => _handleSubmitted(text),
                              decoration: InputDecoration(
                                hintText: voiceService.isListening
                                    ? 'Escuchando... habla ahora'
                                    : 'Escribe un comando para $businessName...',
                                hintStyle: TextStyle(
                                  color: voiceService.isListening
                                      ? AppTheme.neonCyan
                                      : AppTheme.textMuted,
                                  fontSize: 14,
                                ),
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                              ),
                            ),
                          ),
                          if (_hasText && !_isProcessing)
                            IconButton(
                              icon: const Icon(Icons.close_rounded, size: 18, color: AppTheme.textMuted),
                              onPressed: () => _textController.clear(),
                            ),
                          const SizedBox(width: 4),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(width: 8),

                  // Botón circular al costado (WhatsApp style): Micrófono o Enviar
                  GestureDetector(
                    onTap: () {
                      if (_isProcessing) return;
                      // Si está escuchando, tocarlo siempre detiene la grabación
                      if (voiceService.isListening) {
                        _toggleListening();
                        return;
                      }
                      // Si no está escuchando y hay texto, envía
                      if (_hasText) {
                        _handleSubmitted(_textController.text);
                      } else {
                        // Si no hay texto, empieza a escuchar
                        _toggleListening();
                      }
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: voiceService.isListening
                            ? const LinearGradient(
                                colors: [Colors.redAccent, Colors.deepOrange],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              )
                            : AppTheme.primaryGradient,
                        boxShadow: [
                          BoxShadow(
                            color: voiceService.isListening
                                ? Colors.redAccent.withValues(alpha: 0.5)
                                : AppTheme.neonCyan.withValues(alpha: 0.35),
                            blurRadius: voiceService.isListening ? 12 : 8,
                            spreadRadius: voiceService.isListening ? 2 : 0,
                          ),
                        ],
                      ),
                      child: Icon(
                        voiceService.isListening
                            ? Icons.stop_rounded
                            : _hasText
                                ? Icons.send_rounded
                                : Icons.mic_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
