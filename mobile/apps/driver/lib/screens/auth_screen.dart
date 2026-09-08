import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _phone = TextEditingController(text: '+1');
  final _name = TextEditingController();
  final _otp = TextEditingController();
  bool _registerMode = true;
  bool _otpStep = false;
  bool _busy = false;
  String? _challengeId;
  String? _error;
  String? _debugHint;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    _name.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
      _debugHint = null;
    });
    final app = context.read<AppState>();
    try {
      if (_otpStep) {
        await app.verifyOtp(
          challengeId: _challengeId!,
          code: _otp.text.trim(),
        );
        if (mounted) context.go('/onboarding/profile');
        return;
      }
      if (_registerMode) {
        final res = await app.register(
          email: _email.text.trim(),
          password: _password.text,
          phoneE164: _phone.text.trim(),
          fullName: _name.text.trim(),
        );
        setState(() {
          _otpStep = true;
          _challengeId = res['challengeId'] as String?;
          _debugHint = res['debugCode']?.toString();
        });
      } else {
        await app.login(
          email: _email.text.trim(),
          password: _password.text,
        );
        if (mounted) {
          context.go(app.onboardedComplete ? '/' : '/onboarding/profile');
        }
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 24),
            Text(
              _otpStep
                  ? 'Verify phone'
                  : (_registerMode ? 'Driver sign up' : 'Driver sign in'),
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              _otpStep
                  ? 'Enter the SMS code${_debugHint != null ? ' (dev: $_debugHint)' : ''}'
                  : 'CAN-GO driver · real API',
              style: const TextStyle(color: GtColors.textSecondary),
            ),
            const SizedBox(height: 24),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (_otpStep)
              TextField(
                controller: _otp,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'OTP code'),
              )
            else ...[
              if (_registerMode)
                TextField(
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Full name'),
                ),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              if (_registerMode)
                TextField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Phone (E.164)'),
                ),
              TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
              ),
            ],
            const SizedBox(height: 20),
            GtGreenButton(
              label: _busy
                  ? 'Please wait…'
                  : (_otpStep
                      ? 'Verify'
                      : (_registerMode ? 'Register' : 'Sign in')),
              onPressed: _busy ? null : _submit,
            ),
            if (!_otpStep)
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() => _registerMode = !_registerMode),
                child: Text(
                  _registerMode
                      ? 'Already have an account? Sign in'
                      : 'Need an account? Register',
                ),
              ),
          ],
        ),
      ),
    );
  }
}
