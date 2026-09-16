import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'menu_panel.dart';

final GlobalKey<ScaffoldState> driverShellKey = GlobalKey<ScaffoldState>();

/// Opens the driver side menu overlay (same pattern as passenger).
Future<void> openDriverMenu([BuildContext? context]) async {
  final ctx = context ?? driverShellKey.currentContext;
  if (ctx == null || !ctx.mounted) return;
  await showGeneralDialog<void>(
    context: ctx,
    useRootNavigator: true,
    barrierDismissible: true,
    barrierLabel: 'Close menu',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (context, animation, secondaryAnimation) {
      final width = MediaQuery.sizeOf(context).width.clamp(280.0, 360.0);
      return Align(
        alignment: Alignment.centerLeft,
        child: Material(
          color: Colors.white,
          child: SizedBox(
            width: width,
            height: double.infinity,
            child: const DriverMenuPanel(inDrawer: true),
          ),
        ),
      );
    },
    transitionBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
      );
      return SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(-1, 0),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      );
    },
  );
}

/// Soft brand header matching passenger book header (logo + title + actions).
class DriverBrandHeader extends StatelessWidget {
  const DriverBrandHeader({
    super.key,
    this.subtitle,
    this.onProfileTap,
    this.showMenu = true,
  });

  final String? subtitle;
  final VoidCallback? onProfileTap;
  final bool showMenu;

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final unread = app.unreadNotificationCount;

    return Container(
      margin: const EdgeInsets.fromLTRB(0, 8, 0, 0),
      padding: const EdgeInsets.fromLTRB(6, 8, 8, 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFFFFFFF),
            Color(0xFFFFF8F8),
            Color(0xFFFDEAEA),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GtColors.border),
        boxShadow: [
          BoxShadow(
            color: GtColors.brand.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          if (showMenu) ...[
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => openDriverMenu(context),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: GtColors.border),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.04),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: const Icon(Icons.menu_rounded, color: GtColors.text),
                ),
              ),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: CanRideHeaderLockup(
              subtitle: subtitle,
              markSize: 44,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Tooltip(
                    message: app.drivingEnabled
                        ? 'Driving mode on'
                        : 'Driving mode off',
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          app.drivingEnabled ? 'On' : 'Off',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: app.drivingEnabled
                                ? GtColors.green
                                : GtColors.textMuted,
                          ),
                        ),
                        SizedBox(
                          height: 32,
                          child: Switch.adaptive(
                            value: app.drivingEnabled,
                            onChanged: app.isActivated
                                ? (v) async {
                                    try {
                                      await app.setDrivingMode(v);
                                    } catch (e) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(
                                          SnackBar(
                                            content: Text(
                                              e.toString().replaceFirst(
                                                    'ApiException: ',
                                                    '',
                                                  ),
                                            ),
                                          ),
                                        );
                                      }
                                    }
                                  }
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 4),
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: () => context.push('/notifications'),
                      borderRadius: BorderRadius.circular(22),
                      child: Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: GtColors.soft,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: GtColors.brand.withValues(alpha: 0.18),
                          ),
                        ),
                        child: Badge(
                          isLabelVisible: unread > 0,
                          label: Text(
                            unread > 99 ? '99+' : '$unread',
                            style: const TextStyle(fontSize: 10),
                          ),
                          child: const Icon(
                            Icons.notifications_outlined,
                            color: GtColors.brand,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: onProfileTap ?? () => openDriverMenu(context),
                      borderRadius: BorderRadius.circular(22),
                      child: GtProfileAvatar(
                        size: 40,
                        bytes: app.avatarBytes,
                        loading: app.avatarLoading || app.avatarUploading,
                      ),
                    ),
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

/// Compact branded top bar for secondary screens (chats, rides, etc.).
class DriverPageHeader extends StatelessWidget {
  const DriverPageHeader({
    super.key,
    required this.title,
    this.trailing,
  });

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Row(
        children: [
          const CanGoLogo(size: 36),
          const SizedBox(width: 10),
          const CanRideWordmark(fontSize: 18, compact: true),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: GtColors.text,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Soft overview metric chip used on the driver dashboard.
class DriverStatChip extends StatelessWidget {
  const DriverStatChip({
    super.key,
    required this.label,
    required this.value,
    this.icon,
  });

  final String label;
  final String value;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: GtColors.border),
          boxShadow: [
            BoxShadow(
              color: GtColors.brand.withValues(alpha: 0.04),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 16, color: GtColors.brand),
                  const SizedBox(width: 6),
                ],
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: GtColors.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: GtColors.text,
                height: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
