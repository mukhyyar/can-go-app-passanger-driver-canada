import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';

import 'brand_chrome.dart';

class ChatsScreen extends StatelessWidget {
  const ChatsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final chats = MockData.chats();
    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: DriverBrandHeader(
                subtitle: 'Messages with passengers & support',
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: chats.isEmpty
                  ? Center(
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
                                color: GtColors.brand.withValues(alpha: 0.16),
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
                        ],
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                      itemCount: chats.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final c = chats[i];
                        return Material(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () => context.push('/chat/${c.id}'),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 12,
                              ),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: GtColors.border),
                              ),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    backgroundColor: GtColors.soft,
                                    foregroundColor: GtColors.brand,
                                    child: Text(
                                      c.title.isNotEmpty ? c.title[0] : '?',
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
                                          c.title,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          c.lastMessage,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: GtColors.textSecondary,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    c.time,
                                    style: const TextStyle(
                                      color: GtColors.textMuted,
                                      fontSize: 12,
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
          ],
        ),
      ),
    );
  }
}
