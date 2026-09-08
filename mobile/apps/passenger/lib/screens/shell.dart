import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/book_screen.dart';
import 'package:passenger/screens/menu_panel.dart';
import 'package:passenger/screens/rides_screen.dart';
import 'package:passenger/screens/settings_screen.dart';
import 'package:passenger/screens/support_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

final GlobalKey<ScaffoldState> passengerShellKey = GlobalKey<ScaffoldState>();

/// Opens the passenger side menu overlay (works with nested scaffolds).
Future<void> openPassengerMenu([BuildContext? context]) async {
  final ctx = context ?? passengerShellKey.currentContext;
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
            child: const MenuPanel(inDrawer: true),
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

class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final index = app.shellTabIndex;
    final offerBadge = app.unreadOfferBadge;

    return Scaffold(
      key: passengerShellKey,
      body: IndexedStack(
        index: index,
        children: const [
          BookScreen(),
          RidesScreen(),
          SupportScreen(),
          SettingsScreen(),
        ],
      ),
      bottomNavigationBar: GtBottomNav(
        index: index,
        onTap: (i) {
          app.setShellTab(i);
          if (i == 1) app.refreshRidesFromServer();
        },
        items: [
          const GtNavItem(icon: Icons.add_circle_outline, label: 'Book'),
          GtNavItem(
            icon: Icons.alt_route,
            label: 'Rides',
            badge: offerBadge > 99 ? 99 : offerBadge,
          ),
          const GtNavItem(icon: Icons.headset_mic_outlined, label: 'Support'),
          const GtNavItem(icon: Icons.settings_outlined, label: 'Settings'),
        ],
      ),
    );
  }
}
