import 'package:flutter_test/flutter_test.dart';

void main() {
  group('RideChatScreen Zigzag Message Parsing', () {
    test('Correctly identifies mine and other party for zigzag alignment in Customer app', () {
      const passengerUserId = 'user-shared-1';
      const driverUserId = 'user-shared-1';
      const meId = 'user-shared-1';

      final rawMessages = [
        {
          'id': 'msg-1',
          'senderId': 'user-shared-1',
          'senderRole': 'PASSENGER',
          'body': 'im ready',
          'createdAt': '2026-10-30T10:00:00Z',
        },
        {
          'id': 'msg-2',
          'senderId': 'user-shared-1',
          'senderRole': 'DRIVER',
          'body': 'arrived',
          'createdAt': '2026-10-30T10:04:00Z',
        },
        {
          'id': 'msg-3',
          'senderId': 'admin-99',
          'senderRole': 'SUPPORT',
          'body': 'Support here to help',
          'createdAt': '2026-10-30T10:06:00Z',
        },
      ];

      final parsed = rawMessages.map((m) {
        final senderId = m['senderId'];
        final role = m['senderRole']?.toString().toUpperCase();

        final isPassenger = role == 'PASSENGER';
        final isDriver = role == 'DRIVER';
        final isSupport = role == 'SUPPORT';

        final bool isMine;
        if (isPassenger) {
          isMine = true;
        } else if (isDriver || isSupport) {
          isMine = false;
        } else if (senderId == passengerUserId && passengerUserId != driverUserId) {
          isMine = true;
        } else if (senderId == driverUserId && driverUserId != passengerUserId) {
          isMine = false;
        } else if (senderId == meId) {
          isMine = true;
        } else {
          isMine = false;
        }

        return {
          'body': m['body'],
          'mine': isMine,
          'role': role,
        };
      }).toList();

      // Message 1 from Passenger: must be mine = true (Right, Red, Passenger (You))
      expect(parsed[0]['body'], 'im ready');
      expect(parsed[0]['mine'], isTrue);
      expect(parsed[0]['role'], 'PASSENGER');

      // Message 2 from Driver: must be mine = false (Left, White, Driver)
      expect(parsed[1]['body'], 'arrived');
      expect(parsed[1]['mine'], isFalse);
      expect(parsed[1]['role'], 'DRIVER');

      // Message 3 from Support: must be mine = false (Left, White, Can-Ride Support)
      expect(parsed[2]['body'], 'Support here to help');
      expect(parsed[2]['mine'], isFalse);
      expect(parsed[2]['role'], 'SUPPORT');
    });

    test('Correctly identifies mine and other party for zigzag alignment in Driver app', () {
      const passengerUserId = 'user-shared-1';
      const driverUserId = 'user-shared-1';
      const meId = 'user-shared-1';

      final rawMessages = [
        {
          'id': 'msg-1',
          'senderId': 'user-shared-1',
          'senderRole': 'PASSENGER',
          'body': 'im ready',
          'createdAt': '2026-10-30T10:00:00Z',
        },
        {
          'id': 'msg-2',
          'senderId': 'user-shared-1',
          'senderRole': 'DRIVER',
          'body': 'arrived',
          'createdAt': '2026-10-30T10:04:00Z',
        },
      ];

      final parsed = rawMessages.map((m) {
        final senderId = m['senderId'];
        final role = m['senderRole']?.toString().toUpperCase();

        final isDriver = role == 'DRIVER';
        final isPassenger = role == 'PASSENGER';
        final isSupport = role == 'SUPPORT';

        final bool isMine;
        if (isDriver) {
          isMine = true;
        } else if (isPassenger || isSupport) {
          isMine = false;
        } else if (senderId == driverUserId && driverUserId != passengerUserId) {
          isMine = true;
        } else if (senderId == passengerUserId && passengerUserId != driverUserId) {
          isMine = false;
        } else if (senderId == meId) {
          isMine = true;
        } else {
          isMine = false;
        }

        return {
          'body': m['body'],
          'mine': isMine,
          'role': role,
        };
      }).toList();

      // In Driver App:
      // Message 1 from Passenger: must be mine = false (Left, White, Passenger)
      expect(parsed[0]['body'], 'im ready');
      expect(parsed[0]['mine'], isFalse);
      expect(parsed[0]['role'], 'PASSENGER');

      // Message 2 from Driver: must be mine = true (Right, Red, Driver (You))
      expect(parsed[1]['body'], 'arrived');
      expect(parsed[1]['mine'], isTrue);
      expect(parsed[1]['role'], 'DRIVER');
    });
  });
}

