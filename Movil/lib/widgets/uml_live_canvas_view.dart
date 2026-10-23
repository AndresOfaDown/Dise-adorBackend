import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../config/app_theme.dart';
import '../models/uml_diagram_model.dart';

class UmlLiveCanvasView extends StatefulWidget {
  final List<UmlClassNode> nodes;
  final List<UmlEdge> edges;

  const UmlLiveCanvasView({
    super.key,
    required this.nodes,
    required this.edges,
  });

  @override
  State<UmlLiveCanvasView> createState() => _UmlLiveCanvasViewState();
}

class _UmlLiveCanvasViewState extends State<UmlLiveCanvasView> {
  final TransformationController _transformationController = TransformationController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoFitDiagram());
  }

  @override
  void didUpdateWidget(covariant UmlLiveCanvasView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.nodes.length != widget.nodes.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _autoFitDiagram());
    }
  }

  @override
  void dispose() {
    _transformationController.dispose();
    super.dispose();
  }

  void _autoFitDiagram() {
    if (widget.nodes.isEmpty || !mounted) return;

    double minX = double.infinity;
    double minY = double.infinity;
    double maxX = -double.infinity;
    double maxY = -double.infinity;

    for (final node in widget.nodes) {
      minX = math.min(minX, node.x);
      minY = math.min(minY, node.y);
      maxX = math.max(maxX, node.x + 220);
      maxY = math.max(maxY, node.y + 180);
    }

    // Offset para centrar con el canvas interno (+2000 offset base)
    const double offsetX = 2000.0;
    const double offsetY = 2000.0;

    final targetCenterX = offsetX + (minX + maxX) / 2;
    final targetCenterY = offsetY + (minY + maxY) / 2;

    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;

    const double initialScale = 0.80;
    final tx = (screenWidth / 2) - (targetCenterX * initialScale);
    final ty = (screenHeight / 3) - (targetCenterY * initialScale);

    final matrix = Matrix4.identity()
      ..storage[12] = tx
      ..storage[13] = ty
      ..storage[0] = initialScale
      ..storage[5] = initialScale;

    _transformationController.value = matrix;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.nodes.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppTheme.borderSubtle, width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(Icons.dashboard_outlined, size: 36, color: AppTheme.accentIndigo),
              ),
              const SizedBox(height: 18),
              const Text(
                'No hay clases en este diagrama aún',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Los cambios y clases creadas en la versión Web aparecerán aquí en vivo en tiempo real.',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.4),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Canvas amplio de 5000x5000 con fondo suave idéntico a la web (#F1F5F9)
    const double canvasSize = 5000.0;
    const double originOffset = 2000.0;

    return Stack(
      children: [
        InteractiveViewer(
          transformationController: _transformationController,
          boundaryMargin: const EdgeInsets.all(3000),
          minScale: 0.05,
          maxScale: 3.5,
          constrained: false,
          child: Container(
            width: canvasSize,
            height: canvasSize,
            color: const Color(0xFFF1F5F9), // Fondo claro idéntico a la web ReactFlow
            child: Stack(
              children: [
                // 1. Rejilla suave Blueprint en gris claro (#CBD5E1)
                CustomPaint(
                  size: const Size(canvasSize, canvasSize),
                  painter: _GridPainter(step: 40.0),
                ),

                // 2. Líneas de Relación UML
                CustomPaint(
                  size: const Size(canvasSize, canvasSize),
                  painter: _UmlEdgePainter(
                    nodes: widget.nodes,
                    edges: widget.edges,
                    originOffset: originOffset,
                  ),
                ),

                // 3. Tarjetas de Clases UML Blancas con estilo Enterprise Architect / Web
                ...widget.nodes.map((node) {
                  return Positioned(
                    left: originOffset + node.x,
                    top: originOffset + node.y,
                    child: _UmlClassCard(node: node),
                  );
                }),
              ],
            ),
          ),
        ),

        // Botón flotante para centrar/enfocar el diagrama completo
        Positioned(
          bottom: 20,
          right: 20,
          child: FloatingActionButton.small(
            backgroundColor: AppTheme.accentIndigo,
            elevation: 4,
            onPressed: _autoFitDiagram,
            tooltip: 'Centrar Diagrama',
            child: const Icon(Icons.center_focus_strong, color: Colors.white, size: 20),
          ),
        ),
      ],
    );
  }
}

