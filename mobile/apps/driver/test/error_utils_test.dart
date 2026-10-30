import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:driver/utils/error_utils.dart';

void main() {
  group('cleanErrorMessage', () {
    test('cleans ApiException with message', () {
      final e = ApiException(400, 'Pickup time cannot be in the past');
      expect(cleanErrorMessage(e), 'Pickup time cannot be in the past');
    });

    test('cleans ApiException without message based on status code', () {
      expect(
        cleanErrorMessage(ApiException(400, '')),
        'Invalid request. Please check your details and try again.',
      );
      expect(
        cleanErrorMessage(ApiException(401, '')),
        'Session expired. Please sign in again.',
      );
      expect(
        cleanErrorMessage(ApiException(403, '')),
        'You do not have permission to perform this action.',
      );
      expect(
        cleanErrorMessage(ApiException(404, '')),
        'The requested resource was not found.',
      );
      expect(
        cleanErrorMessage(ApiException(409, '')),
        'This request was already updated or is in conflict.',
      );
      expect(
        cleanErrorMessage(ApiException(500, '')),
        'Server error. Please try again later.',
      );
    });

    test('cleans raw string with ApiException(400): prefix', () {
      const raw = 'ApiException(400): Start PIN is invalid or expired';
      expect(cleanErrorMessage(raw), 'Start PIN is invalid or expired');
    });

    test('cleans nested Exception: ApiException(403): prefix', () {
      const raw = 'Exception: ApiException(403): Only ride participants can rate';
      expect(cleanErrorMessage(raw), 'Only ride participants can rate');
    });

    test('cleans malformed prefix like 400): message', () {
      const raw = '400): Offer already accepted by another driver';
      expect(cleanErrorMessage(raw), 'Offer already accepted by another driver');
    });

    test('cleans SocketException and network errors into friendly message', () {
      final socketErr = const SocketException('Failed host lookup: can-rides.ca');
      expect(
        cleanErrorMessage(socketErr),
        'Network connection issue. Please check your internet and try again.',
      );
    });

    test('cleans generic Exception into message without Exception: prefix', () {
      final e = Exception('Something went wrong during trip completion');
      expect(
        cleanErrorMessage(e),
        'Something went wrong during trip completion',
      );
    });

    test('returns fallback for null or empty errors', () {
      expect(cleanErrorMessage(null), 'An unexpected error occurred');
      expect(cleanErrorMessage(''), 'An unexpected error occurred');
      expect(
        cleanErrorMessage('', fallback: 'Custom fallback'),
        'Custom fallback',
      );
    });

    test('replaces illegal transition IN_PROGRESS with human friendly message', () {
      const err = 'Illegal transition IN_PROGRESS -> TRIP_STARTED for this actor';
      expect(cleanErrorMessage(err), 'This trip is already in progress.');
    });

    test('humanizes raw enum status values in general error messages', () {
      const err = 'Ride cannot be cancelled while DRIVER_ARRIVED';
      expect(cleanErrorMessage(err), 'Ride cannot be cancelled while Driver arrived');
    });
  });
}
