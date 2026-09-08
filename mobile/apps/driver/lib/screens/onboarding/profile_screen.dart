import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../state/driver_settings_mappers.dart';

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
  bool _loaded = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController();
    _legal = TextEditingController();
    _reg = TextEditingController();
    _tax = TextEditingController();
    _address = TextEditingController();
    _referral = TextEditingController();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      if (s.isAuthenticated) {
        try {
          await s.loadDriverProfile();
        } catch (_) {}
      }
      if (!mounted) return;
      _name.text = s.fullName;
      _legal.text = s.legalName;
      _reg.text = s.registrationNumber;
      _tax.text = s.taxpayerId;
      _address.text = s.address;
      _referral.text = s.referralCode;
      setState(() => _loaded = true);
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
    String query = '';
    await showGtSheet(
      context: context,
      child: SafeArea(
        child: StatefulBuilder(
          builder: (context, setSheet) {
            final entries = kDriverLanguages.entries
                .where((e) =>
                    query.isEmpty ||
                    e.value.toLowerCase().contains(query.toLowerCase()) ||
                    e.key.toLowerCase().contains(query.toLowerCase()))
                .toList();
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Languages you speak',
                    style: TextStyle(
                      color: GtColors.brand,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Selected ${s.selectedLanguages.length}/6',
                    style: const TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search languages',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onChanged: (v) => setSheet(() => query = v),
                  ),
                  SizedBox(
                    height: MediaQuery.of(context).size.height * 0.45,
                    child: ListView.builder(
                      itemCount: entries.length,
                      itemBuilder: (_, i) {
                        final code = entries[i].key;
                        final label = entries[i].value;
                        return Consumer<AppState>(
                          builder: (_, state, __) {
                            final on =
                                state.selectedLanguages.contains(code);
                            return CheckboxListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text('$label ($code)'),
                              value: on,
                              activeColor: GtColors.brand,
                              onChanged: (_) => state.toggleLanguage(code),
                            );
                          },
                        );
                      },
                    ),
                  ),
                  GtGreenButton(
                    label: 'Done',
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> _continue(AppState s) async {
    _sync(s);
    setState(() => _error = null);
    if (s.isAuthenticated) {
      try {
        await s.saveDriverProfile();
      } catch (e) {
        setState(() => _error = e.toString());
        return;
      }
    }
    if (!mounted) return;
    if (s.onboardedComplete) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Profile saved')),
      );
      context.pop();
    } else {
      context.push('/onboarding/location');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final settingsMode = s.onboardedComplete;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CanGoLogo(size: 22),
            const SizedBox(width: 8),
            Text(settingsMode ? 'Carrier profile' : 'New carrier profile'),
          ],
        ),
        leading: settingsMode
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => context.pop(),
              )
            : null,
      ),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Text(_error!,
                        style: const TextStyle(color: GtColors.red)),
                  ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    children: [
                      _entityTile(
                        selected: s.isIndividual,
                        title: 'Individual',
                        subtitle: 'Private person / sole driver',
                        onTap: () => s.setIndividual(true),
                      ),
                      const SizedBox(height: 8),
                      _entityTile(
                        selected: !s.isIndividual,
                        title: 'Legal entity',
                        subtitle: 'Company or sole proprietor',
                        onTap: () => s.setIndividual(false),
                      ),
                      const SizedBox(height: 16),
                      GtUnderlineField(
                        hint: s.isIndividual
                            ? 'Full legal name'
                            : "Contact person's full name",
                        controller: _name,
                      ),
                      if (!s.isIndividual) ...[
                        GtUnderlineField(
                          hint: 'Business / legal name',
                          controller: _legal,
                        ),
                        GtUnderlineField(
                          hint: 'Registration / company number',
                          controller: _reg,
                        ),
                      ],
                      GtUnderlineField(
                        hint: 'Taxpayer identification number',
                        controller: _tax,
                      ),
                      const SizedBox(height: 8),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Languages spoken'),
                        subtitle: Text(
                          s.selectedLanguages.isEmpty
                              ? 'Select up to 6'
                              : s.selectedLanguages
                                  .map((c) => kDriverLanguages[c] ?? c)
                                  .join(', '),
                        ),
                        trailing: const Icon(Icons.keyboard_arrow_down),
                        onTap: () => _openLanguages(s),
                      ),
                      const Divider(),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: s.hasReferral,
                        activeColor: GtColors.brand,
                        title: const Text('I have a referral code'),
                        onChanged: s.referralImmutable
                            ? null
                            : (v) =>
                                s.updateProfile(hasReferral: v ?? false),
                      ),
                      if (s.hasReferral || s.referralImmutable)
                        GtUnderlineField(
                          hint: 'Referral code',
                          controller: _referral,
                          readOnly: s.referralImmutable,
                        ),
                      const SizedBox(height: 12),
                      const Text(
                        'Registration address',
                        style: TextStyle(
                          color: GtColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                      GtUnderlineField(
                        hint: 'Address',
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
                      if (s.email.isNotEmpty || s.phoneE164.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        if (s.phoneE164.isNotEmpty)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.phone_outlined),
                            title: Text(s.phoneE164),
                            subtitle: const Text('Phone'),
                          ),
                        if (s.email.isNotEmpty)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.email_outlined),
                            title: Text(s.email),
                            subtitle: const Text('Email'),
                          ),
                      ],
                      if (!settingsMode) ...[
                        const SizedBox(height: 16),
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                          value: s.acceptedTerms,
                          activeColor: GtColors.brand,
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
                          onChanged: (v) =>
                              s.updateProfile(acceptedTerms: v ?? false),
                        ),
                      ],
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: GtGreenButton(
                    label: s.profileSaving
                        ? 'Saving…'
                        : (settingsMode ? 'Save' : 'Next'),
                    onPressed: s.profileSaving
                        ? null
                        : (settingsMode || s.profileValidEnough)
                            ? () => _continue(s)
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
                  Text(title,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 12,
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
