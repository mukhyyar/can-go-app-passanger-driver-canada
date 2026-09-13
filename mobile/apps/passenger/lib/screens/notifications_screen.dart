import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

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

  Future<void> _markRead(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    final unread = item['readAt'] == null;
    if (id == null || !unread) return;
    try {
      await context.read<AppState>().markNotificationRead(id);
      if (!mounted) return;
      setState(() {
        _items = _items.map((e) {
          if (e['id']?.toString() != id) return e;
          return {...e, 'readAt': DateTime.now().toIso8601String()};
        }).toList();
      });
    } catch (_) {}
  }

  void _openDeepLink(Map<String, dynamic> item) {
    final data = item['data'];
    if (data is! Map) return;
    final rideId = data['rideId']?.toString();
    final offerId = data['offerId']?.toString();
    if (rideId == null || rideId.isEmpty) return;
    if (offerId != null && offerId.isNotEmpty) {
      context.push('/offers/$rideId?offerId=$offerId');
    } else {
      context.push('/ride/$rideId');
    }
  }

  String? _imageUrl(Map<String, dynamic> item) {
    final data = item['data'];
    if (data is Map) {
      final raw = data['imageUrl']?.toString();
      if (raw != null && raw.isNotEmpty) return rewriteMediaUrl(raw);
    }
    return null;
  }

  String? _ctaLabel(Map<String, dynamic> item) {
    final data = item['data'];
    if (data is! Map) return null;
    final rideId = data['rideId']?.toString();
    if (rideId == null || rideId.isEmpty) return null;
    final offerId = data['offerId']?.toString();
    if (offerId != null && offerId.isNotEmpty) return 'View offer';
    return 'Open ride';
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
                            'Updates about your rides will show up here.',
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
                          final cta = _ctaLabel(item);
                          return GtNotificationCard(
                            title: item['title']?.toString() ?? 'Update',
                            body: item['body']?.toString() ?? '',
                            createdAt: item['createdAt'],
                            unread: item['readAt'] == null,
                            imageUrl: _imageUrl(item),
                            ctaLabel: cta,
                            onMarkRead: () => _markRead(item),
                            onOpen: cta == null
                                ? null
                                : () {
                                    _markRead(item);
                                    _openDeepLink(item);
                                  },
                          );
                        },
                      ),
      ),
    );
  }
}
