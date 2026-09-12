import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

/// Settings-style menu content (CAN-RIDE passenger layout).
/// Used in the hamburger drawer and the Settings tab.
class MenuPanel extends StatefulWidget {
  const MenuPanel({super.key, this.inDrawer = false});

  final bool inDrawer;

  @override
  State<MenuPanel> createState() => _MenuPanelState();
}

class _MenuPanelState extends State<MenuPanel>
    with SingleTickerProviderStateMixin {
  late final AnimationController _enter;
  late final Animation<double> _fade0;
  late final Animation<double> _fade1;
  late final Animation<double> _fade2;
  late final Animation<Offset> _slide0;
  late final Animation<Offset> _slide1;
  late final Animation<Offset> _slide2;
  bool _uploadingAvatar = false;

  @override
  void initState() {
    super.initState();
    _enter = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _fade0 = CurvedAnimation(
      parent: _enter,
      curve: const Interval(0.0, 0.45, curve: Curves.easeOut),
    );
    _fade1 = CurvedAnimation(
      parent: _enter,
      curve: const Interval(0.12, 0.58, curve: Curves.easeOut),
    );
    _fade2 = CurvedAnimation(
      parent: _enter,
      curve: const Interval(0.24, 0.72, curve: Curves.easeOut),
    );
    _slide0 = Tween<Offset>(
      begin: const Offset(0, 0.06),
      end: Offset.zero,
    ).animate(_fade0);
    _slide1 = Tween<Offset>(
      begin: const Offset(0, 0.06),
      end: Offset.zero,
    ).animate(_fade1);
    _slide2 = Tween<Offset>(
      begin: const Offset(0, 0.06),
      end: Offset.zero,
    ).animate(_fade2);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (MediaQuery.disableAnimationsOf(context)) {
        _enter.value = 1;
      } else {
        _enter.forward();
      }
    });
  }

  @override
  void dispose() {
    _enter.dispose();
    super.dispose();
  }

  Future<void> _pickAndUploadAvatar(AppState state) async {
    if (!state.isAuthenticated || _uploadingAvatar) return;
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1024,
    );
    if (file == null || !mounted) return;
    setState(() => _uploadingAvatar = true);
    try {
      final bytes = await file.readAsBytes();
      await state.uploadAvatar(bytes: bytes, filename: file.name);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile photo updated')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final rides = state.completedRideCount;
    final unitWord = state.distanceUnit == 'mi' ? 'mi' : 'km';
    final name = state.isAuthenticated
        ? (state.me?['fullName']?.toString().trim().isNotEmpty == true
            ? state.me!['fullName'].toString()
            : 'My account')
        : 'Log in or sign up';

    return ColoredBox(
      color: GtColors.bgGrey,
      child: SafeArea(
        right: false,
        child: ListView(
          padding: EdgeInsets.fromLTRB(16, widget.inDrawer ? 8 : 12, 16, 28),
          children: [
            if (widget.inDrawer) ...[
              _DrawerHeader(
                unreadCount: state.isAuthenticated
                    ? state.unreadNotificationCount
                    : 0,
                onNotifications: state.isAuthenticated
                    ? () {
                        Navigator.of(context).pop();
                        context.push('/notifications');
                      }
                    : null,
              ),
              const SizedBox(height: 12),
            ],
            FadeTransition(
              opacity: _fade0,
              child: SlideTransition(
                position: _slide0,
                child: _ProfileHero(
                  name: name,
                  subtitle: state.isAuthenticated
                      ? '$rides rides · $unitWord'
                      : 'Sign in to manage trips',
                  initials: _initials(name, state.isAuthenticated),
                  avatarUrl: state.isAuthenticated ? state.avatarUrl : null,
                  uploading: _uploadingAvatar,
                  onAvatarTap: state.isAuthenticated
                      ? () => _pickAndUploadAvatar(state)
                      : null,
                  onTap: () {
                    if (widget.inDrawer) Navigator.of(context).pop();
                    context.push(
                      state.isAuthenticated ? '/account' : '/auth',
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 20),
            FadeTransition(
              opacity: _fade1,
              child: SlideTransition(
                position: _slide1,
                child: _PrefsGroup(
                  notificationsEnabled: state.notificationsEnabled,
                  onNotificationsChanged: state.setNotificationsEnabled,
                  currencyCode: state.currencyCode,
                  distanceUnit: state.distanceUnit,
                  language: state.language,
                  onCurrency: () => _pickCurrency(context, state),
                  onDistance: () => _pickDistanceUnit(context, state),
                  onLanguage: () => _pickLanguage(context, state),
                ),
              ),
            ),
            const SizedBox(height: 16),
            FadeTransition(
              opacity: _fade2,
              child: SlideTransition(
                position: _slide2,
                child: _DriverPromo(
                  onDownload: () => _toast(context, 'Driver app coming soon'),
                ),
              ),
            ),
            const SizedBox(height: 24),
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

  String? _initials(String name, bool authenticated) {
    if (!authenticated || name == 'My account' || name == 'Log in or sign up') {
      return null;
    }
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return null;
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  void _toast(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
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
                    ? const Icon(Icons.check, color: GtColors.brand)
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
                    ? const Icon(Icons.check, color: GtColors.brand)
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
                    ? const Icon(Icons.check, color: GtColors.brand)
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

class _DrawerHeader extends StatelessWidget {
  const _DrawerHeader({this.unreadCount = 0, this.onNotifications});

  final int unreadCount;
  final VoidCallback? onNotifications;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
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
            if (onNotifications != null)
              IconButton(
                tooltip: 'Notifications',
                onPressed: onNotifications,
                icon: Badge(
                  isLabelVisible: unreadCount > 0,
                  label: Text(
                    unreadCount > 99 ? '99+' : '$unreadCount',
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
              icon: const Icon(Icons.close, color: GtColors.textSecondary),
            ),
          ],
        ),
        const SizedBox(height: 4),
        const Divider(height: 1, thickness: 1, color: GtColors.border),
      ],
    );
  }
}

class _ProfileHero extends StatelessWidget {
  const _ProfileHero({
    required this.name,
    required this.subtitle,
    required this.onTap,
    this.initials,
    this.avatarUrl,
    this.onAvatarTap,
    this.uploading = false,
  });

  final String name;
  final String subtitle;
  final String? initials;
  final String? avatarUrl;
  final VoidCallback onTap;
  final VoidCallback? onAvatarTap;
  final bool uploading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                GtColors.soft,
                Color(0xFFFFFFFF),
              ],
            ),
            border: Border.all(color: GtColors.border),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
            child: Row(
              children: [
                GestureDetector(
                  onTap: onAvatarTap,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: GtColors.soft,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: GtColors.brand.withValues(alpha: 0.2),
                          ),
                          image: avatarUrl != null && avatarUrl!.isNotEmpty
                              ? DecorationImage(
                                  image: NetworkImage(avatarUrl!),
                                  fit: BoxFit.cover,
                                )
                              : null,
                        ),
                        alignment: Alignment.center,
                        child: avatarUrl != null && avatarUrl!.isNotEmpty
                            ? null
                            : (initials != null
                                ? Text(
                                    initials!,
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w700,
                                      color: GtColors.brand,
                                    ),
                                  )
                                : const Icon(
                                    Icons.person_outline,
                                    size: 28,
                                    color: GtColors.brand,
                                  )),
                      ),
                      if (uploading)
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.35),
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          ),
                        )
                      else if (onAvatarTap != null)
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 18,
                            height: 18,
                            decoration: BoxDecoration(
                              color: GtColors.brand,
                              shape: BoxShape.circle,
                              border:
                                  Border.all(color: Colors.white, width: 1.5),
                            ),
                            child: const Icon(
                              Icons.camera_alt,
                              size: 10,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: GtColors.text,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          color: GtColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: GtColors.textMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PrefsGroup extends StatelessWidget {
  const _PrefsGroup({
    required this.notificationsEnabled,
    required this.onNotificationsChanged,
    required this.currencyCode,
    required this.distanceUnit,
    required this.language,
    required this.onCurrency,
    required this.onDistance,
    required this.onLanguage,
  });

  final bool notificationsEnabled;
  final ValueChanged<bool> onNotificationsChanged;
  final String currencyCode;
  final String distanceUnit;
  final String language;
  final VoidCallback onCurrency;
  final VoidCallback onDistance;
  final VoidCallback onLanguage;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            'Preferences',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
              color: GtColors.textSecondary,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: GtColors.border),
          ),
          child: Column(
            children: [
              _PrefRow(
                icon: Icons.notifications_outlined,
                label: 'Notifications',
                trailing: Switch.adaptive(
                  value: notificationsEnabled,
                  onChanged: onNotificationsChanged,
                  activeTrackColor: GtColors.brand,
                  inactiveTrackColor: GtColors.border,
                ),
              ),
              const _PrefDivider(),
              _PrefRow(
                icon: Icons.monetization_on_outlined,
                label: 'Currency',
                value: currencyCode,
                onTap: onCurrency,
              ),
              const _PrefDivider(),
              _PrefRow(
                icon: Icons.straighten,
                label: 'Distance unit',
                value: distanceUnit,
                onTap: onDistance,
              ),
              const _PrefDivider(),
              _PrefRow(
                icon: Icons.language,
                label: 'Language',
                value: language,
                onTap: onLanguage,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PrefDivider extends StatelessWidget {
  const _PrefDivider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(left: 56),
      child: Divider(height: 1, thickness: 1, color: GtColors.border),
    );
  }
}

class _PrefRow extends StatelessWidget {
  const _PrefRow({
    required this.icon,
    required this.label,
    this.value,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String? value;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(
              color: GtColors.soft,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(icon, size: 20, color: GtColors.brand),
          ),
          const SizedBox(width: 12),
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
          if (trailing != null)
            trailing!
          else ...[
            if (value != null)
              Text(
                value!,
                style: const TextStyle(
                  fontSize: 14,
                  color: GtColors.textMuted,
                ),
              ),
            const SizedBox(width: 2),
            const Icon(Icons.chevron_right, color: GtColors.textMuted, size: 22),
          ],
        ],
      ),
    );

    if (onTap == null) return row;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: row,
      ),
    );
  }
}

class _DriverPromo extends StatelessWidget {
  const _DriverPromo({required this.onDownload});

  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            GtColors.soft,
            GtColors.brand.withValues(alpha: 0.08),
            Colors.white,
          ],
        ),
        border: Border.all(color: GtColors.brand.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Join as a driver!',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: GtColors.text,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Download the application and earn with us',
            style: TextStyle(
              fontSize: 13,
              height: 1.3,
              color: GtColors.textSecondary,
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 42,
            child: ElevatedButton(
              onPressed: onDownload,
              style: ElevatedButton.styleFrom(
                backgroundColor: GtColors.brand,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                textStyle: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              child: const Text('Download'),
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
      backgroundColor: GtColors.bgGrey,
      child: MenuPanel(inDrawer: true),
    );
  }
}
