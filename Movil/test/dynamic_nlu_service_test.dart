import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:movil/config/environment.dart';
import 'package:movil/models/schema_definition.dart';
import 'package:movil/services/api_service.dart';
import 'package:movil/services/dynamic_nlu_service.dart';

import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  late DynamicNluService nluService;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    final env = Environment();
    final api = ApiService(environment: env);
    nluService = DynamicNluService(apiService: api);
  });

  group('Universal Voice Assistant: Dynamic NLU con Fuzzy Matching', () {
    test('Barbería: Registra barbero Carlos con tarifa 50', () {
      final schema = DynamicSchema.presetBarberia();
      final res = nluService.parseUserInput('Registra barbero Carlos con tarifa 50', schema);

      expect(res.intent, CrudIntent.create);
      expect(res.matchedEntity?.name, 'Barbero');
    });

    test('Hospital: Muestra los doctores (manejo de plurales y fuzzy)', () {
      final schema = DynamicSchema.presetHospital();
      final res = nluService.parseUserInput('Muestra los doctores', schema);

      expect(res.intent, CrudIntent.read);
      expect(res.matchedEntity?.name, 'Doctor');
    });

    test('Cafetería: Crea un producto Capuchino con precio 15', () {
      final schema = DynamicSchema.presetCafeteria();
      final res = nluService.parseUserInput('Crea un producto Capuchino con precio 15', schema);

      expect(res.intent, CrudIntent.create);
      expect(res.matchedEntity?.name, 'Producto');
    });

    test('Farmacia: ¿Cuál es el stock de Paracetamol?', () {
      final schema = DynamicSchema.presetFarmacia();
      final res = nluService.parseUserInput('¿Cuál es el stock de Paracetamol?', schema);

      expect(res.intent, CrudIntent.read);
      expect(res.matchedEntity?.name, 'Producto');
    });

    test('Eliminación dinámica por ID', () {
      final schema = DynamicSchema.presetFarmacia();
      final res = nluService.parseUserInput('Elimina el producto 4', schema);

      expect(res.intent, CrudIntent.delete);
      expect(res.matchedEntity?.name, 'Producto');
      expect(res.targetId, '4');
    });

    test('Actualización dinámica con nuevo precio', () {
      final schema = DynamicSchema.presetFarmacia();
      final res = nluService.parseUserInput('Actualiza el precio del producto 2 a 30', schema);

      expect(res.intent, CrudIntent.update);
      expect(res.matchedEntity?.name, 'Producto');
      expect(res.targetId, '2');
    });

    test('Intent de ayuda', () {
      final schema = DynamicSchema.presetFarmacia();
      final res = nluService.parseUserInput('Ayuda', schema);
      expect(res.intent, CrudIntent.help);
    });

    test('Intent desconocido', () {
      final schema = DynamicSchema.presetFarmacia();
      final res = nluService.parseUserInput('xyz abc 123', schema);
      expect(res.intent, CrudIntent.unknown);
    });

    test('Agrega categoría (e-commerce)', () {
      final schema = DynamicSchema.fromJsonList([
        {
          'name': 'Categoria',
          'label': 'Categoria',
          'endpoint': '/api/v1/categorias',
          'fields': [
            {'name': 'id', 'type': 'Integer', 'label': 'ID', 'readOnly': true},
            {'name': 'nombre', 'type': 'String', 'label': 'Nombre', 'readOnly': false},
            {'name': 'descripcion', 'type': 'String', 'label': 'Descripcion', 'readOnly': false},
          ]
        }
      ], businessName: 'E-Commerce');

      final res = nluService.parseUserInput('Agrega la categoría Audífonos', schema);
      expect(res.intent, CrudIntent.create);
      expect(res.matchedEntity?.name, 'Categoria');
    });

    test('Clínica: añade el paciente con nombre Leonardo con la edad de 20 años con email leonardo613@gmail.com', () {
      final schema = DynamicSchema.fromJsonList([
        {
          'name': 'Paciente',
          'label': 'Paciente',
          'endpoint': '/api/v1/pacientes',
          'fields': [
            {'name': 'id', 'type': 'Integer', 'label': 'ID', 'readOnly': true},
            {'name': 'nombre', 'type': 'String', 'label': 'Nombre', 'readOnly': false},
            {'name': 'edad', 'type': 'Integer', 'label': 'Edad', 'readOnly': false},
            {'name': 'email', 'type': 'String', 'label': 'Email', 'readOnly': false},
          ]
        }
      ], businessName: 'Hospital');

      final res = nluService.parseUserInput(
        'añade el paciente con nombre Leonardo con la edad de 20 años con email leonardo613@gmail.com',
        schema,
      );

      expect(res.intent, CrudIntent.create);
      expect(res.matchedEntity?.name, 'Paciente');
      expect(res.extractedPayload['nombre'], 'Leonardo');
      expect(res.extractedPayload['edad'], 20);
      expect(res.extractedPayload['email'], 'leonardo613@gmail.com');
    });

    test('Consulta natural: que datos tenemos del paciente leonardo??', () {
      final schema = DynamicSchema.fromJsonList([
        {
          'name': 'Paciente',
          'label': 'Paciente',
          'endpoint': '/api/v1/pacientes',
          'fields': [
            {'name': 'id', 'type': 'Integer', 'label': 'ID', 'readOnly': true},
            {'name': 'nombre', 'type': 'String', 'label': 'Nombre', 'readOnly': false},
            {'name': 'edad', 'type': 'Integer', 'label': 'Edad', 'readOnly': false},
            {'name': 'email', 'type': 'String', 'label': 'Email', 'readOnly': false},
          ]
        }
      ], businessName: 'Hospital');

      final res = nluService.parseUserInput(
        'que datos tenemos del paciente leonardo??',
        schema,
      );

      expect(res.intent, CrudIntent.read);
      expect(res.matchedEntity?.name, 'Paciente');
      expect(res.mainSubject?.toLowerCase(), 'leonardo');
    });
  });
}
