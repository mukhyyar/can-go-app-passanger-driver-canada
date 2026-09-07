import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';

class ChatDetailScreen extends StatefulWidget {
  const ChatDetailScreen({super.key, required this.threadId});

  final String threadId;

  @override
  State<ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends State<ChatDetailScreen> {
  final _controller = TextEditingController();
  late final List<_Msg> _messages;

  @override
  void initState() {
    super.initState();
    final thread = MockData.chats().cast<ChatThread?>().firstWhere(
          (c) => c?.id == widget.threadId,
          orElse: () => null,
        );
    _messages = [
      if (thread != null) _Msg(text: thread.lastMessage, mine: false),
    ];
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages.add(_Msg(text: text, mine: true));
      _controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final thread = MockData.chats().cast<ChatThread?>().firstWhere(
          (c) => c?.id == widget.threadId,
          orElse: () => null,
        );
    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CanGoLogo(size: 28),
            const SizedBox(width: 8),
            Flexible(child: Text(thread?.title ?? 'Chat')),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (_, i) {
                final m = _messages[i];
                return Align(
                  alignment: m.mine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.75,
                    ),
                    decoration: BoxDecoration(
                      color: m.mine ? GtColors.soft : GtColors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: m.mine
                            ? GtColors.brand.withValues(alpha: 0.14)
                            : GtColors.border,
                      ),
                    ),
                    child: Text(m.text),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: GtColors.border)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      decoration: InputDecoration(
                        hintText: 'Message',
                        filled: true,
                        fillColor: GtColors.bgGrey,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: _send,
                    icon: const Icon(Icons.send, color: GtColors.brand),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Msg {
  _Msg({required this.text, required this.mine});
  final String text;
  final bool mine;
}
