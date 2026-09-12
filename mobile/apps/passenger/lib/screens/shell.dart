import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
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
  String? _seenOfferAlert;
  String? _seenRideStatusAlert;

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final index = app.shellTabIndex;
    final offerBadge = app.unreadOfferBadge;
    final alert = app.pendingOfferAlert;
    final alertRideId = app.pendingOfferRideId;
    final rideAlert = app.pendingRideStatusAlert;
    final rideAlertId = app.pendingRideStatusRideId;

    if (alert != null &&
        alertRideId != null &&
        alert != _seenOfferAlert &&
        mounted) {
      _seenOfferAlert = alert;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final messenger = ScaffoldMessenger.of(context);
        messenger.hideCurrentSnackBar();
        messenger.showSnackBar(
          SnackBar(
            content: Text(alert),
            action: SnackBarAction(
              label: 'View',
              onPressed: () {
                app.clearPendingOfferAlert();
                app.setShellTab(1);
                // ignore: use_build_context_synchronously
                GoRouter.of(context).push('/offers/$alertRideId');
              },
            ),
            duration: const Duration(seconds: 6),
          ),
        );
        app.clearPendingOfferAlert();
      });
    }

    if (rideAlert != null &&
        rideAlertId != null &&
        rideAlert != _seenRideStatusAlert &&
        mounted) {
      _seenRideStatusAlert = rideAlert;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final messenger = ScaffoldMessenger.of(context);
        messenger.hideCurrentSnackBar();
        messenger.showSnackBar(
          SnackBar(
            content: Text(rideAlert),
            action: SnackBarAction(
              label: 'View',
              onPressed: () {
                app.clearPendingRideStatusAlert();
                app.setShellTab(1);
                // ignore: use_build_context_synchronously
                GoRouter.of(context).push('/ride/$rideAlertId');
              },
            ),
            duration: const Duration(seconds: 6),
          ),
        );
        app.clearPendingRideStatusAlert();
      });
    }

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
