import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../payment/payment_details_rules.dart';
import '../../state/app_state.dart';

enum _PaymentLoadState { initialLoading, loaded, loadError }

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _holderCtrl = TextEditingController();
  final _maskCtrl = TextEditingController();
  final _holderFocus = FocusNode();
  final _maskFocus = FocusNode();

  _PaymentLoadState _loadState = _PaymentLoadState.initialLoading;
  String? _loadError;
  String? _saveError;
  String? _holderError;
  String? _maskError;

  bool _saving = false;
  bool _editingStarted = false;
  int _boundGeneration = -1;

  // Local draft (editable) — initialized only after successful GET.
  String _billingPeriod = '3 days';
  String _currency = 'CAD';
  String _bankCountry = 'Canada';
  String _payoutMethod = 'bank_transfer';

  // Snapshot of last server-hydrated editable values for dirty detection.
  String _snapBilling = '';
  String _snapCurrency = '';
  String _snapCountry = '';
  String _snapMethod = '';
  String _snapHolder = '';
  String _snapMask = '';

  @override
  void initState() {
    super.initState();
    _holderCtrl.addListener(_onFormChanged);
    _maskCtrl.addListener(_onFormChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _holderCtrl.removeListener(_onFormChanged);
    _maskCtrl.removeListener(_onFormChanged);
    _holderCtrl.dispose();
    _maskCtrl.dispose();
    _holderFocus.dispose();
    _maskFocus.dispose();
    super.dispose();
  }

  void _onFormChanged() {
    if (_loadState != _PaymentLoadState.loaded) return;
    if (!_editingStarted) {
      final dirty = _isDirty;
      if (dirty) {
        _editingStarted = true;
      }
    }
    setState(() {});
  }

  bool get _isDirty {
    if (_loadState != _PaymentLoadState.loaded) return false;
    return _billingPeriod != _snapBilling ||
        _currency != _snapCurrency ||
        _bankCountry != _snapCountry ||
        _payoutMethod != _snapMethod ||
        normalizeAccountHolder(_holderCtrl.text) != _snapHolder ||
        (_maskCtrl.text.trim() != _snapMask &&
            normalizeAccountMask(_maskCtrl.text) !=
                normalizeAccountMask(_snapMask));
  }

  bool get _formValid {
    return validateAccountHolder(_holderCtrl.text) == null &&
        validateAccountMask(_maskCtrl.text) == null;
  }

  bool get _canSave =>
      _loadState == _PaymentLoadState.loaded &&
      !_saving &&
      _isDirty &&
      _formValid;

  Future<void> _load() async {
    setState(() {
      _loadState = _PaymentLoadState.initialLoading;
      _loadError = null;
      _saveError = null;
      _editingStarted = false;
    });
    final s = context.read<AppState>();
    try {
      await s.loadPaymentDetails(force: true);
      if (!mounted) return;
      // Never overwrite in-progress edits with a late GET.
      if (_editingStarted) return;
      _bindFromAppState(s);
      setState(() => _loadState = _PaymentLoadState.loaded);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadState = _PaymentLoadState.loadError;
        _loadError = 'Could not load payment details. Check your connection and try again.';
      });
    }
  }

  void _bindFromAppState(AppState s) {
    _billingPeriod = s.billingPeriod;
    _currency = s.outpaymentCurrency;
    _bankCountry = s.bankCountry;
    _payoutMethod =
        s.payoutMethod.trim().isEmpty ? 'bank_transfer' : s.payoutMethod;
    _holderCtrl.text = s.accountHolderName;
    // Show last-4 only in the field when canonical ****XXXX is stored.
    final mask = s.accountMask;
    final digits = mask.replaceAll(RegExp(r'\D'), '');
    _maskCtrl.text = digits.length == 4 ? digits : mask;
    _snapBilling = _billingPeriod;
    _snapCurrency = _currency;
    _snapCountry = _bankCountry;
    _snapMethod = _payoutMethod;
    _snapHolder = normalizeAccountHolder(_holderCtrl.text);
    _snapMask = _maskCtrl.text.trim();
    _boundGeneration = s.paymentDetailsGeneration;
    _holderError = null;
    _maskError = null;
  }

  Future<bool> _confirmDiscardIfNeeded() async {
    if (!_isDirty || _saving) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard unsaved changes?'),
        content: const Text(
          'You have unsaved payment details. Leave without saving?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _onBack() async {
    if (!await _confirmDiscardIfNeeded()) return;
    if (!mounted) return;
    context.pop();
  }

  Future<void> _save(AppState s) async {
    if (!_canSave || _saving) return;

    final holderErr = validateAccountHolder(_holderCtrl.text);
    final maskErr = validateAccountMask(_maskCtrl.text);
    setState(() {
      _holderError = holderErr;
      _maskError = maskErr;
      _saveError = null;
    });
    if (holderErr != null || maskErr != null) return;

    setState(() => _saving = true);
    try {
      final patch = buildEditablePaymentPatch(
        billingPeriod: _billingPeriod,
        outpaymentCurrency: _currency,
        bankCountry: _bankCountry,
        payoutMethod: _payoutMethod,
        accountHolderName: _holderCtrl.text,
        accountMask: _maskCtrl.text,
      );
      await s.savePaymentDetails(editablePatch: patch);
      if (!mounted) return;
      // Re-bind from server-authoritative AppState (never trust local PATCH body).
      _editingStarted = false;
      _bindFromAppState(s);
      setState(() {
        _saving = false;
        _saveError = null;
      });
      if (s.onboardedComplete) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment details saved')),
        );
        context.pop();
      } else {
        await s.completeOnboarding();
        if (mounted) context.go('/');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saveError = _humanError(e);
      });
    }
  }

  String _humanError(Object e) {
    final raw = e.toString();
    // Never echo account numbers / masks from errors.
    if (raw.contains('last 4') || raw.contains('ACCOUNT_MASK')) {
      return 'Enter only the last 4 digits — never your full account number.';
    }
    if (raw.contains('Account holder')) {
      return 'Please check the account holder name.';
    }
    if (raw.contains('ApiException') || raw.contains('SocketException')) {
      return 'Could not save. Check your connection and try again.';
    }
    return 'Could not save payment details. Please try again.';
  }

  String _formatReviewedAt(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return iso;
    final y = dt.year.toString().padLeft(4, '0');
    final m = dt.month.toString().padLeft(2, '0');
    final d = dt.day.toString().padLeft(2, '0');
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    return '$y-$m-$d $hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    // If AppState re-hydrated while we are not editing, rebind.
    if (_loadState == _PaymentLoadState.loaded &&
        !_editingStarted &&
        !_saving &&
        s.paymentDetailsGeneration != _boundGeneration &&
        s.paymentDetailsLoaded) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _editingStarted) return;
        _bindFromAppState(s);
        setState(() {});
      });
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        await _onBack();
      },
      child: Scaffold(
        backgroundColor: GtColors.bgGrey,
        resizeToAvoidBottomInset: true,
        appBar: AppBar(
          title: const Text('Payment details'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: _onBack,
          ),
        ),
        body: _buildBody(s),
      ),
    );
  }

  Widget _buildBody(AppState s) {
    if (_loadState == _PaymentLoadState.initialLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loadState == _PaymentLoadState.loadError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 40, color: GtColors.textMuted),
              const SizedBox(height: 12),
              Text(
                _loadError ?? 'Failed to load',
                textAlign: TextAlign.center,
                style: const TextStyle(color: GtColors.textSecondary),
              ),
              const SizedBox(height: 16),
              GtGreenButton(
                label: 'Retry',
                onPressed: _load,
                fullWidth: false,
              ),
            ],
          ),
        ),
      );
    }

    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final status = s.paymentStatus;
    final countryOpts = optionsWithLegacy(kBankCountryOptions, _bankCountry);
    final currencyOpts = optionsWithLegacy(kCurrencyOptions, _currency);
    final billingOpts = optionsWithLegacy(kBillingPeriodOptions, _billingPeriod);
    final methodOpts = optionsWithLegacy(kSupportedPayoutMethods, _payoutMethod);

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottomInset),
            children: [
              _StatusHero(
                status: status,
                reviewNote: status == 'REJECTED' ? s.paymentReviewNote : null,
                reviewedAtLabel: status == 'REJECTED'
                    ? _formatReviewedAt(s.paymentReviewedAt)
                    : null,
              ),
              const SizedBox(height: 12),
              GtCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Payout summary',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                    const SizedBox(height: 12),
                    _InfoRow(
                      label: 'Commission',
                      value: '${s.commissionPct ?? s.paymentDetails?['commissionPct'] ?? '—'}%',
                    ),
                    const SizedBox(height: 8),
                    _InfoRow(
                      label: 'Payment period',
                      value: displayPaymentPeriod(s.paymentPeriod),
                    ),
                    const SizedBox(height: 8),
                    _InfoRow(
                      label: 'Method',
                      value: labelForPayoutMethod(_payoutMethod),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Sensitive bank credentials are never stored in the app. '
                      'Only a masked last-4 reference is kept for payout matching.',
                      style: TextStyle(
                        color: GtColors.textSecondary.withValues(alpha: 0.95),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GtCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Payout preferences',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                    const SizedBox(height: 12),
                    _LabeledDropdown(
                      label: 'Billing period',
                      value: _billingPeriod,
                      options: billingOpts,
                      onChanged: (v) {
                        setState(() {
                          _billingPeriod = v;
                          _editingStarted = true;
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    _LabeledDropdown(
                      label: 'Outpayment currency',
                      value: _currency,
                      options: currencyOpts,
                      onChanged: (v) {
                        setState(() {
                          _currency = v;
                          _editingStarted = true;
                        });
                      },
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Choosing a currency different from your bank account currency can imply conversion expenses.',
                      style: TextStyle(color: GtColors.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    _LabeledDropdown(
                      label: 'Payout method',
                      value: _payoutMethod,
                      options: methodOpts,
                      onChanged: methodOpts.length <= 1
                          ? null
                          : (v) {
                              setState(() {
                                _payoutMethod = v;
                                _editingStarted = true;
                              });
                            },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GtCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Bank details',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                    const SizedBox(height: 12),
                    _LabeledDropdown(
                      label: 'Bank country',
                      value: _bankCountry,
                      options: countryOpts,
                      onChanged: (v) {
                        setState(() {
                          _bankCountry = v;
                          _editingStarted = true;
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _holderCtrl,
                      focusNode: _holderFocus,
                      textInputAction: TextInputAction.next,
                      onSubmitted: (_) => _maskFocus.requestFocus(),
                      decoration: InputDecoration(
                        labelText: 'Account holder',
                        helperText: 'Name as it appears on the bank account',
                        errorText: _holderError,
                        border: const OutlineInputBorder(),
                      ),
                      textCapitalization: TextCapitalization.words,
                      onChanged: (_) {
                        if (_holderError != null) {
                          setState(() => _holderError = validateAccountHolder(_holderCtrl.text));
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _maskCtrl,
                      focusNode: _maskFocus,
                      textInputAction: TextInputAction.done,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9*]')),
                        LengthLimitingTextInputFormatter(kAccountMaskMaxLen),
                      ],
                      decoration: InputDecoration(
                        labelText: 'Account (last 4 digits)',
                        helperText:
                            'Enter only the last 4 digits. Never enter your full bank account number.',
                        errorText: _maskError,
                        hintText: '1234',
                        border: const OutlineInputBorder(),
                        suffixText: normalizeAccountMask(_maskCtrl.text),
                      ),
                      onChanged: (_) {
                        if (_maskError != null) {
                          setState(() => _maskError = validateAccountMask(_maskCtrl.text));
                        } else {
                          setState(() {});
                        }
                      },
                    ),
                  ],
                ),
              ),
              if (_saveError != null) ...[
                const SizedBox(height: 12),
                Text(
                  _saveError!,
                  style: const TextStyle(color: GtColors.brand),
                ),
              ],
              const SizedBox(height: 24),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 16 + (bottomInset > 0 ? 0 : 0)),
            child: GtGreenButton(
              label: _saving ? 'Saving…' : 'Save',
              onPressed: _canSave ? () => _save(s) : null,
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusHero extends StatelessWidget {
  const _StatusHero({
    required this.status,
    this.reviewNote,
    this.reviewedAtLabel,
  });

  final String status;
  final String? reviewNote;
  final String? reviewedAtLabel;

  @override
  Widget build(BuildContext context) {
    final meta = _statusMeta(status);
    return GtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(meta.icon, color: meta.color, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      meta.title,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                        color: meta.color,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      meta.subtitle,
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
          if (status == 'REJECTED') ...[
            if (reviewNote != null && reviewNote!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: GtColors.soft,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: GtColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Review note',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      reviewNote!,
                      style: const TextStyle(fontSize: 14),
                    ),
                  ],
                ),
              ),
            ],
            if (reviewedAtLabel != null && reviewedAtLabel!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Reviewed $reviewedAtLabel',
                style: const TextStyle(
                  color: GtColors.textMuted,
                  fontSize: 12,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }

  static ({IconData icon, Color color, String title, String subtitle})
      _statusMeta(String status) {
    switch (status.toUpperCase()) {
      case 'VERIFIED':
        return (
          icon: Icons.verified,
          color: GtColors.green,
          title: 'Verified',
          subtitle: 'Your payout details are approved. You can withdraw when eligible.',
        );
      case 'PENDING':
        return (
          icon: Icons.hourglass_top,
          color: GtColors.warn,
          title: 'Pending review',
          subtitle: 'We are reviewing your payout details. This usually takes a short time.',
        );
      case 'REJECTED':
        return (
          icon: Icons.error_outline,
          color: GtColors.brand,
          title: 'Rejected',
          subtitle: 'Update your details below and save to resubmit for review.',
        );
      case 'CONFIGURED':
        return (
          icon: Icons.account_balance_outlined,
          color: GtColors.textSecondary,
          title: 'Configured',
          subtitle: 'Save your bank details so we can verify your payout method.',
        );
      default:
        return (
          icon: Icons.account_balance_wallet_outlined,
          color: GtColors.textMuted,
          title: 'Not configured',
          subtitle: 'Add your payout preferences and bank last-4 to get paid.',
        );
    }
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 2,
          child: Text(
            label,
            style: const TextStyle(color: GtColors.textSecondary, fontSize: 13),
          ),
        ),
        Expanded(
          flex: 3,
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

class _LabeledDropdown extends StatelessWidget {
  const _LabeledDropdown({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final String value;
  final List<PaymentOption> options;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final safe = options.any((o) => o.value == value)
        ? value
        : (options.isNotEmpty ? options.first.value : value);
    return InputDecorator(
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          isExpanded: true,
          value: options.any((o) => o.value == safe) ? safe : null,
          items: options
              .map(
                (o) => DropdownMenuItem(
                  value: o.value,
                  child: Text(o.label, overflow: TextOverflow.ellipsis),
                ),
              )
              .toList(),
          onChanged: onChanged == null
              ? null
              : (v) {
                  if (v != null) onChanged!(v);
                },
        ),
      ),
    );
  }
}
