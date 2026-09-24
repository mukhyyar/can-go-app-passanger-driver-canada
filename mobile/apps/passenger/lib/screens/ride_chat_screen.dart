import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class RideChatScreen extends StatefulWidget {
  const RideChatScreen({super.key, required this.rideId});

  final String rideId;

  @override
  State<RideChatScreen> createState() => _RideChatScreenState();
}

class _RideChatScreenState extends State<RideChatScreen> {
  final _controller = TextEditingController();
  final _messages = <_ChatMsg>[];
  final _scroll = ScrollController();
  bool _loading = true;
  bool _sending = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _load(showSpinner: true);
      _poll = Timer.periodic(const Duration(seconds: 4), (_) {
        if (mounted && !_sending) _load(showSpinner: false);
      });
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({required bool showSpinner}) async {
    final app = context.read<AppState>();
    if (showSpinner) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final raw = await app.getChat(widget.rideId);
      final meId = app.me?['id']?.toString();
      final list = (raw['messages'] as List?) ?? const [];
      final parsed = list.whereType<Map>().map((m) {
        final senderId =
            m['senderId']?.toString() ?? m['authorId']?.toString();
        return _ChatMsg(
          text: m['body']?.toString() ?? '',
          mine: senderId != null && senderId == meId,
        );
      }).toList();
      if (!mounted) return;
      final grew = parsed.length != _messages.length;
      setState(() {
        _messages
          ..clear()
          ..addAll(parsed);
        _loading = false;
        _error = null;
      });
      if (grew && _scroll.hasClients) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scroll.hasClients) {
            _scroll.jumpTo(_scroll.position.maxScrollExtent);
          }
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (showSpinner || _messages.isEmpty) {
          final s = e.toString().toLowerCase();
          if (s.contains('unavailable') || s.contains('status')) {
            _error = 'Chat locked — ride completed';
          } else if (s.contains('forbidden') || s.contains('participant')) {
            _error = 'You are not a participant on this ride';
          } else {
            _error = 'Could not load chat';
          }
        }
      });
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    final app = context.read<AppState>();
    try {
      await app.sendChat(widget.rideId, text);
      _controller.clear();
      await _load(showSpinner: false);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not send message')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = app.rideById(widget.rideId);
    final offerId = ride?.selectedOfferId;
    final offer =
        offerId != null ? app.offerByIds(widget.rideId, offerId) : null;
    final title = offer != null
        ? '${offer.vehicleBrand} ${offer.vehicleModel}'.trim()
        : 'Ride chat';

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: Text(title),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop()
              ? context.pop()
              : context.go('/ride/${widget.rideId}'),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading && _messages.isEmpty
                ? const Center(
                    child: CircularProgressIndicator(color: GtColors.brand),
                  )
                : _error != null && _messages.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(_error!, textAlign: TextAlign.center),
                              const SizedBox(height: 12),
                              TextButton(
                                onPressed: () => _load(showSpinner: true),
                                child: const Text('Retry'),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _messages.isEmpty
                        ? const Center(
                            child: Text(
                              'No messages yet',
                              style: TextStyle(color: GtColors.textSecondary),
                            ),
                          )
                        : ListView.builder(
                            controller: _scroll,
                            padding: const EdgeInsets.all(16),
                            itemCount: _messages.length,
                            itemBuilder: (_, i) {
                              final m = _messages[i];
                              return Align(
                                alignment: m.mine
                                    ? Alignment.centerRight
                                    : Alignment.centerLeft,
                                child: Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 8,
                                  ),
                                  constraints: BoxConstraints(
                                    maxWidth:
                                        MediaQuery.of(context).size.width *
                                            0.75,
                                  ),
                                  decoration: BoxDecoration(
                                    color: m.mine
                                        ? GtColors.soft
                                        : GtColors.white,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: m.mine
                                          ? GtColors.brand
                                              .withValues(alpha: 0.14)
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
            child: _error != null &&
                    _error!.toLowerCase().contains('locked')
                ? Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(top: BorderSide(color: GtColors.border)),
                    ),
                    child: const Text(
                      'Chat locked — ride completed',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: GtColors.textSecondary,
                      ),
                    ),
                  )
                : Container(
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
                            enabled: _error == null || _messages.isNotEmpty,
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
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _send(),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          onPressed: _sending ? null : _send,
                          icon: _sending
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: GtColors.brand,
                                  ),
                                )
                              : const Icon(Icons.send, color: GtColors.brand),
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

class _ChatMsg {
  const _ChatMsg({required this.text, required this.mine});
  final String text;
  final bool mine;
}