class _GridPainter extends CustomPainter {
  final double step;
  _GridPainter({required this.step});

  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = const Color(0xFFE2E8F0) // Rejilla suave (#e2e8f0)
      ..strokeWidth = 1.0;

    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), linePaint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), linePaint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _UmlClassCard extends StatelessWidget {
  final UmlClassNode node;

  const _UmlClassCard({required this.node});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 220,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF0F172A), width: 1.5), // Borde negro/slate sólido como en la web
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // 1. Header de Clase (Fondo blanco / sutil pizarra con icono y nombre)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
            decoration: const BoxDecoration(
              color: Color(0xFFF8FAFC),
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(6.5),
                topRight: Radius.circular(6.5),
              ),
              border: Border(
                bottom: BorderSide(color: Color(0xFF0F172A), width: 1.5),
              ),
            ),
            child: Column(
              children: [
                if (node.stereotype.isNotEmpty)
                  Text(
                    '«${node.stereotype}»',
                    style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 10,
                      fontStyle: FontStyle.italic,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        color: AppTheme.accentIndigo,
                        borderRadius: BorderRadius.circular(3),
                      ),
                      alignment: Alignment.center,
                      child: const Text(
                        'C',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        node.name,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Color(0xFF0F172A),
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // 2. Compartimiento de Atributos
          Container(
            padding: const EdgeInsets.all(8),
            color: Colors.white,
            child: node.attributes.isEmpty
                ? const Text(
                    'sin atributos',
                    style: TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 11,
                      fontStyle: FontStyle.italic,
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: node.attributes.map((attr) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2.0),
                        child: Text(
                          '${attr.visibility} ${attr.name}: ${attr.type}',
                          style: const TextStyle(
                            color: Color(0xFF1E293B),
                            fontSize: 11,
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    }).toList(),
                  ),
          ),

          // Separador de compartimiento
          const Divider(height: 1, thickness: 1.5, color: Color(0xFF0F172A)),

          // 3. Compartimiento de Métodos
          Container(
            padding: const EdgeInsets.all(8),
            decoration: const BoxDecoration(
              color: Color(0xFFFAFAFA),
              borderRadius: BorderRadius.only(
                bottomLeft: Radius.circular(6.5),
                bottomRight: Radius.circular(6.5),
              ),
            ),
            child: node.methods.isEmpty
                ? const Text(
                    'sin métodos',
                    style: TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 11,
                      fontStyle: FontStyle.italic,
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: node.methods.map((meth) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2.0),
                        child: Text(
                          '${meth.visibility} ${meth.name}(): ${meth.returnType}',
                          style: const TextStyle(
                            color: Color(0xFF334155),
                            fontSize: 11,
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    }).toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

class _UmlEdgePainter extends CustomPainter {
  final List<UmlClassNode> nodes;
  final List<UmlEdge> edges;
  final double originOffset;

  _UmlEdgePainter({
    required this.nodes,
    required this.edges,
    required this.originOffset,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = const Color(0xFF334155) // Líneas sólidas pizarra oscuro (#334155)
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke;

    const double cardWidth = 220.0;
    const double cardHeight = 120.0;

    for (final edge in edges) {
      final sourceNode = nodes.where((n) => n.id == edge.source).firstOrNull;
      final targetNode = nodes.where((n) => n.id == edge.target).firstOrNull;

      if (sourceNode == null || targetNode == null) continue;

      final start = Offset(
        originOffset + sourceNode.x + cardWidth / 2,
        originOffset + sourceNode.y + cardHeight / 2,
      );
      final end = Offset(
        originOffset + targetNode.x + cardWidth / 2,
        originOffset + targetNode.y + cardHeight / 2,
      );

      canvas.drawLine(start, end, linePaint);

      // Multiplicidad con etiquetas legibles sobre fondo blanco
      if (edge.sourceMultiplicity.isNotEmpty) {
        _drawMultiplicityBadge(canvas, edge.sourceMultiplicity, start + const Offset(12, 12));
      }
      if (edge.targetMultiplicity.isNotEmpty) {
        _drawMultiplicityBadge(canvas, edge.targetMultiplicity, end + const Offset(-24, -24));
      }
    }
  }

  void _drawMultiplicityBadge(Canvas canvas, String text, Offset position) {
    final textSpan = TextSpan(
      text: text,
      style: const TextStyle(
        color: AppTheme.accentIndigo,
        fontSize: 11,
        fontWeight: FontWeight.bold,
      ),
    );
    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();

    final bgRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(
        position.dx - 4,
        position.dy - 2,
        textPainter.width + 8,
        textPainter.height + 4,
      ),
      const Radius.circular(4),
    );

    final bgPaint = Paint()..color = Colors.white;
    final borderPaint = Paint()
      ..color = AppTheme.borderSubtle
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    canvas.drawRRect(bgRect, bgPaint);
    canvas.drawRRect(bgRect, borderPaint);
    textPainter.paint(canvas, position);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
