import 'dart:async';

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
  static const _otpLength = 6;
  static const _resendSeconds = 30;

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

  GtOtpStatus _otpStatus = GtOtpStatus.idle;
  String? _otpMessage;
  String? _resendNotice;
  bool _verifiedFlash = false;
  int _resendLeft = _resendSeconds;
  Timer? _resendTimer;

  @override
  void dispose() {
    _resendTimer?.cancel();
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    _name.dispose();
    _otp.dispose();
    super.dispose();
  }

  void _startResendTimer() {
    _resendTimer?.cancel();
    setState(() => _resendLeft = _resendSeconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_resendLeft <= 1) {
        t.cancel();
        setState(() => _resendLeft = 0);
      } else {
        setState(() => _resendLeft -= 1);
      }
    });
  }

  String _formatCountdown(int s) {
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final sec = (s % 60).toString().padLeft(2, '0');
    return '$m:$sec';
  }

  Future<void> _submitRegisterOrLogin() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final app = context.read<AppState>();
    try {
      if (_registerMode) {
        final res = await app.register(
          email: _email.text.trim(),
          password: _password.text,
          phoneE164: _phone.text.trim(),
          fullName: _name.text.trim(),
        );
        final cid = res['challengeId'] as String?;
        if (cid == null || cid.isEmpty) {
          throw Exception('Could not start phone verification.');
        }
        if (!mounted) return;
        setState(() {
          _otpStep = true;
          _challengeId = cid;
          _debugHint = res['debugCode']?.toString();
          _otp.clear();
          _otpStatus = GtOtpStatus.idle;
          _otpMessage = null;
          _resendNotice = null;
          _verifiedFlash = false;
          _busy = false;
        });
        _startResendTimer();
        return;
      }

      try {
        await app.login(
          email: _email.text.trim(),
          password: _password.text,
        );
        if (!mounted) return;
        context.go(app.onboardedComplete ? '/' : '/onboarding/profile');
      } on ApiException catch (err) {
        if (err.code == 'PHONE_NOT_VERIFIED') {
          final body = err.flatBody;
          final cid = body['challengeId'];
          if (cid is String && cid.isNotEmpty) {
            if (!mounted) return;
            setState(() {
              _otpStep = true;
              _challengeId = cid;
              _debugHint = body['debugCode']?.toString();
              _otp.clear();
              _otpStatus = GtOtpStatus.idle;
              _otpMessage = null;
              _resendNotice = null;
              _verifiedFlash = false;
              _busy = false;
              _error = null;
            });
            _startResendTimer();
            return;
          }
        }
        rethrow;
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _busy = false;
      });
    } finally {
      if (mounted && _busy && !_otpStep) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _onVerify([String? code]) async {
    final cid = _challengeId;
    final next = (code ?? _otp.text).replaceAll(RegExp(r'\D'), '');
    if (cid == null || next.length != _otpLength || _busy || _verifiedFlash) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _otpMessage = null;
      _otpStatus = GtOtpStatus.idle;
    });
    try {
      final app = context.read<AppState>();
      await app.verifyOtp(
        challengeId: cid,
        code: next,
      );
      if (!mounted) return;
      setState(() {
        _otpStatus = GtOtpStatus.success;
        _verifiedFlash = true;
        _otpMessage = 'Phone verified successfully';
        _busy = false;
      });
      context.go(app.onboardedComplete ? '/' : '/onboarding/profile');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _otpStatus = GtOtpStatus.error;
        _otpMessage = friendlyOtpError(e);
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _otpStatus = GtOtpStatus.error;
        _otpMessage = friendlyOtpError(e);
        _busy = false;
      });
    }
  }

  Future<void> _onResend() async {
    if (_busy || _resendLeft > 0) return;
    setState(() {
      _busy = true;
      _resendNotice = null;
      _otpMessage = null;
      _otpStatus = GtOtpStatus.idle;
    });
    try {
      final res = await context.read<AppState>().sendPhoneOtp(
            _phone.text.trim(),
            purpose: 'verify_phone',
          );
      final cid = res['challengeId'] as String?;
      if (cid == null || cid.isEmpty) {
        throw Exception('Could not send a new code.');
      }
      if (!mounted) return;
      setState(() {
        _challengeId = cid;
        _debugHint = res['debugCode']?.toString();
        _otp.clear();
        _resendNotice = 'A new verification code has been sent.';
        _busy = false;
      });
      _startResendTimer();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _otpStatus = GtOtpStatus.error;
        _otpMessage = friendlyOtpError(e);
        _busy = false;
      });
    }
  }

  void _onChangeNumber() {
    _resendTimer?.cancel();
    setState(() {
      _otpStep = false;
      _otp.clear();
      _challengeId = null;
      _debugHint = null;
      _otpStatus = GtOtpStatus.idle;
      _otpMessage = null;
      _resendNotice = null;
      _verifiedFlash = false;
      _error = null;
      _registerMode = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final complete =
        _otp.text.replaceAll(RegExp(r'\D'), '').length == _otpLength;

    return Scaffold(
      backgroundColor: GtColors.white,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              children: [
                const Padding(
                  padding: EdgeInsets.only(bottom: 16),
                  child: Row(
                    children: [
                      CanGoLogo(size: 40),
                      SizedBox(width: 12),
                      Expanded(
                        child: CanRideWordmark(
                          fontSize: 26,
                          maxWidth: 220,
                        ),
                      ),
                    ],
                  ),
                ),
                if (_otpStep)
                  Row(
                    children: [
                      IconButton(
                        tooltip: 'Back',
                        onPressed: _busy ? null : _onChangeNumber,
                        icon: const Icon(Icons.arrow_back_rounded),
                      ),
                      const Spacer(),
                    ],
                  )
                else ...[
                  Text(
                    _registerMode ? 'Driver sign up' : 'Driver sign in',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: GtColors.text,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'CAN-RIDE driver · verify your phone to secure your account',
                    style: TextStyle(color: GtColors.textSecondary),
                  ),
                ],
                const SizedBox(height: 16),
                if (_error != null && !_otpStep)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF0F0),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFFFFD0D0)),
                      ),
                      child: Text(
                        _error!,
                        style: const TextStyle(color: GtColors.brand),
                      ),
                    ),
                  ),
                if (_otpStep) ...[
                  const GtOtpHeader(
                    title: 'Verify your phone',
                    subtitle:
                        'Verify your phone to secure your driver account.\nEnter the 6-digit code sent to',
                    icon: Icons.verified_user_outlined,
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        maskPhoneE164(_phone.text),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      TextButton(
                        onPressed: _busy ? null : _onChangeNumber,
                        child: const Text(
                          'Change',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                  if (_debugHint != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFFBEB),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFC9B07A)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'DEVELOPMENT MODE',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.4,
                              color: Color(0xFF8A6D2B),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Test OTP: $_debugHint',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF5C4A1F),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  GtOtpInput(
                    controller: _otp,
                    length: _otpLength,
                    enabled: !_busy && !_verifiedFlash,
                    status: _otpStatus,
                    onChanged: (_) {
                      if (_otpStatus == GtOtpStatus.error) {
                        setState(() {
                          _otpStatus = GtOtpStatus.idle;
                          _otpMessage = null;
                        });
                      } else {
                        setState(() {});
                      }
                    },
                    onCompleted: _onVerify,
                  ),
                  if (_otpMessage != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _otpStatus == GtOtpStatus.success
                          ? '✓ $_otpMessage'
                          : _otpMessage!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13.5,
                        height: 1.4,
                        fontWeight: _otpStatus == GtOtpStatus.success
                            ? FontWeight.w600
                            : FontWeight.w400,
                        color: _otpStatus == GtOtpStatus.error
                            ? GtColors.brandDark
                            : _otpStatus == GtOtpStatus.success
                                ? GtColors.green
                                : GtColors.textSecondary,
                      ),
                    ),
                  ],
                  if (_resendNotice != null && _otpMessage == null) ...[
                    const SizedBox(height: 12),
                    Text(
                      '✓ $_resendNotice',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: GtColors.green,
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  const Text(
                    "Didn't receive a code?",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13.5,
                      color: GtColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  if (_resendLeft > 0)
                    Text(
                      'Resend code in ${_formatCountdown(_resendLeft)}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    )
                  else
                    TextButton(
                      onPressed: _busy ? null : _onResend,
                      child: Text(
                        _busy ? 'Sending…' : 'Resend code',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  const SizedBox(height: 20),
                  GtGreenButton(
                    label: _busy
                        ? 'Verifying…'
                        : _verifiedFlash
                            ? '✓ Phone verified'
                            : 'Verify & Continue',
                    onPressed:
                        (!_busy && complete && !_verifiedFlash) ? _onVerify : null,
                  ),
                  const SizedBox(height: 16),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.lock_outline,
                        size: 14,
                        color: GtColors.textMuted,
                      ),
                      SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          'Secure verification · Your information is protected',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 12,
                            color: GtColors.textMuted,
                          ),
                        ),
                      ),
                    ],
                  ),
                ] else ...[
                  if (_registerMode)
                    TextField(
                      controller: _name,
                      decoration:
                          const InputDecoration(labelText: 'Full name'),
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
                      decoration: const InputDecoration(
                        labelText: 'Phone (E.164)',
                        hintText: '+14165551234',
                      ),
                    ),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Password'),
                  ),
                  const SizedBox(height: 20),
                  GtGreenButton(
                    label: _busy
                        ? 'Please wait…'
                        : (_registerMode ? 'Register' : 'Sign in'),
                    onPressed: _busy ? null : _submitRegisterOrLogin,
                  ),
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () =>
                            setState(() => _registerMode = !_registerMode),
                    child: Text(
                      _registerMode
                          ? 'Already have an account? Sign in'
                          : 'Need an account? Register',
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
