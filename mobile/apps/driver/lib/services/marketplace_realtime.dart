import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:gt_api/gt_api.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// Live marketplace feed for drivers (`/tracking` namespace).
///
/// Listens for `marketplace.request` and invokes [onNewRequest] so the UI
/// can refresh open requests immediately without a manual pull.
class MarketplaceRealtime {
  MarketplaceRealtime({
    required this.session,
    required this.onNewRequest,
    this.onRideStatusChanged,
    this.onRideEvent,
  });

  final CanGoSession session;
  final void Function(Map<String, dynamic> payload) onNewRequest;
  final void Function(Map<String, dynamic> payload)? onRideStatusChanged;
  final void Function(Map<String, dynamic> payload)? onRideEvent;

  io.Socket? _socket;
  bool _connecting = false;
  final Set<String> _subscribedRides = <String>{};

  static String socketOriginFromApiBase(String apiBase) {
    final uri = Uri.parse(apiBase);
    final origin = uri.hasPort
        ? '${uri.scheme}://${uri.host}:${uri.port}'
        : '${uri.scheme}://${uri.host}';
    return origin;
  }

  void subscribeRide(String rideId) {
    if (rideId.isEmpty) return;
    _subscribedRides.add(rideId);
    final socket = _socket;
    if (socket != null && socket.connected) {
      socket.emit('ride.subscribe', {'rideId': rideId});
    }
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
        socket.emit('driver.subscribe');
        for (final rideId in _subscribedRides) {
          socket.emit('ride.subscribe', {'rideId': rideId});
        }
      });

      socket.on('marketplace.request', (data) {
        if (data is Map) {
          onNewRequest(Map<String, dynamic>.from(data));
        } else {
          onNewRequest(const <String, dynamic>{});
        }
      });

      void handleStatusChange(dynamic data) {
        if (data is Map) {
          onRideStatusChanged?.call(Map<String, dynamic>.from(data));
        } else {
          onRideStatusChanged?.call(const <String, dynamic>{});
        }
      }

      socket.on('ride.status.changed', handleStatusChange);
      socket.on('ride.booked', handleStatusChange);

      socket.on('ride.event', (data) {
        if (data is Map) {
          onRideEvent?.call(Map<String, dynamic>.from(data));
        } else {
          onRideEvent?.call(const <String, dynamic>{});
        }
      });

      socket.onDisconnect((_) {
        debugPrint('MarketplaceRealtime disconnected');
      });

      socket.onConnectError((err) {
        debugPrint('MarketplaceRealtime connect error: $err');
      });

      _socket = socket;
      socket.connect();
    } catch (e) {
      debugPrint('MarketplaceRealtime connect failed: $e');
    } finally {
      _connecting = false;
    }
  }

  void disconnect() {
    final socket = _socket;
    _socket = null;
    _connecting = false;
    if (socket == null) return;
    try {
      socket.dispose();
    } catch (_) {
      socket.disconnect();
    }
  }
}
