import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final TextEditingController _name;
  late final TextEditingController _legal;
  late final TextEditingController _reg;
  late final TextEditingController _tax;
  late final TextEditingController _address;
  late final TextEditingController _referral;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController();
    _legal = TextEditingController();
    _reg = TextEditingController();
    _tax = TextEditingController();
    _address = TextEditingController();
    _referral = TextEditingController();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final s = context.read<AppState>();
      _name.text = s.fullName;
      _legal.text = s.legalName;
      _reg.text = s.registrationNumber;
      _tax.text = s.taxpayerId;
      _address.text = s.address;
      _referral.text = s.referralCode;
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _legal.dispose();
    _reg.dispose();
    _tax.dispose();
    _address.dispose();
    _referral.dispose();
    super.dispose();
  }

  void _sync(AppState s) {
    s.updateProfile(
      fullName: _name.text,
      legalName: _legal.text,
      registrationNumber: _reg.text,
      taxpayerId: _tax.text,
      address: _address.text,
      referralCode: _referral.text,
    );
  }

  Future<void> _openLanguages(AppState s) async {
    await showGtSheet(
      context: context,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Languages your drivers speak',
                style: TextStyle(
                  color: GtColors.orange,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Maximum number of selections: 6',
                style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: MediaQuery.of(context).size.height * 0.55,
                child: ListView.builder(
                  itemCount: MockData.languages.length,
                  itemBuilder: (_, i) {
                    final lang = MockData.languages[i];
                    return Consumer<AppState>(
                      builder: (_, state, __) {
                        final on = state.selectedLanguages.contains(lang);
                        return SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(lang),
                          value: on,
                          activeColor: GtColors.green,
                          onChanged: (_) => state.toggleLanguage(lang),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CanGoLogo(size: 22),
            SizedBox(width: 8),
            Text('New carrier profile'),
          ],
        ),
        actions: [
          IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert)),
        ],
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFFFFFFFF),
                  Color(0xFFFFF8F8),
                  Color(0xFFF8EAEA),
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
            child: const Row(
              children: [
                CanGoLogo(size: 72),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'CAN-GO Driver',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          letterSpacing: 0.3,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Carrier onboarding · same brand as passenger',
                        style: TextStyle(
                          color: GtColors.textSecondary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w500,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                _entityTile(
                  selected: s.isIndividual,
                  title: 'Individual',
                  subtitle: 'private person',
                  onTap: () => s.setIndividual(true),
                ),
                const SizedBox(height: 8),
                _entityTile(
                  selected: !s.isIndividual,
                  title: 'Legal entity',
                  subtitle: 'company or sole proprietor',
                  onTap: () => s.setIndividual(false),
                ),
                const SizedBox(height: 20),
                const _SectionHeader(icon: Icons.info_outline, label: 'Info'),
                GtUnderlineField(
                  hint: 'Your full name',
                  controller: _name,
                ),
                if (!s.isIndividual) ...[
                  GtUnderlineField(
                    hint: "Business or person's full legal name",
                    controller: _legal,
                  ),
                  GtUnderlineField(
                    hint:
                        'Registration number of the Company or Sole Proprietor (self-employed)',
                    controller: _reg,
                  ),
                ],
                GtUnderlineField(
                  hint: 'Taxpayer identification number',
                  controller: _tax,
                ),
                const SizedBox(height: 8),
                InkWell(
                  onTap: () => _openLanguages(s),
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      hintText: 'Languages your drivers speak',
                      border: UnderlineInputBorder(),
                      suffixIcon: Icon(Icons.keyboard_arrow_down),
                    ),
                    child: Text(
                      s.selectedLanguages.isEmpty
                          ? ''
                          : s.selectedLanguages.join(', '),
                      style: const TextStyle(fontSize: 16),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Maximum number of selections: 6',
                  style: TextStyle(color: GtColors.textSecondary, fontSize: 12),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: s.hasReferral,
                  activeColor: GtColors.green,
                  title: const Text('I have a referral code'),
                  onChanged: (v) => s.updateProfile(hasReferral: v ?? false),
                ),
                if (s.hasReferral)
                  GtUnderlineField(
                    hint: 'Referral code',
                    controller: _referral,
                  ),
                const SizedBox(height: 12),
                const _SectionHeader(icon: Icons.place_outlined, label: 'Address'),
                GtUnderlineField(
                  hint: 'Registration address and postal code',
                  controller: _address,
                ),
                InkWell(
                  onTap: () {
                    _sync(s);
                    context.push('/onboarding/location');
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      hintText: 'Base location of your transport',
                      border: UnderlineInputBorder(),
                      suffixIcon: Icon(Icons.keyboard_arrow_down),
                    ),
                    child: Text(
                      s.baseLocation.isEmpty ? '' : s.baseLocation,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 16),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: s.acceptedTerms,
                  activeColor: GtColors.green,
                  title: const Text.rich(
                    TextSpan(
                      text: 'I have read and accepted ',
                      children: [
                        TextSpan(
                          text: 'CAN-GO Service License Contract',
                          style: TextStyle(
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ],
                    ),
                  ),
                  onChanged: (v) => s.updateProfile(acceptedTerms: v ?? false),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: GtGreenButton(
              label: 'Next',
              onPressed: s.profileValidEnough
                  ? () async {
                      _sync(s);
                      final code = _referral.text.trim();
                      if (s.hasReferral && code.isNotEmpty) {
                        try {
                          await s.api.auth.redeemReferral(code);
                        } catch (_) {
                          // Non-blocking: continue onboarding even if code invalid.
                        }
                      }
                      if (!context.mounted) return;
                      context.push('/onboarding/location');
                    }
                  : null,
            ),
          ),
        ],
      ),
    );
  }

  Widget _entityTile({
    required bool selected,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? GtColors.brand : GtColors.border,
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? GtColors.brand : GtColors.textMuted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: GtColors.textSecondary),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
