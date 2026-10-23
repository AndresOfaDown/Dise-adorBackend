import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'config/app_theme.dart';
import 'config/environment.dart';
import 'screens/login_screen.dart';
import 'screens/projects_list_screen.dart';
import 'services/api_service.dart';
import 'services/database_service.dart';
import 'services/diagram_monitor_service.dart';
import 'services/dynamic_nlu_service.dart';
import 'services/session_service.dart';
import 'services/sync_service.dart';
import 'services/voice_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  try {
    await DatabaseService().database;
  } catch (e) {
    debugPrint('Error inicializando assistant.db: $e');
  }

  runApp(const UniversalAssistantApp());
}

class UniversalAssistantApp extends StatelessWidget {
  const UniversalAssistantApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<SessionService>(
          create: (_) => SessionService(),
        ),
        ChangeNotifierProvider<Environment>(
          create: (_) => Environment(),
        ),
        ChangeNotifierProvider<DiagramMonitorService>(
          create: (_) => DiagramMonitorService(),
        ),
        ProxyProvider<Environment, ApiService>(
          update: (_, env, __) => ApiService(environment: env),
        ),
        ChangeNotifierProxyProvider<ApiService, DynamicNluService>(
          create: (ctx) {
            final env = Provider.of<Environment>(ctx, listen: false);
            return DynamicNluService(apiService: ApiService(environment: env));
          },
          update: (_, api, previous) => previous ?? DynamicNluService(apiService: api),
        ),
        ChangeNotifierProxyProvider<ApiService, SyncService>(
          create: (ctx) {
            final env = Provider.of<Environment>(ctx, listen: false);
            return SyncService(apiService: ApiService(environment: env));
          },
          update: (_, api, previous) => previous ?? SyncService(apiService: api),
        ),
        ChangeNotifierProvider<VoiceService>(
          create: (_) => VoiceService(),
        ),
      ],
      child: Consumer<SessionService>(
        builder: (context, session, _) {
          return MaterialApp(
            title: 'Monitor UML Colaborativo',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme,
            home: session.isAuthenticated
                ? const ProjectsListScreen()
                : const LoginScreen(),
          );
        },
      ),
    );
  }
}
