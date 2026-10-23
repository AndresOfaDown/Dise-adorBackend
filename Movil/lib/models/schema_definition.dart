import 'dart:convert';

class DynamicField {
  final String name;
  final String type; // 'String', 'Integer', 'Double', 'Boolean', 'Long', etc.
  final String label;
  final bool primaryKey;
  final bool required;

  DynamicField({
    required this.name,
    required this.type,
    String? label,
    this.primaryKey = false,
    this.required = false,
  }) : label = label ?? name;

  factory DynamicField.fromJson(Map<String, dynamic> json) {
    return DynamicField(
      name: json['name'] as String? ?? 'campo',
      type: json['type'] as String? ?? 'String',
      label: json['label'] as String? ?? json['name'] as String? ?? 'Campo',
      primaryKey: json['primaryKey'] as bool? ?? json['readOnly'] as bool? ?? false,
      required: json['required'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'type': type,
        'label': label,
        'primaryKey': primaryKey,
        'required': required,
      };
}

class DynamicEntity {
  final String name;
  final String label;
  final String endpoint;
  final List<DynamicField> fields;

  DynamicEntity({
    required this.name,
    String? label,
    required this.endpoint,
    required this.fields,
  }) : label = label ?? name;

  factory DynamicEntity.fromJson(Map<String, dynamic> json) {
    final rawFields = json['fields'] as List<dynamic>? ?? [];
    return DynamicEntity(
      name: json['name'] as String? ?? 'Entidad',
      label: json['label'] as String? ?? json['name'] as String? ?? 'Entidad',
      endpoint: json['endpoint'] as String? ?? '/api/${(json['name'] ?? 'items').toString().toLowerCase()}',
      fields: rawFields
          .map((f) => DynamicField.fromJson(f as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'label': label,
        'endpoint': endpoint,
        'fields': fields.map((f) => f.toJson()).toList(),
      };
}

class DynamicSchema {
  final String businessName;
  final List<DynamicEntity> entities;

  DynamicSchema({
    required this.businessName,
    required this.entities,
  });

  factory DynamicSchema.fromJsonList(List<dynamic> list, {String? businessName}) {
    final entities = list
        .map((e) => DynamicEntity.fromJson(e as Map<String, dynamic>))
        .toList();
    final name = (businessName != null &&
            businessName != 'Sistema Adaptativo' &&
            businessName != 'Backend Spring Boot' &&
            businessName != 'Backend Detectado')
        ? businessName
        : inferBusinessName(entities);
    return DynamicSchema(businessName: name, entities: entities);
  }

  static String inferBusinessName(List<DynamicEntity> entities) {
    final names = entities.map((e) => e.name.toLowerCase()).toList();
    if (names.contains('orden') ||
        names.contains('ordens') ||
        names.contains('pago') ||
        names.contains('detalleorden')) {
      return 'E-Commerce';
    }
    if (names.contains('barbero') ||
        names.contains('servicio') ||
        names.contains('cita')) {
      return 'Barbería';
    }
    if (names.contains('doctor') ||
        names.contains('paciente') ||
        names.contains('cama')) {
      return 'Hospital';
    }
    if (names.contains('mesa') ||
        names.contains('pedido') ||
        names.contains('cafe')) {
      return 'Cafetería';
    }
    if (names.contains('receta') ||
        names.contains('medicamento') ||
        names.contains('farmacia')) {
      return 'Farmacia';
    }
    if (entities.isNotEmpty) {
      return entities.take(2).map((e) => e.label).join(' & ');
    }
    return 'Backend Activo';
  }

  factory DynamicSchema.fromJson(Map<String, dynamic> json) {
    final rawEntities = json['entities'] as List<dynamic>? ?? [];
    final entities = rawEntities
        .map((e) => DynamicEntity.fromJson(e as Map<String, dynamic>))
        .toList();
    final bName = json['businessName'] as String?;
    final name = (bName != null && bName.isNotEmpty && bName != 'Sistema Adaptativo' && bName != 'Backend Detectado')
        ? bName
        : inferBusinessName(entities);
    return DynamicSchema(
      businessName: name,
      entities: entities,
    );
  }

  Map<String, dynamic> toJson() => {
        'businessName': businessName,
        'entities': entities.map((e) => e.toJson()).toList(),
      };

  String toJsonString() => const JsonEncoder.withIndent('  ').convert(toJson());

  // ==========================================
  // PRESETS DE NEGOCIO PARA EL DÍA DEL EXAMEN
  // ==========================================

  static DynamicSchema presetFarmacia() {
    return DynamicSchema(
      businessName: 'Farmacia',
      entities: [
        DynamicEntity(
          name: 'Producto',
          label: 'Productos / Medicamentos',
          endpoint: '/api/v1/productos',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'nombreComercial', type: 'String', label: 'Nombre Comercial'),
            DynamicField(name: 'precioVenta', type: 'Double', label: 'Precio de Venta'),
            DynamicField(name: 'stockActual', type: 'Integer', label: 'Stock Actual'),
            DynamicField(name: 'concentracion', type: 'String', label: 'Concentración'),
          ],
        ),
        DynamicEntity(
          name: 'Cliente',
          label: 'Clientes',
          endpoint: '/api/v1/clientes',
          fields: [
            DynamicField(name: 'id', type: 'Long', primaryKey: true),
            DynamicField(name: 'codigoCliente', type: 'Integer', label: 'Código de Cliente'),
            DynamicField(name: 'puntosFidelidad', type: 'Integer', label: 'Puntos de Fidelidad'),
          ],
        ),
        DynamicEntity(
          name: 'Venta',
          label: 'Ventas',
          endpoint: '/api/v1/ventas',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'numeroFactura', type: 'String', label: 'Número de Factura'),
            DynamicField(name: 'totalVenta', type: 'Double', label: 'Total de Venta'),
            DynamicField(name: 'metodoPago', type: 'String', label: 'Método de Pago'),
          ],
        ),
      ],
    );
  }

  static DynamicSchema presetBarberia() {
    return DynamicSchema(
      businessName: 'Barbería',
      entities: [
        DynamicEntity(
          name: 'Barbero',
          label: 'Barberos',
          endpoint: '/api/v1/barberos',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'nombre', type: 'String', label: 'Nombre'),
            DynamicField(name: 'tarifa', type: 'Double', label: 'Tarifa'),
            DynamicField(name: 'especialidad', type: 'String', label: 'Especialidad'),
            DynamicField(name: 'telefono', type: 'String', label: 'Teléfono'),
          ],
        ),
        DynamicEntity(
          name: 'Servicio',
          label: 'Servicios de Corte',
          endpoint: '/api/v1/servicios',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'nombre', type: 'String', label: 'Servicio'),
            DynamicField(name: 'precio', type: 'Double', label: 'Precio'),
            DynamicField(name: 'duracionMinutos', type: 'Integer', label: 'Duración (min)'),
          ],
        ),
        DynamicEntity(
          name: 'Cita',
          label: 'Citas / Reservas',
          endpoint: '/api/v1/citas',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'cliente', type: 'String', label: 'Cliente'),
            DynamicField(name: 'barbero', type: 'String', label: 'Barbero'),
            DynamicField(name: 'fecha', type: 'String', label: 'Fecha'),
            DynamicField(name: 'hora', type: 'String', label: 'Hora'),
          ],
        ),
      ],
    );
  }

  static DynamicSchema presetHospital() {
    return DynamicSchema(
      businessName: 'Hospital',
      entities: [
        DynamicEntity(
          name: 'Doctor',
          label: 'Doctores / Médicos',
          endpoint: '/api/v1/doctores',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'nombre', type: 'String', label: 'Nombre Completo'),
            DynamicField(name: 'especialidad', type: 'String', label: 'Especialidad'),
            DynamicField(name: 'sala', type: 'String', label: 'Sala de Atención'),
          ],
        ),
        DynamicEntity(
          name: 'Paciente',
          label: 'Pacientes',
          endpoint: '/api/v1/pacientes',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'nombre', type: 'String', label: 'Nombre Paciente'),
            DynamicField(name: 'edad', type: 'Integer', label: 'Edad'),
            DynamicField(name: 'diagnostico', type: 'String', label: 'Diagnóstico'),
          ],
        ),
        DynamicEntity(
          name: 'Cama',
          label: 'Camas de Hospitalización',
          endpoint: '/api/v1/camas',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'numero', type: 'Integer', label: 'Número de Cama'),
            DynamicField(name: 'piso', type: 'Integer', label: 'Piso'),
            DynamicField(name: 'ocupada', type: 'Boolean', label: 'Está Ocupada'),
          ],
        ),
      ],
    );
  }

  static DynamicSchema presetCafeteria() {
    return DynamicSchema(
      businessName: 'Cafetería',
      entities: [
        DynamicEntity(
          name: 'Producto',
          label: 'Bebidas y Cafés',
          endpoint: '/api/v1/productos',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'nombre', type: 'String', label: 'Nombre del Café/Bebida'),
            DynamicField(name: 'precio', type: 'Double', label: 'Precio'),
            DynamicField(name: 'categoria', type: 'String', label: 'Categoría'),
            DynamicField(name: 'stock', type: 'Integer', label: 'Disponibilidad'),
          ],
        ),
        DynamicEntity(
          name: 'Mesa',
          label: 'Mesas del Local',
          endpoint: '/api/v1/mesas',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'numeroMesa', type: 'Integer', label: 'Número de Mesa'),
            DynamicField(name: 'capacidad', type: 'Integer', label: 'Capacidad de Personas'),
            DynamicField(name: 'estado', type: 'String', label: 'Estado (Libre/Ocupada)'),
          ],
        ),
        DynamicEntity(
          name: 'Pedido',
          label: 'Pedidos',
          endpoint: '/api/v1/pedidos',
          fields: [
            DynamicField(name: 'id', type: 'Integer', primaryKey: true),
            DynamicField(name: 'mesa', type: 'Integer', label: 'Mesa'),
            DynamicField(name: 'total', type: 'Double', label: 'Total'),
            DynamicField(name: 'estado', type: 'String', label: 'Estado'),
          ],
        ),
      ],
    );
  }
}
