from django.test import TestCase
from projects.uml_service import (
    export_diagram_to_xmi,
    export_diagram_to_puml,
    parse_uml_file,
)

class UmlInteropTestCase(TestCase):
    def setUp(self):
        self.nodes = [
            {
                "id": "node_1",
                "type": "umlClass",
                "position": {"x": 100, "y": 150},
                "data": {
                    "name": "Cliente",
                    "stereotype": "",
                    "attributes": [
                        {"id": "a1", "visibility": "+", "name": "id", "type": "int"},
                        {"id": "a2", "visibility": "-", "name": "nombre", "type": "string"},
                    ],
                    "methods": [
                        {"id": "m1", "visibility": "+", "name": "obtenerDatos", "parameters": "", "returnType": "void"}
                    ],
                },
            },
            {
                "id": "node_2",
                "type": "umlClass",
                "position": {"x": 400, "y": 150},
                "data": {
                    "name": "Pedido",
                    "stereotype": "",
                    "attributes": [
                        {"id": "a3", "visibility": "+", "name": "id", "type": "int"},
                        {"id": "a4", "visibility": "+", "name": "total", "type": "float"},
                    ],
                    "methods": [],
                },
            },
            {
                "id": "node_assoc_1",
                "type": "umlClass",
                "position": {"x": 250, "y": 300},
                "data": {
                    "name": "DetallePedido",
                    "stereotype": "association-class",
                    "attributes": [
                        {"id": "a5", "visibility": "+", "name": "cantidad", "type": "int"},
                        {"id": "a6", "visibility": "+", "name": "precioUnitario", "type": "float"},
                    ],
                    "methods": [],
                },
            },
        ]

        self.edges = [
            {
                "id": "edge_1",
                "source": "node_1",
                "target": "node_2",
                "data": {
                    "relationType": "associationClass",
                    "associationClassId": "node_assoc_1",
                    "sourceMultiplicity": "1",
                    "targetMultiplicity": "*",
                    "label": "compra",
                },
            }
        ]

    def test_export_to_xmi(self):
        xmi_output = export_diagram_to_xmi(self.nodes, self.edges, "com.tienda.uml")
        self.assertIn('<xmi:XMI', xmi_output)
        self.assertIn('name="Cliente"', xmi_output)
        self.assertIn('name="Pedido"', xmi_output)
        self.assertIn('name="DetallePedido"', xmi_output)
        self.assertIn('associationClass=', xmi_output)
        self.assertIn('value="1"', xmi_output)
        self.assertIn('value="*"', xmi_output)

    def test_export_to_puml(self):
        puml_output = export_diagram_to_puml(self.nodes, self.edges, "com.tienda.uml")
        self.assertIn('@startuml', puml_output)
        self.assertIn('class Cliente', puml_output)
        self.assertIn('class Pedido', puml_output)
        self.assertIn('class DetallePedido', puml_output)
        self.assertIn('(Cliente, Pedido) .. DetallePedido', puml_output)
        self.assertIn('@enduml', puml_output)

    def test_roundtrip_puml(self):
        puml_code = """
@startuml
package "com.test" {
  class Estudiante {
    + id: int
    + nombre: string
    + matricular(): bool
  }
  class Curso {
    + codigo: string
    + titulo: string
  }
  class Matricula {
    + semestre: string
  }
}
(Estudiante, Curso) .. Matricula
@enduml
        """
        parsed = parse_uml_file(puml_code, "test.puml")
        class_names = [c["name"] for c in parsed["classes"]]
        self.assertIn("Estudiante", class_names)
        self.assertIn("Curso", class_names)
        self.assertIn("Matricula", class_names)
        self.assertEqual(len(parsed["relations"]), 1)
        self.assertEqual(parsed["relations"][0]["type"], "associationClass")
        self.assertEqual(parsed["relations"][0]["associationClassName"], "Matricula")

    def test_roundtrip_xmi(self):
        xmi_code = export_diagram_to_xmi(self.nodes, self.edges, "com.tienda.uml")
        parsed = parse_uml_file(xmi_code, "test.xmi")
        class_names = [c["name"] for c in parsed["classes"]]
        self.assertIn("Cliente", class_names)
        self.assertIn("Pedido", class_names)
        self.assertIn("DetallePedido", class_names)
        self.assertTrue(len(parsed["classes"]) >= 3)
