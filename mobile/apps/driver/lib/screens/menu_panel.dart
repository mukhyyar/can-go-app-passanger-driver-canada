import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

/// Settings-style menu content matching passenger MenuPanel branding.
class DriverMenuPanel extends StatelessWidget {
  const DriverMenuPanel({super.key, this.inDrawer = false});

  final bool inDrawer;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = s.fullName.isEmpty ? s.repo.driver.fullName : s.fullName;
    final status = s.isActivated ? 'Activated partner' : 'Pending activation';

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
            ] else ...[
              const Center(child: CanGoLogo(size: 56)),
              const SizedBox(height: 12),
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
                  status,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: GtColors.text,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 4),
            Center(
              child: Text(
                name,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: GtColors.text,
                ),
              ),
            ),
            const SizedBox(height: 12),
            _MenuTile(
              icon: Icons.account_circle_outlined,
              label: 'Carrier profile',
              onTap: () {
                if (inDrawer) Navigator.of(context).pop();
                context.push('/onboarding/profile');
              },
            ),
            _MenuTile(
              icon: Icons.map_outlined,
              label: 'Operating zone',
              onTap: () {
                if (inDrawer) Navigator.of(context).pop();
                context.push('/onboarding/zone');
              },
            ),
            _MenuTile(
              icon: Icons.directions_car_outlined,
              label: 'Vehicles',
              onTap: () {
                if (inDrawer) Navigator.of(context).pop();
                context.push('/onboarding/edit-vehicle');
              },
            ),
            _MenuTile(
              icon: Icons.payments_outlined,
              label: 'Payment details',
              onTap: () {
                if (inDrawer) Navigator.of(context).pop();
                context.push('/onboarding/payment');
              },
            ),
            _MenuTile(
              icon: Icons.menu_book_outlined,
              label: 'Instructions',
              onTap: () {
                if (inDrawer) Navigator.of(context).pop();
                context.push('/instructions');
              },
              showDivider: false,
            ),
            const SizedBox(height: 16),
            _PromoCard(
              title: s.isActivated ? 'You are live' : 'Activate your account',
              subtitle: s.isActivated
                  ? 'Offer prices on new transfer requests'
                  : 'Complete profile and wait for partner review',
              actionLabel: s.isActivated ? 'Open' : 'Toggle',
              onAction: () {
                if (!s.isActivated) {
                  s.setActivated(true);
                  _toast(context, 'Account activated (demo)');
                } else {
                  if (inDrawer) Navigator.of(context).pop();
                  context.go('/');
                }
              },
            ),
            const SizedBox(height: 10),
            _PromoCard(
              title: 'Invite passengers',
              subtitle: 'Share CAN-GO and grow your bookings',
              actionLabel: 'Share',
              onAction: () => _toast(context, 'Invite link (demo)'),
            ),
            const SizedBox(height: 16),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              secondary: const Icon(Icons.verified_outlined, color: GtColors.brand),
              title: const Text(
                'Activate account',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: const Text('Demo toggle'),
              value: s.isActivated,
              onChanged: (v) => s.setActivated(v),
            ),
            const Divider(height: 24, color: GtColors.border),
            _MenuTile(
              icon: Icons.logout,
              label: 'Sign out',
              danger: true,
              onTap: () async {
                if (inDrawer) Navigator.of(context).pop();
                await s.signOut();
                if (context.mounted) context.go('/onboarding/profile');
              },
              showDivider: false,
            ),
            const SizedBox(height: 20),
            const Center(
              child: Text(
                'CAN-GO Driver · Version 1.0.0 (100)',
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
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.showDivider = true,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool showDivider;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? GtColors.brand : GtColors.text;
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Row(
              children: [
                Icon(icon, size: 24, color: color),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: color,
                    ),
                  ),
                ),
                if (!danger)
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
