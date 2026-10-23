enum MessageStatus {
  none,
  online,
  offlineQueued,
  syncing,
  error,
}

class ChatMessage {
  final String id;
  final String text;
  final bool isUser;
  final DateTime timestamp;
  final MessageStatus status;
  final Map<String, dynamic>? structuredData;
  final List<dynamic>? listData;

  ChatMessage({
    required this.id,
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.status = MessageStatus.none,
    this.structuredData,
    this.listData,
  });

  ChatMessage copyWith({
    String? id,
    String? text,
    bool? isUser,
    DateTime? timestamp,
    MessageStatus? status,
    Map<String, dynamic>? structuredData,
    List<dynamic>? listData,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      text: text ?? this.text,
      isUser: isUser ?? this.isUser,
      timestamp: timestamp ?? this.timestamp,
      status: status ?? this.status,
      structuredData: structuredData ?? this.structuredData,
      listData: listData ?? this.listData,
    );
  }
}
