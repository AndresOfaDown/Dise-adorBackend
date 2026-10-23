import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

class VoiceService with ChangeNotifier {
  final stt.SpeechToText _speech = stt.SpeechToText();
  final FlutterTts _tts = FlutterTts();

  bool _isSpeechAvailable = false;
  bool _isListening = false;
  bool _isSpeaking = false;
  double _soundLevel = 0.0;
  String _lastRecognizedWords = '';

  bool get isSpeechAvailable => _isSpeechAvailable;
  bool get isListening => _isListening;
  bool get isSpeaking => _isSpeaking;
  double get soundLevel => _soundLevel;
  String get lastRecognizedWords => _lastRecognizedWords;

  VoiceService() {
    _initTts();
    _initSpeech();
  }

  Future<void> _initTts() async {
    try {
      await _tts.setLanguage("es-ES");
      await _tts.setSpeechRate(0.5);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);

      _tts.setStartHandler(() {
        _isSpeaking = true;
        notifyListeners();
      });

      _tts.setCompletionHandler(() {
        _isSpeaking = false;
        notifyListeners();
      });

      _tts.setErrorHandler((msg) {
        debugPrint("Error en TTS: $msg");
        _isSpeaking = false;
        notifyListeners();
      });
    } catch (e) {
      debugPrint("Error inicializando TTS: $e");
    }
  }

  Future<bool> _initSpeech() async {
    try {
      _isSpeechAvailable = await _speech.initialize(
        onStatus: (status) {
          debugPrint('STT Status: $status');
          if (status == 'listening') {
            _isListening = true;
          } else if (status == 'notListening' || status == 'done') {
            _isListening = false;
          }
          notifyListeners();
        },
        onError: (errorNotification) {
          debugPrint('STT Error: ${errorNotification.errorMsg}');
          _isListening = false;
          notifyListeners();
        },
      );
      notifyListeners();
      return _isSpeechAvailable;
    } catch (e) {
      debugPrint("Excepción inicializando STT: $e");
      _isSpeechAvailable = false;
      return false;
    }
  }

  /// Inicia la escucha por voz
  Future<void> startListening({
    required Function(String recognized) onFinalResult,
    Function(String partial)? onPartialResult,
  }) async {
    if (!_isSpeechAvailable) {
      final initialized = await _initSpeech();
      if (!initialized) {
        debugPrint('El reconocimiento de voz no está disponible en este dispositivo.');
        return;
      }
    }

    // Detener TTS si está hablando para no retroalimentar
    if (_isSpeaking) {
      await stopSpeaking();
    }

    _lastRecognizedWords = '';
    _isListening = true;
    notifyListeners();

    bool finalResultDispatched = false;

    try {
      await _speech.listen(
        onResult: (result) {
          _lastRecognizedWords = result.recognizedWords;
          if (onPartialResult != null && !finalResultDispatched) {
            onPartialResult(result.recognizedWords);
          }
          if (result.finalResult && !finalResultDispatched) {
            finalResultDispatched = true;
            _isListening = false;
            notifyListeners();
            _speech.stop();
            onFinalResult(result.recognizedWords);
          }
        },
        listenOptions: stt.SpeechListenOptions(
          listenMode: stt.ListenMode.dictation,
          listenFor: const Duration(seconds: 60),
          pauseFor: const Duration(seconds: 6),
          localeId: "es_ES",
          partialResults: true,
          cancelOnError: false,
        ),
        onSoundLevelChange: (level) {
          _soundLevel = level;
          notifyListeners();
        },
      );
    } catch (e) {
      debugPrint("Error al iniciar escucha: $e");
      _isListening = false;
      notifyListeners();
    }
  }

  /// Detiene la escucha manual o automáticamente
  Future<void> stopListening() async {
    try {
      await _speech.stop();
    } catch (e) {
      debugPrint("Error deteniendo STT: $e");
    } finally {
      _isListening = false;
      _soundLevel = 0.0;
      notifyListeners();
    }
  }

  /// Lee en voz alta un texto en español
  Future<void> speak(String text) async {
    if (text.trim().isEmpty) return;

    // Si estaba escuchando, detener el micrófono
    if (_isListening) {
      await stopListening();
    }

    try {
      // Limpiar texto de emojis y símbolos que suenen extraños en TTS
      final cleanText = text
          .replaceAll(RegExp(r'[🟢🟠🔴✅❌⚙️📦🛒💰📝]'), '')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();

      await _tts.stop();
      await _tts.speak(cleanText);
    } catch (e) {
      debugPrint("Error ejecutando TTS: $e");
    }
  }

  Future<void> stopSpeaking() async {
    try {
      await _tts.stop();
      _isSpeaking = false;
      notifyListeners();
    } catch (e) {
      debugPrint("Error deteniendo TTS: $e");
    }
  }

  @override
  void dispose() {
    _speech.cancel();
    _tts.stop();
    super.dispose();
  }
}
