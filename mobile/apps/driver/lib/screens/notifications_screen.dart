import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    if (!app.isAuthenticated) {
      if (mounted) context.go('/auth');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await app.listNotifications();
      await app.refreshUnreadNotificationCount();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _markAll() async {
    final app = context.read<AppState>();
    try {
      await app.markAllNotificationsRead();
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not mark all read: $e')),
      );
    }
  }

  Future<void> _openItem(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    final unread = item['readAt'] == null;
    if (id != null && unread) {
      try {
        await context.read<AppState>().markNotificationRead(id);
        setState(() {
          _items = _items.map((e) {
            if (e['id']?.toString() != id) return e;
            return {...e, 'readAt': DateTime.now().toIso8601String()};
          }).toList();
        });
      } catch (_) {}
    }
    final data = item['data'];
    if (!mounted) return;
    if (data is Map) {
      final rideId = data['rideId']?.toString();
      final type = data['type']?.toString();
      if (rideId != null && rideId.isNotEmpty) {
        if (type == 'chat') {
          context.push('/chat/$rideId');
        } else {
          context.push('/request/$rideId');
        }
      }
    }
  }

  String _formatWhen(dynamic raw) {
    if (raw == null) return '';
    final dt = raw is DateTime
        ? raw
        : DateTime.tryParse(raw.toString())?.toLocal();
    if (dt == null) return '';
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat.MMMd().add_jm().format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final unread = context.watch<AppState>().unreadNotificationCount;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: _markAll,
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: GtColors.brand,
        onRefresh: _load,
        child: _loading
            ? ListView(
                children: const [
                  SizedBox(height: 120),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : _error != null
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      const SizedBox(height: 48),
                      const Text(
                        'Could not load notifications',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: GtColors.text,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: GtColors.textSecondary),
                      ),
                      const SizedBox(height: 16),
                      Center(
                        child: TextButton(
                          onPressed: _load,
                          child: const Text('Retry'),
                        ),
                      ),
                    ],
                  )
                : _items.isEmpty
                    ? ListView(
                        children: const [
                          SizedBox(height: 80),
                          Icon(
                            Icons.notifications_none_outlined,
                            size: 48,
                            color: GtColors.textMuted,
                          ),
                          SizedBox(height: 12),
                          Text(
                            'No notifications yet',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: GtColors.text,
                            ),
                          ),
                          SizedBox(height: 6),
                          Text(
                            'Ride requests and updates will show up here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: GtColors.textSecondary),
                          ),
                        ],
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 12, 12, 28),
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final item = _items[index];
                          final unreadItem = item['readAt'] == null;
                          final title = item['title']?.toString() ?? 'Update';
                          final body = item['body']?.toString() ?? '';
                          final when = _formatWhen(item['createdAt']);
                          return Material(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () => _openItem(item),
                              child: Container(
                                padding:
                                    const EdgeInsets.fromLTRB(14, 12, 14, 12),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: unreadItem
                                        ? GtColors.brand
                                            .withValues(alpha: 0.25)
                                        : GtColors.border,
                                  ),
                                  color: unreadItem
                                      ? GtColors.soft.withValues(alpha: 0.55)
                                      : Colors.white,
                                ),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      width: 40,
                                      height: 40,
                                      decoration: const BoxDecoration(
                                        color: GtColors.soft,
                                        shape: BoxShape.circle,
                                      ),
                                      alignment: Alignment.center,
                                      child: Icon(
                                        unreadItem
                                            ? Icons
                                                .notifications_active_outlined
                                            : Icons.notifications_outlined,
                                        color: GtColors.brand,
                                        size: 20,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  title,
                                                  style: TextStyle(
                                                    fontSize: 15,
                                                    fontWeight: unreadItem
                                                        ? FontWeight.w700
                                                        : FontWeight.w600,
                                                    color: GtColors.text,
                                                  ),
                                                ),
                                              ),
                                              if (unreadItem)
                                                Container(
                                                  width: 8,
                                                  height: 8,
                                                  decoration:
                                                      const BoxDecoration(
                                                    color: GtColors.brand,
                                                    shape: BoxShape.circle,
                                                  ),
                                                ),
                                            ],
                                          ),
                                          if (body.isNotEmpty) ...[
                                            const SizedBox(height: 4),
                                            Text(
                                              body,
                                              style: const TextStyle(
                                                fontSize: 13,
                                                height: 1.35,
                                                color: GtColors.textSecondary,
                                              ),
                                            ),
                                          ],
                                          if (when.isNotEmpty) ...[
                                            const SizedBox(height: 6),
                                            Text(
                                              when,
                                              style: const TextStyle(
                                                fontSize: 12,
                                                color: GtColors.textMuted,
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
