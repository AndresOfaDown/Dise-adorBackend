class SyncOperation {
  final int? id;
  final String endpoint;
  final String method; // 'POST', 'PUT', 'DELETE'
  final String payload; // JSON string
  final String timestamp;
  final String status; // 'PENDING', 'SYNCED', 'FAILED'

  SyncOperation({
    this.id,
    required this.endpoint,
    required this.method,
    required this.payload,
    required this.timestamp,
    this.status = 'PENDING',
  });

  Map<String, dynamic> toMap() {
    final map = <String, dynamic>{
      'endpoint': endpoint,
      'method': method,
      'payload': payload,
      'timestamp': timestamp,
      'status': status,
    };
    if (id != null) {
      map['id'] = id;
    }
    return map;
  }

  factory SyncOperation.fromMap(Map<String, dynamic> map) {
    return SyncOperation(
      id: map['id'] as int?,
      endpoint: map['endpoint'] as String,
      method: map['method'] as String,
      payload: map['payload'] as String? ?? '{}',
      timestamp: map['timestamp'] as String,
      status: map['status'] as String? ?? 'PENDING',
    );
  }

  SyncOperation copyWith({
    int? id,
    String? endpoint,
    String? method,
    String? payload,
    String? timestamp,
    String? status,
  }) {
    return SyncOperation(
      id: id ?? this.id,
      endpoint: endpoint ?? this.endpoint,
      method: method ?? this.method,
      payload: payload ?? this.payload,
      timestamp: timestamp ?? this.timestamp,
      status: status ?? this.status,
    );
  }
}
