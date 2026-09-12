import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'brand_chrome.dart';

class DriverShell extends StatefulWidget {
  const DriverShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  State<DriverShell> createState() => _DriverShellState();
}

class _DriverShellState extends State<DriverShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _consumeChatLink());
  }

  void _consumeChatLink() {
    final app = context.read<AppState>();
    final path = app.consumeChatDeepLinkPath();
    if (path != null && mounted) {
      context.push(path);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    if (app.pendingChatRideId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _consumeChatLink());
    }

    return Scaffold(
      key: driverShellKey,
      body: widget.navigationShell,
      bottomNavigationBar: GtBottomNav(
        index: widget.navigationShell.currentIndex,
        onTap: (i) {
          if (i == 0) {
            context.read<AppState>().refreshOpenRequests();
          }
          widget.navigationShell.goBranch(
            i,
            initialLocation: i == widget.navigationShell.currentIndex,
          );
        },
        items: const [
          GtNavItem(icon: Icons.alt_route, label: 'Requests'),
          GtNavItem(icon: Icons.calendar_month_outlined, label: 'Rides'),
          GtNavItem(icon: Icons.chat_bubble_outline, label: 'Chats'),
          GtNavItem(icon: Icons.settings_outlined, label: 'Settings'),
        ],
      ),
    );
  }
}
