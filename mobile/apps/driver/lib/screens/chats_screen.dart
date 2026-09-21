import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'brand_chrome.dart';

class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key});

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  Future<void> _refresh() async {
    final app = context.read<AppState>();
    setState(() => _refreshing = true);
    await app.refreshMyRides();
    if (mounted) setState(() => _refreshing = false);
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final chats = app.chatableRides;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: DriverBrandHeader(
                subtitle: 'Messages with passengers',
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: RefreshIndicator(
                color: GtColors.brand,
                onRefresh: _refresh,
                child: _refreshing && chats.isEmpty
                    ? ListView(
                        children: const [
                          SizedBox(height: 120),
                          Center(
                            child: CircularProgressIndicator(
                              color: GtColors.brand,
                            ),
                          ),
                        ],
                      )
                    : chats.isEmpty
                        ? ListView(
                            children: [
                              SizedBox(
                                height:
                                    MediaQuery.of(context).size.height * 0.35,
                              ),
                              Center(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      width: 72,
                                      height: 72,
                                      decoration: BoxDecoration(
                                        color: GtColors.soft,
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                          color: GtColors.brand
                                              .withValues(alpha: 0.16),
                                        ),
                                      ),
                                      child: const Icon(
                                        Icons.chat_bubble_outline,
                                        color: GtColors.brand,
                                        size: 32,
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    const Text(
                                      'No chats yet',
                                      style: TextStyle(
                                        color: GtColors.textSecondary,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    const Text(
                                      'Open a booked trip to message the passenger',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: GtColors.textMuted,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                            itemCount: chats.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 8),
                            itemBuilder: (_, i) {
                              final c = chats[i];
                              final isCompleted =
                                  (c.status ?? '').toUpperCase() == 'COMPLETED';
                              final name = !isCompleted
                                  ? (c.passengerName ?? '').trim()
                                  : '';
                              final title = name.isNotEmpty
                                  ? name
                                  : 'Ride ${c.displayId}';
                              final subtitle =
                                  '${c.from} → ${c.to}'.trim();
                              final initial = title.isNotEmpty
                                  ? title[0].toUpperCase()
                                  : '?';
                              return Material(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(12),
                                  onTap: () =>
                                      context.push('/chat/${c.id}'),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 12,
                                    ),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: GtColors.border,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        CircleAvatar(
                                          backgroundColor: GtColors.soft,
                                          foregroundColor: GtColors.brand,
                                          child: Text(
                                            initial,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                title,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                subtitle,
                                                maxLines: 1,
                                                overflow:
                                                    TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  color:
                                                      GtColors.textSecondary,
                                                  fontSize: 13,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          (c.status ?? '').replaceAll(
                                            '_',
                                            ' ',
                                          ),
                                          style: const TextStyle(
                                            color: GtColors.textMuted,
                                            fontSize: 11,
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
            ),
          ],
        ),
      ),
    );
  }
}
