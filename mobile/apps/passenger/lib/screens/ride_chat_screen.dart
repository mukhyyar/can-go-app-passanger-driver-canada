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
  bool _chatLocked = false;
  String? _lockReason;
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
      final isLockedRaw = raw['isLocked'] == true;
      final lockReasonRaw = raw['lockReason']?.toString();
      final meId = app.me?['id']?.toString();
      final list = (raw['messages'] as List?) ?? const [];
      final parsed = list.whereType<Map>().map((m) {
        final senderId =
            m['senderId']?.toString() ?? m['authorId']?.toString();
        final role = m['senderRole']?.toString();
        final rawDt = m['createdAt'];
        DateTime? dt;
        if (rawDt is String) {
          dt = DateTime.tryParse(rawDt)?.toLocal();
        }
        return _ChatMsg(
          text: m['body']?.toString() ?? '',
          mine: senderId != null && senderId == meId,
          senderRole: role,
          createdAt: dt,
        );
      }).toList();
      if (!mounted) return;
      final grew = parsed.length != _messages.length;
      setState(() {
        _chatLocked = isLockedRaw;
        _lockReason = lockReasonRaw;
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
          if (s.contains('locked') || s.contains('cancel') || s.contains('completed') || s.contains('unavailable') || s.contains('status')) {
            if (s.contains('cancel')) {
              _error = 'Chat locked — ride cancelled';
            } else {
              _error = 'Chat locked — ride completed';
            }
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
    final statusUpper = (ride?.serverStatus ?? '').toUpperCase();
    final isTerminal = _chatLocked ||
        ride?.isChatLocked == true ||
        statusUpper == 'COMPLETED' ||
        statusUpper.contains('CANCEL') ||
        statusUpper == 'NO_SHOW' ||
        statusUpper == 'EXPIRED' ||
        statusUpper == 'PAYMENT_FAILED';

    final isLocked = _chatLocked ||
        isTerminal ||
        (_error != null && _error!.toLowerCase().contains('locked'));

    String lockBannerText = 'Chat locked — ride completed';
    if (_lockReason == 'RIDE_CANCELLED' ||
        statusUpper.contains('CANCEL') ||
        (_error != null && _error!.toLowerCase().contains('cancel'))) {
      lockBannerText = 'Chat locked — ride cancelled';
    } else if (_lockReason == 'RIDE_COMPLETED' || statusUpper == 'COMPLETED') {
      lockBannerText = 'Chat locked — ride completed';
    } else if (statusUpper == 'NO_SHOW') {
      lockBannerText = 'Chat locked — no show';
    }

    final title = !isTerminal && offer != null
        ? '${offer.vehicleBrand} ${offer.vehicleModel}'.trim()
        : (ride?.shortId != null ? 'Ride #${ride!.shortId}' : 'Ride chat');

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
                              final isSupport = m.senderRole == 'SUPPORT';
                              final timeStr = _formatTime(m.createdAt);
                              final roleLabel = m.mine
                                  ? 'Rider (You)'
                                  : (isSupport ? 'Can-Ride Support' : 'Driver');
                              final roleIcon = m.mine
                                  ? Icons.person
                                  : (isSupport
                                      ? Icons.support_agent
                                      : Icons.drive_eta);

                              return Align(
                                alignment: m.mine
                                    ? Alignment.centerRight
                                    : Alignment.centerLeft,
                                child: Container(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  constraints: BoxConstraints(
                                    maxWidth:
                                        MediaQuery.of(context).size.width *
                                            0.78,
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 10,
                                  ),
                                  decoration: BoxDecoration(
                                    color: m.mine
                                        ? GtColors.brand
                                        : Colors.white,
                                    borderRadius: BorderRadius.only(
                                      topLeft: const Radius.circular(16),
                                      topRight: const Radius.circular(16),
                                      bottomLeft: Radius.circular(
                                          m.mine ? 16 : 4),
                                      bottomRight: Radius.circular(
                                          m.mine ? 4 : 16),
                                    ),
                                    border: Border.all(
                                      color: m.mine
                                          ? GtColors.brand
                                          : const Color(0xFFE2E8F0),
                                      width: 1,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(
                                            alpha: m.mine ? 0.08 : 0.04),
                                        blurRadius: 4,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: Column(
                                    crossAxisAlignment: m.mine
                                        ? CrossAxisAlignment.end
                                        : CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      // Sender Role Badge Pill
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 7,
                                          vertical: 3,
                                        ),
                                        margin:
                                            const EdgeInsets.only(bottom: 6),
                                        decoration: BoxDecoration(
                                          color: m.mine
                                              ? Colors.white
                                                  .withValues(alpha: 0.22)
                                              : (isSupport
                                                  ? const Color(0xFFFEF3C7)
                                                  : const Color(0xFFEFF6FF)),
                                          borderRadius:
                                              BorderRadius.circular(6),
                                          border: m.mine
                                              ? null
                                              : Border.all(
                                                  color: isSupport
                                                      ? const Color(0xFFFDE68A)
                                                      : const Color(
                                                          0xFFBFDBFE),
                                                  width: 0.8,
                                                ),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Icon(
                                              roleIcon,
                                              size: 12,
                                              color: m.mine
                                                  ? Colors.white
                                                  : (isSupport
                                                      ? const Color(0xFFB45309)
                                                      : const Color(
                                                          0xFF1D4ED8)),
                                            ),
                                            const SizedBox(width: 4),
                                            Text(
                                              roleLabel,
                                              style: TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w600,
                                                color: m.mine
                                                    ? Colors.white
                                                    : (isSupport
                                                        ? const Color(
                                                            0xFFB45309)
                                                        : const Color(
                                                            0xFF1D4ED8)),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      // Message Text
                                      Text(
                                        m.text,
                                        style: TextStyle(
                                          fontSize: 14,
                                          height: 1.35,
                                          color: m.mine
                                              ? Colors.white
                                              : const Color(0xFF0F172A),
                                        ),
                                      ),
                                      if (timeStr.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(
                                          timeStr,
                                          style: TextStyle(
                                            fontSize: 10,
                                            color: m.mine
                                                ? Colors.white
                                                    .withValues(alpha: 0.75)
                                                : GtColors.textSecondary,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
          ),
          SafeArea(
            top: false,
            child: isLocked
                ? Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      border: Border(top: BorderSide(color: GtColors.border)),
                    ),
                    child: Text(
                      lockBannerText,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
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

String _formatTime(DateTime? dt) {
  if (dt == null) return '';
  final hour = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
  final minute = dt.minute.toString().padLeft(2, '0');
  final ampm = dt.hour >= 12 ? 'PM' : 'AM';
  return '$hour:$minute $ampm';
}

class _ChatMsg {
  const _ChatMsg({
    required this.text,
    required this.mine,
    this.senderRole,
    this.createdAt,
  });
  final String text;
  final bool mine;
  final String? senderRole;
  final DateTime? createdAt;
}
