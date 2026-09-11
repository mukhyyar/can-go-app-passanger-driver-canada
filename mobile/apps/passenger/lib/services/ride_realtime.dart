import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:gt_api/gt_api.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// Live offer feed for passengers (`/tracking` namespace).
///
/// Listens for `marketplace.offer` (personal room) and `ride.event` (ride rooms)
/// so the UI can refresh offers immediately without waiting for a screen poll.
class RideRealtime {
  RideRealtime({
    required this.session,
    required this.onOfferEvent,
  });

  final CanGoSession session;
  final void Function(Map<String, dynamic> payload) onOfferEvent;

  io.Socket? _socket;
  bool _connecting = false;
  final Set<String> _subscribedRides = {};

  static String socketOriginFromApiBase(String apiBase) {
    final uri = Uri.parse(apiBase);
    final origin = uri.hasPort
        ? '${uri.scheme}://${uri.host}:${uri.port}'
        : '${uri.scheme}://${uri.host}';
    return origin;
  }

  Future<void> connect() async {
    if (_socket != null || _connecting) return;
    _connecting = true;
    try {
      final token = await session.client.tokens.readAccess();
      if (token == null || token.isEmpty) return;

      final origin = socketOriginFromApiBase(session.client.baseUrl);
      final socket = io.io(
        '$origin/tracking',
        io.OptionBuilder()
            .setTransports(['websocket'])
            .disableAutoConnect()
            .setAuth({'token': token})
            .enableReconnection()
            .build(),
      );

      socket.onConnect((_) {
        socket.emit('passenger.subscribe');
        for (final rideId in _subscribedRides) {
          socket.emit('ride.subscribe', {'rideId': rideId});
        }
      });

      void handle(dynamic data) {
        if (data is Map) {
          onOfferEvent(Map<String, dynamic>.from(data));
        } else {
          onOfferEvent(const <String, dynamic>{});
        }
      }

      socket.on('marketplace.offer', handle);
      socket.on('ride.event', handle);
      socket.on('ride.status.changed', handle);

      socket.onDisconnect((_) {
        debugPrint('RideRealtime disconnected');
      });

      socket.onConnectError((err) {
        debugPrint('RideRealtime connect error: $err');
      });

      _socket = socket;
      socket.connect();
    } catch (e) {
      debugPrint('RideRealtime connect failed: $e');
    } finally {
      _connecting = false;
    }
  }

  void subscribeRide(String rideId) {
    if (rideId.isEmpty) return;
    _subscribedRides.add(rideId);
    final socket = _socket;
    if (socket != null && socket.connected) {
      socket.emit('ride.subscribe', {'rideId': rideId});
    }
  }

  void syncRideSubscriptions(Iterable<String> rideIds) {
    final next = rideIds.where((id) => id.isNotEmpty).toSet();
    _subscribedRides
      ..clear()
      ..addAll(next);
    final socket = _socket;
    if (socket == null || !socket.connected) return;
    for (final rideId in next) {
      socket.emit('ride.subscribe', {'rideId': rideId});
    }
  }

  void disconnect() {
    final socket = _socket;
    _socket = null;
    _connecting = false;
    _subscribedRides.clear();
    if (socket == null) return;
    try {
      socket.dispose();
    } catch (_) {
      socket.disconnect();
    }
  }
}
