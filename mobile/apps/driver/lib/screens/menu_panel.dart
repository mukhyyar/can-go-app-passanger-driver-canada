import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

/// Settings-style menu content matching passenger MenuPanel branding.
class DriverMenuPanel extends StatefulWidget {
  const DriverMenuPanel({super.key, this.inDrawer = false});

  final bool inDrawer;

  @override
  State<DriverMenuPanel> createState() => _DriverMenuPanelState();
}

class _DriverMenuPanelState extends State<DriverMenuPanel> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshDriverSettings();
    });
  }

  Future<void> _open(String route) async {
    if (widget.inDrawer) Navigator.of(context).pop();
    await context.push(route);
    if (!mounted) return;
    await context.read<AppState>().refreshDriverSettings(force: true);
  }

  Future<void> _editAvatar(AppState s) async {
    if (!s.isAuthenticated || s.avatarUploading) return;
    try {
      final result = await GtAvatarEditFlow.pickAndCrop(
        context,
        hasExistingPhoto: s.hasAvatar,
      );
      if (!mounted) return;
      switch (result) {
        case GtAvatarEditCancelled():
          return;
        case GtAvatarEditRemoved():
          await s.removeAvatar();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Profile photo removed')),
            );
          }
        case GtAvatarEditPicked(:final bytes):
          try {
            await s.uploadAvatar(bytes);
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Profile photo updated')),
              );
            }
          } catch (e) {
            if (!mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Upload failed: $e'),
                action: SnackBarAction(
                  label: 'Retry',
                  onPressed: () => s.uploadAvatar(bytes),
                ),
              ),
            );
          }
      }
    } on GtAvatarEditException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update photo: $e')),
      );
    }
  }

  String? _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return null;
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = s.fullName.isEmpty ? 'Driver' : s.fullName;
    final status = s.partnerStatusLabel;
    final cta = s.accountStatus?['cta'];
    final ctaRoute = cta is Map ? cta['route']?.toString() : null;
    final ctaLabel = cta is Map ? cta['label']?.toString() : null;
    final initials = _initials(name);

    return ColoredBox(
      color: Colors.white,
      child: SafeArea(
        right: false,
        child: RefreshIndicator(
          color: GtColors.brand,
          onRefresh: () => s.refreshDriverSettings(force: true),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              if (widget.inDrawer) ...[
                Row(
                  children: [
                    const CanGoLogo(size: 40),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: CanRideWordmark(
                        fontSize: 22,
                        compact: true,
                        maxWidth: 200,
                      ),
                    ),
                    IconButton(
                      tooltip: 'Notifications',
                      onPressed: () {
                        Navigator.of(context).pop();
                        context.push('/notifications');
                      },
                      icon: Badge(
                        isLabelVisible: s.unreadNotificationCount > 0,
                        label: Text(
                          s.unreadNotificationCount > 99
                              ? '99+'
                              : '${s.unreadNotificationCount}',
                          style: const TextStyle(fontSize: 10),
                        ),
                        child: const Icon(
                          Icons.notifications_outlined,
                          color: GtColors.textSecondary,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close',
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const Icon(Icons.close,
                          color: GtColors.textSecondary),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
              ] else ...[
                const Center(child: CanGoLogo(size: 56)),
                const SizedBox(height: 8),
                const Center(
                  child: CanRideWordmark(
                    fontSize: 28,
                    textAlign: TextAlign.center,
                    alignment: Alignment.center,
                    maxWidth: 280,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Center(
                child: GtProfileAvatar(
                  size: 72,
                  bytes: s.avatarBytes,
                  initials: initials,
                  loading: s.avatarLoading || s.avatarUploading,
                  onTap: () => _editAvatar(s),
                  showEditBadge: true,
                ),
              ),
              const SizedBox(height: 12),
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
              if (s.isIndividual != true || s.legalName.isNotEmpty) ...[
                const SizedBox(height: 2),
                Center(
                  child: Text(
                    s.isIndividual ? 'Individual carrier' : 'Legal entity',
                    style: const TextStyle(
                      fontSize: 12,
                      color: GtColors.textSecondary,
                    ),
                  ),
                ),
              ],
              if (ctaRoute != null && ctaLabel != null) ...[
                const SizedBox(height: 12),
                GtGreenButton(
                  label: ctaLabel,
                  onPressed: () => _open(ctaRoute),
                ),
              ],
              const SizedBox(height: 16),
              const _SectionLabel('Account & operations'),
              _MenuTile(
                icon: Icons.account_circle_outlined,
                label: 'Carrier profile',
                subtitle: s.carrierProfileSummary,
                onTap: () => _open('/onboarding/profile'),
              ),
              _MenuTile(
                icon: Icons.map_outlined,
                label: 'Operating zone',
                subtitle: s.operatingZoneSummary,
                onTap: () => _open('/onboarding/zone'),
              ),
              _MenuTile(
                icon: Icons.directions_car_outlined,
                label: 'Vehicles',
                subtitle: s.vehiclesSummary,
                onTap: () => _open('/settings/vehicles'),
              ),
              _MenuTile(
                icon: Icons.folder_outlined,
                label: 'Documents',
                subtitle: s.documentsAttentionLabel.isEmpty
                    ? 'KYC documents'
                    : s.documentsAttentionLabel,
                onTap: () => _open('/onboarding/documents'),
              ),
              _MenuTile(
                icon: Icons.account_balance_wallet_outlined,
                label: 'Wallet',
                subtitle: s.walletSummaryLabel.isEmpty
                    ? 'Earnings & withdrawals'
                    : s.walletSummaryLabel,
                onTap: () => _open('/wallet'),
              ),
              _MenuTile(
                icon: Icons.payments_outlined,
                label: 'Payment details',
                subtitle: s.paymentSummaryLabel.isEmpty
                    ? s.outpaymentCurrency
                    : s.paymentSummaryLabel,
                onTap: () => _open('/onboarding/payment'),
              ),
              _MenuTile(
                icon: Icons.menu_book_outlined,
                label: 'Instructions',
                onTap: () => _open('/instructions'),
                showDivider: false,
              ),
              const SizedBox(height: 16),
              const _SectionLabel('Help & Legal'),
              _MenuTile(
                icon: Icons.help_outline,
                label: 'Support',
                onTap: () => _open('/instructions'),
              ),
              _MenuTile(
                icon: Icons.shield_outlined,
                label: 'Privacy Policy',
                onTap: () => _open('/legal/privacy'),
              ),
              _MenuTile(
                icon: Icons.gavel_outlined,
                label: 'Service Agreement',
                onTap: () => _open('/legal/terms'),
                showDivider: false,
              ),
              const SizedBox(height: 16),
              const _SectionLabel('Driving'),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                secondary: Icon(
                  s.drivingEnabled
                      ? Icons.directions_car
                      : Icons.directions_car_outlined,
                  color: GtColors.brand,
                ),
                title: const Text(
                  'Driving mode',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  s.drivingEnabled
                      ? 'You are available for new ride offers'
                      : s.isActivated
                          ? 'Turn on to receive ride offers'
                          : 'Activate your account first',
                ),
                value: s.drivingEnabled,
                onChanged: s.isActivated
                    ? (v) async {
                        try {
                          await s.setDrivingMode(v);
                          if (context.mounted) {
                            _toast(
                              context,
                              v ? 'Driving mode on' : 'Driving mode off',
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            _toast(
                              context,
                              e.toString().replaceFirst('ApiException: ', ''),
                            );
                          }
                        }
                      }
                    : null,
              ),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  s.isActivated ? Icons.verified : Icons.hourglass_empty,
                  color: GtColors.brand,
                ),
                title: Text(
                  s.partnerStatusLabel,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  s.isActivated
                      ? 'Server activation status'
                      : 'Status refreshes from admin review',
                ),
                trailing: IconButton(
                  icon: s.settingsRefreshing
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh),
                  onPressed: s.settingsRefreshing
                      ? null
                      : () async {
                          await s.refreshMe();
                          await s.refreshDriverSettings(force: true);
                          if (context.mounted) {
                            _toast(context, s.partnerStatusLabel);
                          }
                        },
                ),
              ),
              const Divider(height: 24, color: GtColors.border),
              _MenuTile(
                icon: Icons.logout,
                label: 'Sign out',
                danger: true,
                onTap: () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Sign out?'),
                      content: const Text(
                        'You will need to sign in again to manage your carrier account.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Cancel'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Sign out'),
                        ),
                      ],
                    ),
                  );
                  if (ok != true) return;
                  if (widget.inDrawer && context.mounted) {
                    Navigator.of(context).pop();
                  }
                  await s.signOut();
                  if (context.mounted) context.go('/auth');
                },
                showDivider: false,
              ),
              const SizedBox(height: 20),
              const Center(
                child: Text(
                  'CAN-RIDE Driver · Version 1.0.0 (100)',
                  style: TextStyle(
                    fontSize: 12,
                    color: GtColors.textMuted,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _toast(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          color: GtColors.textMuted,
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.subtitle,
    this.danger = false,
    this.showDivider = true,
  });

  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final bool danger;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(
            icon,
            color: danger ? GtColors.red : GtColors.text,
          ),
          title: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: danger ? GtColors.red : GtColors.text,
            ),
          ),
          subtitle: subtitle == null
              ? null
              : Text(
                  subtitle!,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: GtColors.textSecondary,
                  ),
                ),
          trailing: danger
              ? null
              : const Icon(Icons.chevron_right, color: GtColors.textMuted),
          onTap: onTap,
        ),
        if (showDivider) const Divider(height: 1, color: GtColors.border),
      ],
    );
  }
}
