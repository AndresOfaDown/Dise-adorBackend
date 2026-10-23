import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../services/diagram_monitor_service.dart';
import '../widgets/uml_live_canvas_view.dart';

class DiagramMonitorScreen extends StatefulWidget {
  const DiagramMonitorScreen({super.key});

  @override
  State<DiagramMonitorScreen> createState() => _DiagramMonitorScreenState();
}

class _DiagramMonitorScreenState extends State<DiagramMonitorScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _projectController = TextEditingController(text: '1');
  final TextEditingController _hostController = TextEditingController(text: '127.0.0.1:8000');

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _projectController.dispose();
    _hostController.dispose();
    super.dispose();
  }

  void _showConnectionDialog(BuildContext context, DiagramMonitorService monitor) {
    _hostController.text = monitor.host;
    _projectController.text = monitor.currentProjectId ?? '1';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Conectar a Sala Web', style: TextStyle(color: AppTheme.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _hostController,
              style: const TextStyle(color: AppTheme.textPrimary),
              decoration: const InputDecoration(
                labelText: 'Host / IP Backend (Django)',
                labelStyle: TextStyle(color: AppTheme.textSecondary),
                hintText: 'ej. 127.0.0.1:8000 o 18.225.109.198',
                hintStyle: TextStyle(color: AppTheme.textMuted),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _projectController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: AppTheme.textPrimary),
              decoration: const InputDecoration(
                labelText: 'ID del Proyecto',
                labelStyle: TextStyle(color: AppTheme.textSecondary),
                hintText: 'ej. 1',
                hintStyle: TextStyle(color: AppTheme.textMuted),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.accentIndigo,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              monitor.setHost(_hostController.text);
              monitor.connect(_projectController.text.trim());
              Navigator.pop(ctx);
            },
            child: const Text('Conectar en Vivo', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showCollaboratorsBottomSheet(BuildContext context, DiagramMonitorService monitor) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppTheme.statusOnline,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'Conectados a este proyecto',
                        style: TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEEF2FF),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFC7D2FE)),
                    ),
                    child: Text(
                      '${monitor.collaborators.length} en línea',
                      style: const TextStyle(color: AppTheme.accentIndigo, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (monitor.collaborators.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 20),
                  child: Center(
                    child: Text(
                      'No se detectaron otros colaboradores conectados en este momento.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                    ),
                  ),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: monitor.collaborators.length,
                    separatorBuilder: (_, __) => const Divider(color: AppTheme.borderSubtle, height: 1),
                    itemBuilder: (context, idx) {
                      final c = monitor.collaborators[idx];
                      final name = c['username']?.toString() ?? 'Colaborador';
                      final colorHex = c['color']?.toString() ?? '#2563eb';
                      Color parsedColor;
                      try {
                        parsedColor = Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
                      } catch (_) {
                        parsedColor = AppTheme.accentIndigo;
                      }

                      final initials = name.isNotEmpty
                          ? (name.length >= 2 ? name.substring(0, 2).toUpperCase() : name[0].toUpperCase())
                          : 'U';

                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 16,
                              backgroundColor: parsedColor,
                              child: Text(
                                initials,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    name,
                                    style: const TextStyle(
                                      color: AppTheme.textPrimary,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                    ),
                                  ),
                                  const Text(
                                    'Activo en tiempo real',
                                    style: TextStyle(color: AppTheme.statusOnline, fontSize: 11),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: AppTheme.statusOnline,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              const SizedBox(height: 12),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final monitor = Provider.of<DiagramMonitorService>(context);

    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        toolbarHeight: 56,
        titleSpacing: 4,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(40),
          child: Container(
            height: 40,
            decoration: const BoxDecoration(
              border: Border(
                top: BorderSide(color: AppTheme.borderSubtle, width: 0.8),
                bottom: BorderSide(color: AppTheme.borderSubtle, width: 0.8),
              ),
            ),
            child: TabBar(
              controller: _tabController,
              isScrollable: true,
              tabAlignment: TabAlignment.center,
              labelPadding: const EdgeInsets.symmetric(horizontal: 12),
              indicatorColor: AppTheme.accentIndigo,
              indicatorWeight: 2.5,
              indicatorSize: TabBarIndicatorSize.label,
              labelColor: AppTheme.accentIndigo,
              unselectedLabelColor: AppTheme.textSecondary,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              unselectedLabelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
              tabs: [
                const Tab(
                  height: 38,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.schema_outlined, size: 15),
                      SizedBox(width: 5),
                      Text('Lienzo'),
                    ],
                  ),
                ),
                Tab(
                  height: 38,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.forum_outlined, size: 15),
                      const SizedBox(width: 5),
                      const Text('Actividad IA'),
                      if (monitor.isAiTyping) ...[
                        const SizedBox(width: 4),
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: AppTheme.statusOnline,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Tab(
                  height: 38,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.notifications_none_outlined, size: 15),
                      const SizedBox(width: 5),
                      Text(
                        monitor.notifications.isEmpty
                            ? 'Notificaciones'
                            : 'Notificaciones (${monitor.notifications.length})',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Monitoreo Movil en vivo',
              style: TextStyle(
                fontSize: 15.5,
                fontWeight: FontWeight.w800,
                color: AppTheme.textPrimary,
                letterSpacing: -0.3,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: monitor.status == ConnectionStateStatus.connected
                        ? AppTheme.statusOnline
                        : (monitor.status == ConnectionStateStatus.connecting
                            ? AppTheme.statusQueued
                            : AppTheme.statusError),
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  monitor.status == ConnectionStateStatus.connected
                      ? 'Sala #${monitor.currentProjectId ?? "1"} • ${monitor.nodes.length} clases'
                      : (monitor.status == ConnectionStateStatus.connecting ? 'Conectando...' : 'Desconectado'),
                  style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ],
        ),
        actions: [
          // Badge de Conectados
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => _showCollaboratorsBottomSheet(context, monitor),
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 12, horizontal: 2),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.borderSubtle),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.people_alt, color: AppTheme.accentIndigo, size: 14),
                  const SizedBox(width: 4),
                  Text(
                    '${monitor.collaborators.length}',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            constraints: const BoxConstraints(),
            icon: const Icon(Icons.settings_ethernet, color: AppTheme.textSecondary, size: 20),
            tooltip: 'Configurar Conexión',
            onPressed: () => _showConnectionDialog(context, monitor),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          // PESTAÑA 1: LIENZO EN VIVO
          UmlLiveCanvasView(
            nodes: monitor.nodes,
            edges: monitor.edges,
          ),

          // PESTAÑA 2: FEED DE MENSAJES Y DE LA IA SENIOR
          _buildTeamAiFeed(monitor),

          // PESTAÑA 3: NOTIFICACIONES DE CAMBIOS
          _buildNotificationsList(monitor),
        ],
      ),
    );
  }

  Widget _buildTeamAiFeed(DiagramMonitorService monitor) {
    if (monitor.messages.isEmpty && !monitor.isAiTyping) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.smart_toy_outlined, size: 54, color: AppTheme.textMuted.withValues(alpha: 0.5)),
            const SizedBox(height: 12),
            const Text(
              'No hay interacciones recientes en la sala',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            const Text(
              'Las preguntas del equipo y las respuestas de la IA Senior aparecerán aquí.',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: monitor.messages.length + (monitor.isAiTyping ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == monitor.messages.length && monitor.isAiTyping) {
          return Container(
            margin: const EdgeInsets.symmetric(vertical: 6),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF0FDF4),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFF86EFAC)),
            ),
            child: Row(
              children: [
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.statusOnline),
                ),
                const SizedBox(width: 10),
                Text(
                  monitor.aiTypingFor != null
                      ? '🤖 IA Senior analizando para ${monitor.aiTypingFor}...'
                      : '🤖 IA Senior analizando...',
                  style: const TextStyle(color: Color(0xFF166534), fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          );
        }

        final msg = monitor.messages[index];
        final isAi = msg.role == 'assistant';

        return Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isAi ? const Color(0xFFF0FDF4) : Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isAi ? const Color(0xFF86EFAC) : AppTheme.borderSubtle,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.02),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    isAi ? '🤖 IA Senior (Arquitecto)' : msg.senderName,
                    style: TextStyle(
                      color: isAi ? const Color(0xFF15803D) : AppTheme.accentIndigo,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    msg.timestamp.length >= 16 ? msg.timestamp.substring(11, 16) : '',
                    style: const TextStyle(color: AppTheme.textMuted, fontSize: 10),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                msg.text,
                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13, height: 1.35),
              ),
              if (msg.actions != null && msg.actions!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDCFCE7),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: const Color(0xFF86EFAC)),
                  ),
                  child: Text(
                    '⚡ ${msg.actions!.length} cambio(s) aplicado(s) al lienzo',
                    style: const TextStyle(color: Color(0xFF166534), fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildNotificationsList(DiagramMonitorService monitor) {
    if (monitor.notifications.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.notifications_none, size: 54, color: AppTheme.textMuted.withValues(alpha: 0.5)),
            const SizedBox(height: 12),
            const Text(
              'No hay notificaciones de actividad aún',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: monitor.notifications.length,
      separatorBuilder: (_, __) => const Divider(height: 1, color: AppTheme.borderSubtle),
      itemBuilder: (context, index) {
        final notif = monitor.notifications[index];
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.circle, size: 8, color: AppTheme.accentIndigo),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  notif,
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
