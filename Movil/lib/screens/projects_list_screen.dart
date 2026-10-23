import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../services/session_service.dart';
import '../services/diagram_monitor_service.dart';
import 'diagram_monitor_screen.dart';
import 'login_screen.dart';

class ProjectsListScreen extends StatefulWidget {
  const ProjectsListScreen({super.key});

  @override
  State<ProjectsListScreen> createState() => _ProjectsListScreenState();
}

class _ProjectsListScreenState extends State<ProjectsListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<SessionService>(context, listen: false).fetchProjects();
    });
  }

  void _openMonitor(BuildContext context, int projectId, String projectName) {
    final session = Provider.of<SessionService>(context, listen: false);
    final monitor = Provider.of<DiagramMonitorService>(context, listen: false);

    monitor.setHost(session.host);
    final username = session.currentUser?.username ?? 'Monitor Móvil';
    monitor.connect(projectId.toString(), username: username, token: session.token);

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const DiagramMonitorScreen(),
      ),
    );
  }

  void _handleLogout(BuildContext context) async {
    final monitor = Provider.of<DiagramMonitorService>(context, listen: false);
    monitor.disconnect();

    final session = Provider.of<SessionService>(context, listen: false);
    await session.logout();

    if (!context.mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = Provider.of<SessionService>(context);
    final user = session.currentUser;

    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: AppTheme.borderSubtle, height: 1),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Mis Proyectos Colaborativos',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
            ),
            if (user != null)
              Text(
                'Sesión: ${user.nombre ?? user.username} (${user.email})',
                style: const TextStyle(fontSize: 11, color: AppTheme.accentIndigo, fontWeight: FontWeight.w500),
              ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppTheme.textSecondary),
            tooltip: 'Actualizar proyectos',
            onPressed: () => session.fetchProjects(),
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.redAccent),
            tooltip: 'Cerrar sesión',
            onPressed: () => _handleLogout(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => session.fetchProjects(),
        color: AppTheme.accentIndigo,
        backgroundColor: Colors.white,
        child: session.isLoading && session.projects.isEmpty
            ? const Center(
                child: CircularProgressIndicator(color: AppTheme.accentIndigo),
              )
            : session.projects.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.folder_open, size: 64, color: AppTheme.textMuted.withValues(alpha: 0.5)),
                          const SizedBox(height: 16),
                          const Text(
                            'No tienes proyectos asignados',
                            style: TextStyle(color: AppTheme.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Crea un proyecto en la plataforma Web o pídele a tu equipo que te agregue como colaborador.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: session.projects.length,
                    itemBuilder: (context, index) {
                      final project = session.projects[index];
                      final isOwner = project.role == 'propietario';

                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppTheme.borderSubtle),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.03),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () => _openMonitor(context, project.id, project.name),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Row(
                                children: [
                                  Container(
                                    width: 46,
                                    height: 46,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFEEF2FF),
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: const Color(0xFFC7D2FE)),
                                    ),
                                    child: const Icon(Icons.account_tree_outlined, color: AppTheme.accentIndigo, size: 24),
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                project.name,
                                                style: const TextStyle(
                                                  color: AppTheme.textPrimary,
                                                  fontSize: 15,
                                                  fontWeight: FontWeight.bold,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
                                              decoration: BoxDecoration(
                                                color: isOwner ? const Color(0xFFEEF2FF) : const Color(0xFFECFDF5),
                                                borderRadius: BorderRadius.circular(5),
                                                border: Border.all(
                                                  color: isOwner ? const Color(0xFFC7D2FE) : const Color(0xFFA7F3D0),
                                                ),
                                              ),
                                              child: Text(
                                                project.role.toUpperCase(),
                                                style: TextStyle(
                                                  color: isOwner ? AppTheme.accentIndigo : const Color(0xFF059669),
                                                  fontSize: 9.5,
                                                  fontWeight: FontWeight.bold,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          project.description.isNotEmpty
                                              ? project.description
                                              : 'Sala colaborativa en tiempo real con IA',
                                          style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 8),
                                        Row(
                                          children: [
                                            const Icon(Icons.people_outline, size: 14, color: AppTheme.textMuted),
                                            const SizedBox(width: 4),
                                            Text(
                                              '${project.collaboratorsCount} colaboradores',
                                              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                                            ),
                                            const Spacer(),
                                            const Text(
                                              'Monitorear en Vivo →',
                                              style: TextStyle(
                                                color: AppTheme.accentBlue,
                                                fontSize: 12,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
