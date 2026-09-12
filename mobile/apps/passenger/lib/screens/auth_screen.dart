import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

enum _AuthStep {
  methods,
  email,
  register,
  phone,
  otp,
  oauthLocal,
  oauthPhone,
}

enum _OtpOrigin { phone, register, oauthPhone, email }

/// Passenger auth — mirrors web-passenger AuthModal (Google / Apple / email / phone).
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

  _AuthStep _step = _AuthStep.methods;
  String _oauthProvider = 'google';
  bool _busy = false;
  String? _challengeId;
  String? _linkToken;
  String? _error;
  String? _debugHint;
  OAuthConfig? _oauthConfig;
  bool _oauthConfigLoading = true;
  String? _oauthConfigError;

  _OtpOrigin _otpOrigin = _OtpOrigin.phone;
  String _otpPurpose = 'login';
  GtOtpStatus _otpStatus = GtOtpStatus.idle;
  String? _otpMessage;
  String? _resendNotice;
  bool _verifiedFlash = false;
  int _resendLeft = _resendSeconds;
  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadOAuthConfig());
  }

  Future<void> _loadOAuthConfig() async {
    if (!mounted) return;
    setState(() {
      _oauthConfigLoading = true;
      _oauthConfigError = null;
    });
    try {
      final cfg = await context.read<AppState>().loadOAuthConfig();
      if (!mounted) return;
      setState(() {
        _oauthConfig = cfg;
        _oauthConfigLoading = false;
        _oauthConfigError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _oauthConfig = null;
        _oauthConfigLoading = false;
        _oauthConfigError = e.toString();
      });
    }
  }

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

  void _goMethods() {
    _resendTimer?.cancel();
    setState(() {
      _step = _AuthStep.methods;
      _error = null;
      _otp.clear();
      _challengeId = null;
      _debugHint = null;
      _linkToken = null;
      _otpStatus = GtOtpStatus.idle;
      _otpMessage = null;
      _resendNotice = null;
      _verifiedFlash = false;
    });
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

  void _enterOtp({
    required String challengeId,
    String? debugCode,
    required _OtpOrigin origin,
    required String purpose,
  }) {
    setState(() {
      _challengeId = challengeId;
      _debugHint = debugCode;
      _otpOrigin = origin;
      _otpPurpose = purpose;
      _otp.clear();
      _otpStatus = GtOtpStatus.idle;
      _otpMessage = null;
      _resendNotice = null;
      _verifiedFlash = false;
      _error = null;
      _step = _AuthStep.otp;
    });
    _startResendTimer();
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await fn();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _finishAuthed() {
    if (!mounted) return;
    context.go('/');
  }

  Future<void> _handleOAuthResult(OAuthResult result) async {
    if (result.requiresPhoneLink) {
      setState(() {
        _linkToken = result.linkToken;
        _step = _AuthStep.oauthPhone;
      });
      return;
    }
    _finishAuthed();
  }

  Future<void> _onGoogle() async {
    await _run(() async {
      if (_oauthConfigLoading) {
        throw Exception('Still loading sign-in options — try again in a moment.');
      }
      if (_oauthConfigError != null) {
        throw Exception(
          'Could not reach the server for Google sign-in. Check your connection and try again.',
        );
      }
      final cfg = _oauthConfig?.google;
      if (cfg == null || !cfg.enabled) {
        throw Exception('Google sign-in is not available right now.');
      }

      // Local Nest mock: collect email/name without a real Google ID token.
      if (cfg.localMock) {
        setState(() {
          _oauthProvider = 'google';
          _step = _AuthStep.oauthLocal;
        });
        return;
      }

      final clientId = cfg.clientId?.trim();
      if (clientId == null || clientId.isEmpty) {
        throw Exception('Google sign-in is not configured on the server.');
      }

      final app = context.read<AppState>();
      final signIn = GoogleSignIn.instance;
      await signIn.initialize(serverClientId: clientId);
      if (!signIn.supportsAuthenticate()) {
        throw Exception('Google sign-in is not supported on this device.');
      }

      final account = await signIn.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw Exception(
          'Google did not return an ID token. Register an Android OAuth client '
          'for com.gettransfer.passenger with this app’s SHA-1.',
        );
      }

      final result = await app.oauthGoogle(
        idToken: idToken,
        email: account.email,
        fullName: account.displayName,
      );
      await _handleOAuthResult(result);
    });
  }

  Future<void> _onApple() async {
    await _run(() async {
      if (_oauthConfigLoading) {
        throw Exception('Still loading sign-in options — try again in a moment.');
      }
      if (_oauthConfigError != null) {
        throw Exception(
          'Could not reach the server for Apple sign-in. Check your connection and try again.',
        );
      }
      final cfg = _oauthConfig?.apple;
      if (cfg == null || !cfg.enabled) {
        throw Exception('Apple sign-in is not available right now.');
      }
      setState(() {
        _oauthProvider = 'apple';
        _step = _AuthStep.oauthLocal;
      });
    });
  }

  Future<void> _onOAuthLocal() async {
    await _run(() async {
      final app = context.read<AppState>();
      final result = _oauthProvider == 'google'
          ? await app.oauthGoogle(
              email: _email.text.trim(),
              fullName: _name.text.trim().isEmpty ? null : _name.text.trim(),
            )
          : await app.oauthApple(
              email: _email.text.trim(),
              fullName: _name.text.trim().isEmpty ? null : _name.text.trim(),
            );
      await _handleOAuthResult(result);
    });
  }

  Future<void> _onEmailLogin() async {
    await _run(() async {
      final app = context.read<AppState>();
      try {
        await app.login(
          email: _email.text.trim(),
          password: _password.text,
        );
        _finishAuthed();
      } on ApiException catch (err) {
        if (err.code == 'PHONE_NOT_VERIFIED') {
          final body = err.flatBody;
          final cid = body['challengeId'];
          if (cid is String && cid.isNotEmpty) {
            _enterOtp(
              challengeId: cid,
              debugCode: body['debugCode']?.toString(),
              origin: _OtpOrigin.email,
              purpose: 'verify_phone',
            );
            return;
          }
        }
        rethrow;
      }
    });
  }

  Future<void> _onRegister() async {
    await _run(() async {
      final app = context.read<AppState>();
      final res = await app.register(
        email: _email.text.trim(),
        password: _password.text,
        phoneE164: _phone.text.trim(),
        fullName: _name.text.trim().isEmpty ? null : _name.text.trim(),
      );
      final cid = res['challengeId'] as String?;
      if (cid == null || cid.isEmpty) {
        throw Exception('Could not start phone verification.');
      }
      _enterOtp(
        challengeId: cid,
        debugCode: res['debugCode']?.toString(),
        origin: _OtpOrigin.register,
        purpose: 'verify_phone',
      );
    });
  }

  Future<void> _onPhone() async {
    await _run(() async {
      final app = context.read<AppState>();
      final res = await app.sendPhoneOtp(_phone.text.trim());
      final cid = res['challengeId'] as String?;
      if (cid == null || cid.isEmpty) {
        throw Exception(
          'Could not send a code. Check the number and try again.',
        );
      }
      _enterOtp(
        challengeId: cid,
        debugCode: res['debugCode']?.toString(),
        origin: _OtpOrigin.phone,
        purpose: 'login',
      );
    });
  }

  Future<void> _onOAuthPhone() async {
    final token = _linkToken;
    if (token == null) return;
    await _run(() async {
      final app = context.read<AppState>();
      final res = await app.linkOAuthPhone(
        linkToken: token,
        phoneE164: _phone.text.trim(),
      );
      final cid = res['challengeId'] as String?;
      if (cid == null || cid.isEmpty) {
        throw Exception('Could not send a code. Check the number and try again.');
      }
      _enterOtp(
        challengeId: cid,
        debugCode: res['debugCode']?.toString(),
        origin: _OtpOrigin.oauthPhone,
        purpose: 'verify_phone',
      );
    });
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
      await context.read<AppState>().verifyOtp(
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
      _finishAuthed();
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
      final app = context.read<AppState>();
      late Map<String, dynamic> res;
      if (_otpOrigin == _OtpOrigin.oauthPhone) {
        final token = _linkToken;
        if (token == null) throw Exception('Session expired. Go back and try again.');
        res = await app.linkOAuthPhone(
          linkToken: token,
          phoneE164: _phone.text.trim(),
        );
      } else {
        res = await app.sendPhoneOtp(
          _phone.text.trim(),
          purpose: _otpPurpose,
        );
      }
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
      _otp.clear();
      _challengeId = null;
      _debugHint = null;
      _otpStatus = GtOtpStatus.idle;
      _otpMessage = null;
      _resendNotice = null;
      _verifiedFlash = false;
      _error = null;
      switch (_otpOrigin) {
        case _OtpOrigin.register:
          _step = _AuthStep.register;
        case _OtpOrigin.oauthPhone:
          _step = _AuthStep.oauthPhone;
        case _OtpOrigin.email:
          _step = _AuthStep.email;
        case _OtpOrigin.phone:
          _step = _AuthStep.phone;
      }
    });
  }

  String get _title {
    switch (_step) {
      case _AuthStep.methods:
        return 'Log in or sign up';
      case _AuthStep.email:
        return 'Continue with email';
      case _AuthStep.register:
        return 'Create account';
      case _AuthStep.phone:
        return 'Continue with phone';
      case _AuthStep.oauthLocal:
        return _oauthProvider == 'google'
            ? 'Continue with Google'
            : 'Continue with Apple';
      case _AuthStep.oauthPhone:
        return 'Add your phone';
      case _AuthStep.otp:
        return 'Verify your phone';
    }
  }

  String _formatCountdown(int s) {
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final sec = (s % 60).toString().padLeft(2, '0');
    return '$m:$sec';
  }

  @override
  Widget build(BuildContext context) {
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
                  padding: EdgeInsets.only(bottom: 20),
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
                if (_step != _AuthStep.otp)
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _title,
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w800,
                            color: GtColors.text,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close',
                        onPressed: () {
                          if (context.canPop()) {
                            context.pop();
                          } else {
                            context.go('/');
                          }
                        },
                        icon: const Icon(
                          Icons.close,
                          color: GtColors.textSecondary,
                        ),
                      ),
                    ],
                  )
                else
                  Row(
                    children: [
                      IconButton(
                        tooltip: 'Back',
                        onPressed: _busy ? null : _onChangeNumber,
                        icon: const Icon(Icons.arrow_back_rounded),
                      ),
                      const Spacer(),
                      IconButton(
                        tooltip: 'Close',
                        onPressed: () {
                          if (context.canPop()) {
                            context.pop();
                          } else {
                            context.go('/');
                          }
                        },
                        icon: const Icon(
                          Icons.close,
                          color: GtColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                const SizedBox(height: 8),
                if (_error != null && _step != _AuthStep.otp)
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
                if (_step == _AuthStep.methods) ..._methods(),
                if (_step == _AuthStep.email) ..._emailForm(),
                if (_step == _AuthStep.register) ..._registerForm(),
                if (_step == _AuthStep.phone) ..._phoneForm(),
                if (_step == _AuthStep.oauthLocal) ..._oauthLocalForm(),
                if (_step == _AuthStep.oauthPhone) ..._oauthPhoneForm(),
                if (_step == _AuthStep.otp) ..._otpForm(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _methods() {
    return [
      _AuthMethodButton(
        icon: const _GoogleMark(),
        label: 'Continue with Google',
        onPressed: _busy ? null : _onGoogle,
      ),
      const SizedBox(height: 10),
      _AuthMethodButton(
        icon: const Icon(Icons.apple, size: 22, color: GtColors.text),
        label: 'Continue with Apple',
        onPressed: _busy ? null : _onApple,
      ),
      const SizedBox(height: 18),
      _AuthMethodButton(
        icon: const Text(
          '@',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: GtColors.text,
          ),
        ),
        label: 'Continue with email',
        onPressed: _busy
            ? null
            : () => setState(() {
                  _step = _AuthStep.email;
                  _error = null;
                }),
      ),
      const SizedBox(height: 10),
      _AuthMethodButton(
        icon: const Icon(Icons.smartphone_outlined, color: GtColors.text),
        label: 'Continue with phone',
        onPressed: _busy
            ? null
            : () => setState(() {
                  _step = _AuthStep.phone;
                  _error = null;
                }),
      ),
      const SizedBox(height: 24),
      const Text(
        'By registering, you agree to the CAN-RIDE Privacy Policy, as well as the CAN-RIDE Service Agreement.',
        style: TextStyle(
          fontSize: 12,
          height: 1.45,
          color: GtColors.textMuted,
        ),
      ),
    ];
  }

  List<Widget> _emailForm() {
    return [
      TextField(
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.email],
        decoration: const InputDecoration(labelText: 'Email'),
      ),
      TextField(
        controller: _password,
        obscureText: true,
        autofillHints: const [AutofillHints.password],
        decoration: const InputDecoration(labelText: 'Password'),
      ),
      const SizedBox(height: 20),
      GtGreenButton(
        label: _busy ? 'Please wait…' : 'Sign in',
        onPressed: _busy ? null : _onEmailLogin,
      ),
      TextButton(
        onPressed: _busy
            ? null
            : () => setState(() {
                  _step = _AuthStep.register;
                  _error = null;
                }),
        child: const Text('Need an account? Register'),
      ),
      TextButton(
        onPressed: _busy ? null : _goMethods,
        child: const Text('Back'),
      ),
    ];
  }

  List<Widget> _registerForm() {
    return [
      TextField(
        controller: _name,
        autofillHints: const [AutofillHints.name],
        decoration: const InputDecoration(labelText: 'Full name'),
      ),
      TextField(
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.email],
        decoration: const InputDecoration(labelText: 'Email'),
      ),
      TextField(
        controller: _phone,
        keyboardType: TextInputType.phone,
        autofillHints: const [AutofillHints.telephoneNumber],
        decoration: const InputDecoration(
          labelText: 'Phone (E.164)',
          hintText: '+14165551234',
        ),
      ),
      TextField(
        controller: _password,
        obscureText: true,
        autofillHints: const [AutofillHints.newPassword],
        decoration: const InputDecoration(
          labelText: 'Password',
          hintText: '8+ characters',
        ),
      ),
      const SizedBox(height: 20),
      GtGreenButton(
        label: _busy ? 'Please wait…' : 'Create account',
        onPressed: _busy ? null : _onRegister,
      ),
      TextButton(
        onPressed: _busy
            ? null
            : () => setState(() {
                  _step = _AuthStep.email;
                  _error = null;
                }),
        child: const Text('Back'),
      ),
    ];
  }

  List<Widget> _phoneForm() {
    return [
      const Text(
        'We\'ll text a code to sign in or create your account.',
        style: TextStyle(color: GtColors.textSecondary),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _phone,
        keyboardType: TextInputType.phone,
        autofillHints: const [AutofillHints.telephoneNumber],
        decoration: const InputDecoration(
          labelText: 'Phone (E.164)',
          hintText: '+14165551234',
        ),
      ),
      const SizedBox(height: 20),
      GtGreenButton(
        label: _busy ? 'Please wait…' : 'Send code',
        onPressed: _busy ? null : _onPhone,
      ),
      TextButton(
        onPressed: _busy ? null : _goMethods,
        child: const Text('Back'),
      ),
    ];
  }

  List<Widget> _oauthLocalForm() {
    final label = _oauthProvider == 'google' ? 'Google' : 'Apple';
    return [
      Text(
        'Local/dev $label sign-in. Configure OAuth client IDs for production.',
        style: const TextStyle(color: GtColors.textSecondary),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _name,
        autofillHints: const [AutofillHints.name],
        decoration: const InputDecoration(labelText: 'Full name'),
      ),
      TextField(
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.email],
        decoration: const InputDecoration(labelText: 'Email'),
      ),
      const SizedBox(height: 20),
      GtGreenButton(
        label: _busy ? 'Please wait…' : 'Continue',
        onPressed: _busy ? null : _onOAuthLocal,
      ),
      TextButton(
        onPressed: _busy ? null : _goMethods,
        child: const Text('Back'),
      ),
    ];
  }

  List<Widget> _oauthPhoneForm() {
    return [
      const Text(
        'Passengers need a verified phone number to book rides.',
        style: TextStyle(color: GtColors.textSecondary),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _phone,
        keyboardType: TextInputType.phone,
        autofillHints: const [AutofillHints.telephoneNumber],
        decoration: const InputDecoration(
          labelText: 'Phone (E.164)',
          hintText: '+14165551234',
        ),
      ),
      const SizedBox(height: 20),
      GtGreenButton(
        label: _busy ? 'Please wait…' : 'Send code',
        onPressed: _busy ? null : _onOAuthPhone,
      ),
      TextButton(
        onPressed: _busy ? null : _goMethods,
        child: const Text('Back'),
      ),
    ];
  }

  List<Widget> _otpForm() {
    final complete = _otp.text.replaceAll(RegExp(r'\D'), '').length == _otpLength;
    return [
      const SizedBox(height: 8),
      const GtOtpHeader(
        title: 'Verify your phone',
        subtitle: 'Enter the 6-digit code sent to',
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
              color: GtColors.text,
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
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFFFFFBEB),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFC9B07A), style: BorderStyle.solid),
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
        onCompleted: (code) => _onVerify(code),
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
        style: TextStyle(fontSize: 13.5, color: GtColors.textSecondary),
      ),
      const SizedBox(height: 4),
      if (_resendLeft > 0)
        Text(
          'Resend code in ${_formatCountdown(_resendLeft)}',
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: GtColors.text,
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
        onPressed: (!_busy && complete && !_verifiedFlash) ? _onVerify : null,
      ),
      const SizedBox(height: 16),
      const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lock_outline, size: 14, color: GtColors.textMuted),
          SizedBox(width: 6),
          Flexible(
            child: Text(
              'Secure verification · Your information is protected',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: GtColors.textMuted),
            ),
          ),
        ],
      ),
    ];
  }
}

class _AuthMethodButton extends StatelessWidget {
  const _AuthMethodButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final Widget icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: GtColors.text,
          side: const BorderSide(color: GtColors.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
        ),
        child: Row(
          children: [
            SizedBox(width: 28, child: Center(child: icon)),
            Expanded(
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 28),
          ],
        ),
      ),
    );
  }
}

class _GoogleMark extends StatelessWidget {
  const _GoogleMark();

  @override
  Widget build(BuildContext context) {
    return const Text(
      'G',
      style: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w800,
        color: Color(0xFFEA4335),
      ),
    );
  }
}
