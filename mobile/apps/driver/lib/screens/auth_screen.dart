import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

/// Driver auth — Google / email / phone, matching passenger multi-step flow.
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
  final _credentials = CredentialStore(namespace: 'driver');
  final _biometrics = GtBiometricAuth();

  _AuthStep _step = _AuthStep.methods;
  bool _busy = false;
  String? _challengeId;
  String? _linkToken;
  String? _error;
  String? _debugHint;
  OAuthConfig? _oauthConfig;
  bool _oauthConfigLoading = true;
  String? _oauthConfigError;

  _OtpOrigin _otpOrigin = _OtpOrigin.phone;
  String _otpPurpose = 'verify_phone';
  GtOtpStatus _otpStatus = GtOtpStatus.idle;
  String? _otpMessage;
  String? _resendNotice;
  bool _verifiedFlash = false;
  int _resendLeft = _resendSeconds;
  Timer? _resendTimer;

  bool _rememberMe = true;
  bool _biometricAvailable = false;
  bool _hasSavedCredentials = false;
  String _biometricLabel = 'Sign in with biometrics';
  String? _savedPassword;
  bool _bioAutoPrompted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadOAuthConfig();
      _loadCredentialPrefs();
    });
  }

  Future<void> _loadCredentialPrefs() async {
    final remember = await _credentials.readRememberMe();
    final saved = await _credentials.read();
    final bioOk = await _biometrics.isAvailable();
    final label = await _biometrics.signInLabel();
    if (!mounted) return;
    setState(() {
      _rememberMe = remember;
      _hasSavedCredentials = saved != null;
      _savedPassword = saved?.password;
      _biometricAvailable = bioOk;
      _biometricLabel = label;
      if (saved != null && _email.text.isEmpty) {
        _email.text = saved.email;
      }
    });
  }

  Future<void> _openEmailStep() async {
    setState(() {
      _step = _AuthStep.email;
      _error = null;
      _bioAutoPrompted = false;
    });
    await _prepareEmailCredentials(autoPrompt: true);
  }

  Future<void> _prepareEmailCredentials({required bool autoPrompt}) async {
    final saved = await _credentials.read();
    final bioOk = await _biometrics.isAvailable();
    final label = await _biometrics.signInLabel();
    final remember = await _credentials.readRememberMe();
    if (!mounted) return;
    setState(() {
      _rememberMe = remember;
      _hasSavedCredentials = saved != null;
      _savedPassword = saved?.password;
      _biometricAvailable = bioOk;
      _biometricLabel = label;
      if (saved != null) {
        _email.text = saved.email;
        _password.clear();
      }
    });
    if (autoPrompt &&
        saved != null &&
        bioOk &&
        !_bioAutoPrompted &&
        !_busy) {
      _bioAutoPrompted = true;
      await _onBiometricLogin();
    }
  }

  Future<void> _persistCredentialsAfterLogin() async {
    await _credentials.setRememberMe(_rememberMe);
    if (_rememberMe) {
      await _credentials.save(
        email: _email.text.trim(),
        password: _password.text,
      );
      TextInput.finishAutofillContext(shouldSave: true);
    } else {
      await _credentials.clear();
      TextInput.finishAutofillContext(shouldSave: false);
    }
    if (!mounted) return;
    setState(() {
      _hasSavedCredentials = _rememberMe;
      _savedPassword = _rememberMe ? _password.text : null;
    });
  }

  Future<void> _onBiometricLogin() async {
    if (_busy || !_hasSavedCredentials || _savedPassword == null) return;
    final ok = await _biometrics.authenticate();
    if (!ok || !mounted) return;
    setState(() => _password.text = _savedPassword!);
    await _onEmailLogin();
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
    } on GoogleSignInException catch (e) {
      if (!mounted) return;
      // User dismissed the picker / reauth prompt — not an error to show.
      if (e.code == GoogleSignInExceptionCode.canceled) return;
      setState(() {
        _error = e.description?.isNotEmpty == true
            ? e.description
            : 'Google sign-in failed. Check that an Android OAuth client is '
                'registered for com.canride.driver with this app’s SHA-1.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _finishAuthed() {
    if (!mounted) return;
    final app = context.read<AppState>();
    context.go(app.onboardedComplete ? '/' : '/onboarding/profile');
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
      if (_oauthConfigError != null || _oauthConfig == null) {
        try {
          final cfg = await context.read<AppState>().loadOAuthConfig();
          if (mounted) {
            setState(() {
              _oauthConfig = cfg;
              _oauthConfigError = null;
            });
          }
        } catch (_) {
          throw Exception(
            'Could not reach the server for Google sign-in. Check your connection and try again.',
          );
        }
      }
      final cfg = _oauthConfig?.google;
      if (cfg == null || !cfg.enabled) {
        throw Exception('Google sign-in is not available right now.');
      }

      // Local Nest mock: collect email/name without a real Google ID token.
      if (cfg.localMock) {
        setState(() => _step = _AuthStep.oauthLocal);
        return;
      }

      final clientId = cfg.clientId?.trim();
      if (clientId == null || clientId.isEmpty) {
        throw Exception('Google sign-in is not configured on the server.');
      }

      final app = context.read<AppState>();
      final signIn = GoogleSignIn.instance;
      const iosClientId =
          '400688849973-ba7bgucq57b9pd4uoq0fcinqu9j4bpqh.apps.googleusercontent.com';
      await signIn.initialize(
        clientId: defaultTargetPlatform == TargetPlatform.iOS ? iosClientId : null,
        serverClientId: clientId,
      );
      if (!signIn.supportsAuthenticate()) {
        throw Exception('Google sign-in is not supported on this device.');
      }

      final account = await signIn.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw Exception(
          'Google did not return an ID token. Register an Android OAuth client '
          'for com.canride.driver with this app’s SHA-1.',
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

  Future<void> _onOAuthLocal() async {
    await _run(() async {
      final app = context.read<AppState>();
      final result = await app.oauthGoogle(
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
        await _persistCredentialsAfterLogin();
        _finishAuthed();
      } on ApiException catch (err) {
        if (err.code == 'PHONE_NOT_VERIFIED') {
          final body = err.flatBody;
          final cid = body['challengeId'];
          if (cid is String && cid.isNotEmpty) {
            await _persistCredentialsAfterLogin();
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
      final res = await app.sendPhoneOtp(
        _phone.text.trim(),
        purpose: 'login',
      );
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
        if (token == null) {
          throw Exception('Session expired. Go back and try again.');
        }
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
        return 'Driver sign in';
      case _AuthStep.email:
        return 'Continue with email';
      case _AuthStep.register:
        return 'Create driver account';
      case _AuthStep.phone:
        return 'Continue with phone';
      case _AuthStep.oauthLocal:
        return 'Continue with Google';
      case _AuthStep.oauthPhone:
        return 'Add your phone';
      case _AuthStep.otp:
        return 'Verify your phone';
    }
  }

  String? get _subtitle {
    switch (_step) {
      case _AuthStep.methods:
        return 'CAN-RIDE driver · choose how you’d like to continue';
      case _AuthStep.email:
        return 'Sign in with your email and password';
      case _AuthStep.register:
        return 'We’ll verify your phone to secure your driver account';
      case _AuthStep.phone:
        return 'We’ll text a code to sign in or create your account';
      case _AuthStep.oauthLocal:
        return 'Local/dev Google sign-in. Configure OAuth client IDs for production.';
      case _AuthStep.oauthPhone:
        return 'Drivers need a verified phone number to go online.';
      case _AuthStep.otp:
        return 'Verify your phone to secure your driver account.\nEnter the 6-digit code sent to';
    }
  }

  VoidCallback? get _onBack {
    if (_busy) return null;
    switch (_step) {
      case _AuthStep.methods:
        return null;
      case _AuthStep.email:
      case _AuthStep.phone:
      case _AuthStep.oauthLocal:
      case _AuthStep.oauthPhone:
        return _goMethods;
      case _AuthStep.register:
        return () => setState(() {
              _step = _AuthStep.email;
              _error = null;
            });
      case _AuthStep.otp:
        return _onChangeNumber;
    }
  }

  String _formatCountdown(int s) {
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final sec = (s % 60).toString().padLeft(2, '0');
    return '$m:$sec';
  }

  @override
  Widget build(BuildContext context) {
    return GtAuthShell(
      title: _title,
      subtitle: _subtitle,
      onBack: _onBack,
      footer: _step == _AuthStep.methods
          ? const Text(
              'By registering, you agree to the CAN-RIDE Privacy Policy, as well as the CAN-RIDE Service Agreement.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                height: 1.45,
                color: GtColors.textMuted,
              ),
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null && _step != _AuthStep.otp)
            GtAuthErrorBanner(message: _error!),
          if (_step == _AuthStep.methods) _methods(),
          if (_step == _AuthStep.email) _emailForm(),
          if (_step == _AuthStep.register) _registerForm(),
          if (_step == _AuthStep.phone) _phoneForm(),
          if (_step == _AuthStep.oauthLocal) _oauthLocalForm(),
          if (_step == _AuthStep.oauthPhone) _oauthPhoneForm(),
          if (_step == _AuthStep.otp) _otpForm(),
        ],
      ),
    );
  }

  Widget _methods() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GtAuthMethodButton(
          leading: const _GoogleMark(),
          label: 'Continue with Google',
          emphasized: true,
          onPressed: _busy ? null : _onGoogle,
        ),
        const SizedBox(height: 18),
        GtAuthMethodButton(
          leading: const Text(
            '@',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: GtColors.text,
            ),
          ),
          label: 'Continue with email',
          onPressed: _busy ? null : _openEmailStep,
        ),
        const SizedBox(height: 10),
        GtAuthMethodButton(
          leading: const Icon(Icons.smartphone_outlined, color: GtColors.text),
          label: 'Continue with phone',
          onPressed: _busy
              ? null
              : () => setState(() {
                    _step = _AuthStep.phone;
                    _error = null;
                  }),
        ),
      ],
    );
  }

  Widget _emailForm() {
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email, AutofillHints.username],
            decoration: GtAuthFieldDecoration.of('Email'),
          ),
          const SizedBox(height: 12),
          GtAuthPasswordField(
            controller: _password,
            onSubmitted: (_) => _onEmailLogin(),
          ),
          const SizedBox(height: 8),
          GtAuthRememberMe(
            value: _rememberMe,
            onChanged: (v) => setState(() => _rememberMe = v ?? false),
          ),
          if (_hasSavedCredentials && _biometricAvailable) ...[
            const SizedBox(height: 12),
            GtAuthMethodButton(
              leading: const Icon(
                Icons.fingerprint,
                color: GtColors.text,
              ),
              label: _biometricLabel,
              emphasized: true,
              onPressed: _busy ? null : _onBiometricLogin,
            ),
          ],
          const SizedBox(height: 16),
          GtAuthPrimaryButton(
            label: 'Sign in',
            busy: _busy,
            onPressed: _onEmailLogin,
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
        ],
      ),
    );
  }

  Widget _registerForm() {
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _name,
            autofillHints: const [AutofillHints.name],
            decoration: GtAuthFieldDecoration.of('Full name'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email, AutofillHints.username],
            decoration: GtAuthFieldDecoration.of('Email'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: GtAuthFieldDecoration.of(
              'Phone (E.164)',
              hint: '+14165551234',
            ),
          ),
          const SizedBox(height: 12),
          GtAuthPasswordField(
            controller: _password,
            hint: '8+ characters',
            autofillHints: const [AutofillHints.newPassword],
          ),
          const SizedBox(height: 20),
          GtAuthPrimaryButton(
            label: 'Create account',
            busy: _busy,
            onPressed: _onRegister,
          ),
        ],
      ),
    );
  }

  Widget _phoneForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          decoration: GtAuthFieldDecoration.of(
            'Phone (E.164)',
            hint: '+14165551234',
          ),
        ),
        const SizedBox(height: 20),
        GtAuthPrimaryButton(
          label: 'Send code',
          busy: _busy,
          onPressed: _onPhone,
        ),
      ],
    );
  }

  Widget _oauthLocalForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _name,
          autofillHints: const [AutofillHints.name],
          decoration: GtAuthFieldDecoration.of('Full name'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: GtAuthFieldDecoration.of('Email'),
        ),
        const SizedBox(height: 20),
        GtAuthPrimaryButton(
          label: 'Continue',
          busy: _busy,
          onPressed: _onOAuthLocal,
        ),
      ],
    );
  }

  Widget _oauthPhoneForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          autofillHints: const [AutofillHints.telephoneNumber],
          decoration: GtAuthFieldDecoration.of(
            'Phone (E.164)',
            hint: '+14165551234',
          ),
        ),
        const SizedBox(height: 20),
        GtAuthPrimaryButton(
          label: 'Send code',
          busy: _busy,
          onPressed: _onOAuthPhone,
        ),
      ],
    );
  }

  Widget _otpForm() {
    final complete =
        _otp.text.replaceAll(RegExp(r'\D'), '').length == _otpLength;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
        GtAuthPrimaryButton(
          label: _verifiedFlash ? '✓ Phone verified' : 'Verify & Continue',
          busy: _busy,
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
      ],
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
