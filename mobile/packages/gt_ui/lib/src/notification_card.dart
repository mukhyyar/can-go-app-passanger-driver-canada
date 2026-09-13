import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'theme.dart';

/// Expandable notification row with optional image + deep-link CTA.
class GtNotificationCard extends StatefulWidget {
  const GtNotificationCard({
    super.key,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.unread,
    this.imageUrl,
    this.ctaLabel,
    this.onOpen,
    this.onMarkRead,
  });

  final String title;
  final String body;
  final dynamic createdAt;
  final bool unread;
  final String? imageUrl;
  final String? ctaLabel;
  final VoidCallback? onOpen;
  final VoidCallback? onMarkRead;

  @override
  State<GtNotificationCard> createState() => _GtNotificationCardState();
}

class _GtNotificationCardState extends State<GtNotificationCard> {
  bool _expanded = false;

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

  void _toggle() {
    setState(() => _expanded = !_expanded);
    if (widget.unread) widget.onMarkRead?.call();
  }

  void _openImage(String url) {
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.all(16),
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            InteractiveViewer(
              child: AspectRatio(
                aspectRatio: 1,
                child: Image.network(url, fit: BoxFit.contain),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: IconButton(
                onPressed: () => Navigator.pop(ctx),
                icon: const Icon(Icons.close, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final when = _formatWhen(widget.createdAt);
    final imageUrl = widget.imageUrl;
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;
    final preview = widget.body.length > 90 && !_expanded
        ? '${widget.body.substring(0, 90).trimRight()}…'
        : widget.body;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: _toggle,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: widget.unread
                  ? GtColors.brand.withValues(alpha: 0.28)
                  : GtColors.border,
            ),
            color: widget.unread
                ? GtColors.soft.withValues(alpha: 0.55)
                : Colors.white,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: GtColors.soft,
                      shape: BoxShape.circle,
                      image: hasImage
                          ? DecorationImage(
                              image: NetworkImage(imageUrl),
                              fit: BoxFit.cover,
                            )
                          : null,
                    ),
                    alignment: Alignment.center,
                    child: hasImage
                        ? null
                        : Icon(
                            widget.unread
                                ? Icons.notifications_active_outlined
                                : Icons.notifications_outlined,
                            color: GtColors.brand,
                            size: 20,
                          ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                widget.title,
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: widget.unread
                                      ? FontWeight.w700
                                      : FontWeight.w600,
                                  color: GtColors.text,
                                ),
                              ),
                            ),
                            if (widget.unread)
                              Container(
                                width: 8,
                                height: 8,
                                margin: const EdgeInsets.only(right: 4),
                                decoration: const BoxDecoration(
                                  color: GtColors.brand,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            AnimatedRotation(
                              turns: _expanded ? 0.5 : 0,
                              duration: const Duration(milliseconds: 200),
                              child: const Icon(
                                Icons.expand_more_rounded,
                                color: GtColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                        if (preview.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            preview,
                            maxLines: _expanded ? 20 : 2,
                            overflow: TextOverflow.ellipsis,
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
              if (_expanded) ...[
                if (hasImage) ...[
                  const SizedBox(height: 12),
                  GestureDetector(
                    onTap: () => _openImage(imageUrl),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: AspectRatio(
                        aspectRatio: 16 / 9,
                        child: Image.network(
                          imageUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: GtColors.bgGrey,
                            alignment: Alignment.center,
                            child: const Icon(
                              Icons.broken_image_outlined,
                              color: GtColors.textMuted,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
                if (widget.onOpen != null) ...[
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: widget.onOpen,
                      icon: const Icon(Icons.open_in_new, size: 18),
                      label: Text(widget.ctaLabel ?? 'Open'),
                      style: TextButton.styleFrom(
                        foregroundColor: GtColors.brand,
                        textStyle: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}
