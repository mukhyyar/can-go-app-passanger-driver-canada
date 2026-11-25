import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('BadgeHelper', () {
    test('updateBadge handles 0 and positive counts without throwing', () async {
      // In widget test environment, native channel is not implemented,
      // so BadgeHelper catches platform exception gracefully.
      await expectLater(BadgeHelper.updateBadge(0), completes);
      await expectLater(BadgeHelper.updateBadge(5), completes);
      await expectLater(BadgeHelper.updateBadge(-2), completes);
    });

    test('clearBadge completes without throwing', () async {
      await expectLater(BadgeHelper.clearBadge(), completes);
    });
  });
}
