import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

/// Settings-style menu content (GetTransfer passenger layout).
/// Used in the hamburger drawer and the Settings tab.
class MenuPanel extends StatelessWidget {
  const MenuPanel({super.key, this.inDrawer = false});

  final bool inDrawer;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final rides = state.completedRideCount;
    final unitWord = state.distanceUnit == 'mi' ? 'miles' : 'km';

    return ColoredBox(
      color: Colors.white,
      child: SafeArea(
        right: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            if (inDrawer) ...[
              Row(
                children: [
                  const CanGoLogo(size: 40),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close, color: GtColors.textSecondary),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],
            Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8E8DE),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '0 $unitWord collected in $rides rides',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: GtColors.text,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            _MenuTile(
              icon: Icons.account_circle_outlined,
              label: 'Log in or sign up',
              onTap: () {
                if (inDrawer) Navigator.of(context).pop();
                context.push('/account');
              },
            ),
            _MenuTile(
              icon: Icons.notifications_outlined,
              label: 'Notifications',
              onTap: () => _toggleNotifications(context, state),
            ),
            _MenuTile(
              icon: Icons.format_list_bulleted,
              label: 'Trip types',
              onTap: () => _toast(context, 'Trip types (demo)'),
            ),
            _MenuTile(
              icon: Icons.people_outline,
              label: 'Users',
              onTap: () {
                if (inDrawer) Navigator.of(context).pop();
                context.push('/account');
              },
            ),
            _MenuTile(
              icon: Icons.monetization_on_outlined,
              label: 'Currency',
              trailingValue: state.currencyCode,
              onTap: () => _pickCurrency(context, state),
            ),
            _MenuTile(
              icon: Icons.straighten,
              label: 'Distance unit',
              trailingValue: state.distanceUnit,
              onTap: () => _pickDistanceUnit(context, state),
            ),
            _MenuTile(
              icon: Icons.language,
              label: 'Language',
              trailingValue: state.language,
              onTap: () => _pickLanguage(context, state),
              showDivider: false,
            ),
            const SizedBox(height: 16),
            _PromoCard(
              title: 'Request a VIP account',
              subtitle: 'Access to premium services',
              actionLabel: 'Request',
              onAction: () => _toast(context, 'VIP request sent (demo)'),
            ),
            const SizedBox(height: 10),
            _PromoCard(
              title: 'Join as a driver!',
              subtitle: 'Download the application and earn with us',
              actionLabel: 'Download',
              onAction: () => _toast(context, 'Driver app link (demo)'),
            ),
            const SizedBox(height: 20),
            const Center(
              child: Text(
                'Version 1.0.0 (100)',
                style: TextStyle(
                  fontSize: 12,
                  color: GtColors.textMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _toast(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _toggleNotifications(BuildContext context, AppState state) {
    state.setNotificationsEnabled(!state.notificationsEnabled);
    _toast(
      context,
      state.notificationsEnabled
          ? 'Notifications enabled'
          : 'Notifications disabled',
    );
  }

  Future<void> _pickLanguage(BuildContext context, AppState state) async {
    final selected = await showGtSheet<String>(
      context: context,
      child: ListView(
        shrinkWrap: true,
        children: MockData.languages
            .map(
              (l) => ListTile(
                title: Text(l),
                trailing: state.language == l
                    ? const Icon(Icons.check, color: GtColors.orange)
                    : null,
                onTap: () => Navigator.pop(context, l),
              ),
            )
            .toList(),
      ),
    );
    if (selected != null) state.setLanguage(selected);
  }

  Future<void> _pickCurrency(BuildContext context, AppState state) async {
    const currencies = ['US\$', 'CAD\$', 'EUR€', 'GBP£', 'AED'];
    final selected = await showGtSheet<String>(
      context: context,
      child: ListView(
        shrinkWrap: true,
        children: currencies
            .map(
              (c) => ListTile(
                title: Text(c),
                trailing: state.currency == c
                    ? const Icon(Icons.check, color: GtColors.orange)
                    : null,
                onTap: () => Navigator.pop(context, c),
              ),
            )
            .toList(),
      ),
    );
    if (selected != null) state.setCurrency(selected);
  }

  Future<void> _pickDistanceUnit(BuildContext context, AppState state) async {
    const units = ['km', 'mi'];
    final selected = await showGtSheet<String>(
      context: context,
      child: ListView(
        shrinkWrap: true,
        children: units
            .map(
              (u) => ListTile(
                title: Text(u),
                trailing: state.distanceUnit == u
                    ? const Icon(Icons.check, color: GtColors.orange)
                    : null,
                onTap: () => Navigator.pop(context, u),
              ),
            )
            .toList(),
      ),
    );
    if (selected != null) state.setDistanceUnit(selected);
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.trailingValue,
    this.showDivider = true,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String? trailingValue;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Row(
              children: [
                Icon(icon, size: 24, color: GtColors.text),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: GtColors.text,
                    ),
                  ),
                ),
                if (trailingValue != null) ...[
                  Text(
                    trailingValue!,
                    style: const TextStyle(
                      fontSize: 15,
                      color: GtColors.textMuted,
                    ),
                  ),
                  const SizedBox(width: 4),
                ],
                const Icon(Icons.chevron_right, color: GtColors.textMuted),
              ],
            ),
          ),
        ),
        if (showDivider)
          const Divider(height: 1, thickness: 1, color: GtColors.border),
      ],
    );
  }
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.onAction,
  });

  final String title;
  final String subtitle;
  final String actionLabel;
  final VoidCallback onAction;

  static const _actionGreen = Color(0xFF5BAE4A);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: GtColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: GtColors.text,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 13,
                    color: GtColors.textSecondary,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            height: 36,
            child: ElevatedButton(
              onPressed: onAction,
              style: ElevatedButton.styleFrom(
                backgroundColor: _actionGreen,
                foregroundColor: Colors.white,
                elevation: 0,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                minimumSize: const Size(0, 36),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(6),
                ),
                textStyle: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              child: Text(actionLabel),
            ),
          ),
        ],
      ),
    );
  }
}

class PassengerMenuDrawer extends StatelessWidget {
  const PassengerMenuDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    // Kept for compatibility; menu opens via [openPassengerMenu].
    return const Drawer(
      backgroundColor: Colors.white,
      child: MenuPanel(inDrawer: true),
    );
  }
}
