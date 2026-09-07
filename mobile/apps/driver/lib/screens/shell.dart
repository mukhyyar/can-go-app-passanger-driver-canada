import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';

import 'brand_chrome.dart';

class DriverShell extends StatelessWidget {
  const DriverShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: driverShellKey,
      body: navigationShell,
      bottomNavigationBar: GtBottomNav(
        index: navigationShell.currentIndex,
        onTap: (i) => navigationShell.goBranch(
          i,
          initialLocation: i == navigationShell.currentIndex,
        ),
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
