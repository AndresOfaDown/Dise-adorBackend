import 'package:flutter/material.dart';
import '../config/app_theme.dart';

class AnimatedVoiceOrb extends StatefulWidget {
  final bool isListening;
  final bool isSpeaking;
  final double soundLevel;
  final VoidCallback onPressed;

  const AnimatedVoiceOrb({
    super.key,
    required this.isListening,
    required this.isSpeaking,
    this.soundLevel = 0.0,
    required this.onPressed,
  });

  @override
  State<AnimatedVoiceOrb> createState() => _AnimatedVoiceOrbState();
}

class _AnimatedVoiceOrbState extends State<AnimatedVoiceOrb>
    with TickerProviderStateMixin {
  late AnimationController _waveController;
  late AnimationController _rotationController;
  late Animation<double> _waveAnimation;

  @override
  void initState() {
    super.initState();
    _waveController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();

    _rotationController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    )..repeat();

    _waveAnimation = CurvedAnimation(
      parent: _waveController,
      curve: Curves.easeOutQuad,
    );
  }

  @override
  void dispose() {
    _waveController.dispose();
    _rotationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final active = widget.isListening || widget.isSpeaking;

    return AnimatedBuilder(
      animation: Listenable.merge([_waveAnimation, _rotationController]),
      builder: (context, child) {
        final levelBoost = (widget.soundLevel.clamp(0.0, 10.0) / 10.0) * 0.3;
        final waveValue = _waveAnimation.value;

        return GestureDetector(
          onTap: widget.onPressed,
          child: SizedBox(
            width: 140,
            height: 140,
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Onda expansiva 1 (Exterior)
                if (active)
                  Transform.scale(
                    scale: 1.0 + (waveValue * 0.65) + levelBoost,
                    child: Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: (widget.isListening ? AppTheme.neonCyan : AppTheme.neonViolet)
                              .withValues(alpha: (1.0 - waveValue) * 0.5),
                          width: 2,
                        ),
                      ),
                    ),
                  ),

                // Onda expansiva 2 (Intermedia)
                if (active)
                  Transform.scale(
                    scale: 1.0 + (((waveValue + 0.5) % 1.0) * 0.5) + levelBoost,
                    child: Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppTheme.neonVioletLight
                              .withValues(alpha: (1.0 - ((waveValue + 0.5) % 1.0)) * 0.4),
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),

                // Resplandor Neón profundo
                Container(
                  width: 78 + (levelBoost * 20),
                  height: 78 + (levelBoost * 20),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: active
                            ? (widget.isListening ? AppTheme.neonCyan : AppTheme.neonViolet).withValues(alpha: 0.55)
                            : Colors.black.withValues(alpha: 0.4),
                        blurRadius: active ? 28 : 10,
                        spreadRadius: active ? 6 : 1,
                      ),
                      if (active)
                        BoxShadow(
                          color: AppTheme.neonViolet.withValues(alpha: 0.4),
                          blurRadius: 40,
                          spreadRadius: 10,
                        ),
                    ],
                  ),
                ),

                // Orbe central con gradiente Siri / Alexa
                RotationTransition(
                  turns: _rotationController,
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: active
                          ? const SweepGradient(
                              colors: [
                                Color(0xFF06B6D4),
                                Color(0xFF8B5CF6),
                                Color(0xFFEC4899),
                                Color(0xFF06B6D4),
                              ],
                            )
                          : const RadialGradient(
                              colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                            ),
                      border: Border.all(
                        color: active ? Colors.white : AppTheme.borderDark,
                        width: active ? 2.2 : 1.2,
                      ),
                    ),
                  ),
                ),

                // Ícono central de estado
                Icon(
                  widget.isListening
                      ? Icons.mic_rounded
                      : widget.isSpeaking
                          ? Icons.volume_up_rounded
                          : Icons.mic_none_rounded,
                  color: Colors.white,
                  size: 32,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
