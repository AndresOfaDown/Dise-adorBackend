import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:movil/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Universal Voice Assistant smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const UniversalAssistantApp());
    expect(find.text('UNIVERSAL ASSISTANT'), findsOneWidget);
  });
}
