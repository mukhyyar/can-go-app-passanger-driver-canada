import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/screens/wallet_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:driver/utils/error_utils.dart';

class MockWalletTestAppState extends AppState {
  Map<String, dynamic> mockWallet = {};
  List<Map<String, dynamic>> mockEntries = [];
  bool refreshCalled = false;

  MockWalletTestAppState() {
    isAuthenticated = true;
    isActivated = true;
    approvalStatus = 'APPROVED';
  }

  @override
  Future<Map<String, dynamic>> loadWallet() async {
    refreshCalled = true;
    return mockWallet;
  }

  @override
  Future<List<Map<String, dynamic>>> loadWalletEntries({String? cursor}) async {
    return mockEntries;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('cleanErrorMessage & formatStatus Tests', () {
    test('formats raw DRIVER_NOT_ELIGIBLE in error messages', () {
      final err = ApiException(400, 'DRIVER_NOT_ELIGIBLE');
      expect(cleanErrorMessage(err), 'Driver Not Eligible');
    });

    test('extracts dispute explanation when driver is not eligible with open disputes', () {
      final err = ApiException(
        400,
        'Payouts are temporarily on hold because you have 2 open disputes under review. Please resolve open disputes to withdraw funds.',
        body: {
          'code': 'DRIVER_NOT_ELIGIBLE',
          'subReason': 'OPEN_DISPUTES',
          'openDisputesCount': 2,
          'message':
              'Payouts are temporarily on hold because you have 2 open disputes under review. Please resolve open disputes to withdraw funds.',
        },
      );
      expect(
        cleanErrorMessage(err),
        'Payouts are temporarily on hold because you have 2 open disputes under review. Please resolve open disputes to withdraw funds.',
      );
    });

    test('replaces embedded status codes with human-readable text', () {
      final err = ApiException(400, 'Cannot proceed: status is WAITING_FOR_OFFERS');
      expect(
        cleanErrorMessage(err),
        'Cannot proceed: status is Waiting For Offers',
      );
    });
  });

  group('WalletScreen Withdrawal Eligibility & Dispute UX', () {
    testWidgets(
        'displays formatted Driver Not Eligible notice with dispute count and explanation',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = MockWalletTestAppState();
      state.mockWallet = {
        'currency': 'CAD',
        'available': '150.00',
        'pending': '0.00',
        'balance': '150.00',
        'minimumWithdrawal': '20.00',
        'canWithdraw': false,
        'cannotWithdrawReason': 'DRIVER_NOT_ELIGIBLE',
        'cannotWithdrawFormattedReason': 'Driver Not Eligible',
        'cannotWithdrawMessage':
            'Payouts are temporarily on hold because you have 2 open disputes under review. Please resolve open disputes to withdraw funds.',
        'cannotWithdrawDetails': {
          'code': 'DRIVER_NOT_ELIGIBLE',
          'formattedReason': 'Driver Not Eligible',
          'message':
              'Payouts are temporarily on hold because you have 2 open disputes under review. Please resolve open disputes to withdraw funds.',
          'subReason': 'OPEN_DISPUTES',
          'openDisputesCount': 2,
        },
      };

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: MaterialApp.router(
            routerConfig: GoRouter(
              routes: [
                GoRoute(path: '/', builder: (_, __) => const WalletScreen()),
                GoRoute(
                    path: '/chats',
                    builder: (_, __) => const Scaffold(body: Text('Chats Screen'))),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 1. Formatted title instead of raw DRIVER_NOT_ELIGIBLE
      expect(find.text('Driver Not Eligible'), findsOneWidget);
      expect(find.text('DRIVER_NOT_ELIGIBLE'), findsNothing);

      // 2. Dispute badge and count
      expect(find.text('2 Open Disputes'), findsOneWidget);

      // 3. Clear explanation of why withdrawal cannot be processed
      expect(
        find.text(
          'Payouts are temporarily on hold because you have 2 open disputes under review. Please resolve open disputes to withdraw funds.',
        ),
        findsOneWidget,
      );

      // 4. Action buttons: Contact Support and Check Again
      expect(find.text('Contact Support'), findsOneWidget);
      expect(find.text('Check Again'), findsOneWidget);

      // 5. Tapping Check Again calls loadWallet
      state.refreshCalled = false;
      await tester.tap(find.text('Check Again'));
      await tester.pumpAndSettle();
      expect(state.refreshCalled, isTrue);

      // 6. Tapping Contact Support navigates to /chats
      await tester.tap(find.text('Contact Support'));
      await tester.pumpAndSettle();
      expect(find.text('Chats Screen'), findsOneWidget);
    });

    testWidgets(
        'displays formatted Payout Method Required notice when payout method is missing',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = MockWalletTestAppState();
      state.mockWallet = {
        'currency': 'CAD',
        'available': '100.00',
        'pending': '0.00',
        'balance': '100.00',
        'minimumWithdrawal': '20.00',
        'canWithdraw': false,
        'cannotWithdrawReason': 'PAYOUT_METHOD_REQUIRED',
        'cannotWithdrawFormattedReason': 'Payout Method Required',
        'cannotWithdrawMessage':
            'Complete Stripe Connect onboarding before withdrawing',
      };

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: MaterialApp.router(
            routerConfig: GoRouter(
              routes: [
                GoRoute(path: '/', builder: (_, __) => const WalletScreen()),
                GoRoute(
                  path: '/onboarding/payment',
                  builder: (_, __) =>
                      const Scaffold(body: Text('Payment Setup Screen')),
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Formatted status title
      expect(find.text('Payout Method Required'), findsOneWidget);
      expect(find.text('PAYOUT_METHOD_REQUIRED'), findsNothing);

      // Button to open payment details
      expect(find.text('Open Payment Details'), findsOneWidget);
      await tester.tap(find.text('Open Payment Details'));
      await tester.pumpAndSettle();
      expect(find.text('Payment Setup Screen'), findsOneWidget);
    });
  });
}
