import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final p = state.repo.passenger;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Account'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          GtCard(
            child: Column(
              children: [
                _row(
                  context,
                  label: 'Full name',
                  value: p.fullName,
                  field: 'fullName',
                  title: 'Full name',
                ),
                const Divider(height: 1),
                _row(
                  context,
                  label: 'Email',
                  value: p.email,
                  field: 'email',
                  title: 'Email',
                ),
                const Divider(height: 1),
                _row(
                  context,
                  label: 'Phone',
                  value: p.phone.isEmpty ? 'Add phone' : p.phone,
                  field: 'phone',
                  title: 'Phone',
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          GtCard(
            onTap: () => _confirmDelete(context, state),
            child: const Center(
              child: Text(
                'Delete my account',
                style: TextStyle(
                  color: GtColors.red,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _row(
    BuildContext context, {
    required String label,
    required String value,
    required String field,
    required String title,
  }) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label, style: const TextStyle(fontSize: 13, color: GtColors.textSecondary)),
      subtitle: Text(
        value,
        style: const TextStyle(fontSize: 16, color: GtColors.text, fontWeight: FontWeight.w500),
      ),
      trailing: const Icon(Icons.chevron_right, color: GtColors.textMuted),
      onTap: () {
        final state = context.read<AppState>();
        final current = field == 'fullName'
            ? state.repo.passenger.fullName
            : field == 'email'
                ? state.repo.passenger.email
                : state.repo.passenger.phone;
        context.push('/edit-field', extra: {
          'title': title,
          'value': current,
          'field': field,
        });
      },
    );
  }

  Future<void> _confirmDelete(BuildContext context, AppState state) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete account?'),
        content: const Text(
          'This demo will clear your local profile data. This cannot be undone in the prototype.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: GtColors.red)),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      state.deleteAccountSim();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Account deleted (demo)')),
      );
      context.pop();
    }
  }
}

class EditFieldScreen extends StatefulWidget {
  const EditFieldScreen({
    super.key,
    required this.title,
    required this.initialValue,
    required this.field,
  });

  final String title;
  final String initialValue;
  final String field;

  @override
  State<EditFieldScreen> createState() => _EditFieldScreenState();
}

class _EditFieldScreenState extends State<EditFieldScreen> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _save() {
    final state = context.read<AppState>();
    final v = _controller.text.trim();
    switch (widget.field) {
      case 'email':
        state.updateProfile(email: v);
      case 'phone':
        state.updateProfile(phone: v);
      default:
        state.updateProfile(fullName: v);
    }
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
        actions: [
          TextButton(
            onPressed: _save,
            child: const Text('Save', style: TextStyle(color: GtColors.orange)),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: GtUnderlineField(
          hint: widget.title,
          controller: _controller,
        ),
      ),
    );
  }
}
