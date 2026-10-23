import 'package:flutter/material.dart';
import '../config/app_theme.dart';

class GlowingMicButton extends StatefulWidget {
  final bool isListening;
  final bool isSpeaking;
  final double soundLevel;
  final VoidCallback onPressed;

  const GlowingMicButton({
    super.key,
    required this.isListening,
    required this.isSpeaking,
    this.soundLevel = 0.0,
    required this.onPressed,
  });

  @override
  State<GlowingMicButton> createState() => _GlowingMicButtonState();
}

class _GlowingMicButtonState extends State<GlowingMicButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.25).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bool active = widget.isListening || widget.isSpeaking;

    return AnimatedBuilder(
      animation: _pulseAnimation,
      builder: (context, child) {
        // Factor de escala dinámico basado en volumen o animación de pulso
        double scale = 1.0;
        if (widget.isListening) {
          final levelFactor = (widget.soundLevel.clamp(0.0, 10.0) / 10.0) * 0.25;
          scale = _pulseAnimation.value + levelFactor;
        } else if (widget.isSpeaking) {
          scale = _pulseAnimation.value * 0.95;
        }

        return Stack(
          alignment: Alignment.center,
          children: [
            // Resplandor exterior pulsante
            if (active)
              Transform.scale(
                scale: scale * 1.35,
                child: Container(
                  width: 76,
                  height: 76,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: widget.isListening
                            ? AppTheme.neonCyan.withValues(alpha: 0.45)
                            : AppTheme.neonViolet.withValues(alpha: 0.45),
                        blurRadius: 28,
                        spreadRadius: 8,
                      ),
                      BoxShadow(
                        color: AppTheme.neonViolet.withValues(alpha: 0.3),
                        blurRadius: 36,
                        spreadRadius: 14,
                      ),
                    ],
                  ),
                ),
              ),

            // Anillo intermedio
            if (active)
              Transform.scale(
                scale: scale,
                child: Container(
                  width: 82,
                  height: 82,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: widget.isListening
                          ? AppTheme.neonCyanLight.withValues(alpha: 0.8)
                          : AppTheme.neonVioletLight.withValues(alpha: 0.8),
                      width: 2.5,
                    ),
                  ),
                ),
              ),

            // Botón principal
            GestureDetector(
              onTap: widget.onPressed,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: active
                      ? AppTheme.micGlowGradient
                      : const LinearGradient(
                          colors: [Color(0xFF1F2937), Color(0xFF111827)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                  border: Border.all(
                    color: active ? Colors.white : AppTheme.borderDark,
                    width: active ? 2 : 1,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: active
                          ? AppTheme.neonCyan.withValues(alpha: 0.6)
                          : Colors.black.withValues(alpha: 0.5),
                      blurRadius: active ? 20 : 8,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(
                  widget.isListening
                      ? Icons.mic
                      : widget.isSpeaking
                          ? Icons.volume_up_rounded
                          : Icons.mic_none_rounded,
                  color: active ? Colors.white : AppTheme.neonCyan,
                  size: 34,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
