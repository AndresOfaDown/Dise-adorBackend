import 'package:flutter/material.dart';

class AppTheme {
  // ==========================================
  // PALETA CLARA / WHITE & SLATE (Web ReactFlow)
  // ==========================================
  static const Color bgPrimary = Color(0xFFF8FAFC);   // Gris muy claro base (#f8fafc)
  static const Color bgCanvas = Color(0xFFF1F5F9);    // Lienzo pizarra suave (#f1f5f9)
  static const Color bgCard = Color(0xFFFFFFFF);      // Blanco puro (#ffffff)
  static const Color bgInput = Color(0xFFFFFFFF);
  static const Color borderSubtle = Color(0xFFE2E8F0); // Borde sutil gris (#e2e8f0)
  static const Color borderCard = Color(0xFFCBD5E1);

  // Acentos Corporativos Web
  static const Color accentIndigo = Color(0xFF4F46E5); // Azul índigo principal (#4f46e5)
  static const Color accentBlue = Color(0xFF2563EB);   // Azul real (#2563eb)
  static const Color accentCyan = Color(0xFF0284C7);   // Cian (#0284c7)
  static const Color accentPurple = Color(0xFF7C3AED); // Púrpura (#7c3aed)

  // Estados y Sincronización
  static const Color statusOnline = Color(0xFF10B981);
  static const Color statusQueued = Color(0xFFF59E0B);
  static const Color statusError = Color(0xFFEF4444);
  static const Color statusSyncing = Color(0xFF3B82F6);

  // Textos de alto contraste sobre fondo blanco
  static const Color textPrimary = Color(0xFF0F172A);   // Slate 900 casi negro (#0f172a)
  static const Color textSecondary = Color(0xFF475569); // Slate 600 gris medio (#475569)
  static const Color textMuted = Color(0xFF94A3B8);     // Slate 400 gris tenue (#94a3b8)

  // ==========================================
  // COMPATIBILIDAD CON VISTAS PREVIAS (TEMA CLARO)
  // Reemplazando tonos oscuros por la paleta limpia blanca
  // ==========================================
  static const Color bgDark = Color(0xFFF8FAFC);        // Mapeado a blanco sutil
  static const Color surfaceDark = Color(0xFFFFFFFF);   // Mapeado a blanco tarjeta
  static const Color cardDark = Color(0xFFFFFFFF);      // Mapeado a blanco tarjeta
  static const Color borderDark = Color(0xFFE2E8F0);    // Borde gris claro limpio

  // Colores de realce adaptados al tema claro (legibles y vibrantes)
  static const Color neonCyan = Color(0xFF0284C7);      // Sky / Cyan legible
  static const Color neonCyanLight = Color(0xFF38BDF8);
  static const Color neonViolet = Color(0xFF7C3AED);    // Púrpura elegante
  static const Color neonVioletLight = Color(0xFFA855F7);

  // Degradados modernos claros
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const RadialGradient micGlowGradient = RadialGradient(
    colors: [Color(0xFFC7D2FE), Color(0x00C7D2FE)],
    stops: [0.0, 1.0],
  );

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: bgPrimary,
      primaryColor: accentIndigo,
      colorScheme: const ColorScheme.light(
        primary: accentIndigo,
        secondary: accentBlue,
        surface: bgCard,
        error: statusError,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: textPrimary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bgCard,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        iconTheme: IconThemeData(color: textPrimary),
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 16,
          fontWeight: FontWeight.bold,
        ),
      ),
      cardTheme: CardThemeData(
        color: bgCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: borderSubtle),
        ),
      ),
    );
  }

  // Alias para mantener compatibilidad si se invoca darkTheme
  static ThemeData get darkTheme => lightTheme;
}
