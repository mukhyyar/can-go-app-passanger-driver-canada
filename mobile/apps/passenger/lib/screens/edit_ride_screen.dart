import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

/// Edit an open marketplace ride (WAITING_FOR_OFFERS / OFFER_SELECTION).
class EditRideScreen extends StatefulWidget {
  const EditRideScreen({super.key, required this.rideId});
  final String rideId;

  @override
  State<EditRideScreen> createState() => _EditRideScreenState();
}

class _EditRideScreenState extends State<EditRideScreen> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String _serviceType = 'RIDE';

  Place? _from;
  Place? _to;
  DateTime _pickupAt = DateTime.now().add(const Duration(hours: 2));
  int _adults = 1;
  final _flight = TextEditingController();
  final _signage = TextEditingController();
  final _comment = TextEditingController();
  List<String> _vehicleClassIds = const ['economy'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _flight.dispose();
    _signage.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final raw = await app.api.marketplace.getRide(widget.rideId);
      final status = (raw['status']?.toString() ?? '').toUpperCase();
      if (status != 'WAITING_FOR_OFFERS' && status != 'OFFER_SELECTION') {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = 'This ride can no longer be edited. Cancel and create a new request instead.';
        });
        return;
      }

      final fromLat = (raw['fromLat'] as num?)?.toDouble() ?? 0;
      final fromLng = (raw['fromLng'] as num?)?.toDouble() ?? 0;
      final toLat = (raw['toLat'] as num?)?.toDouble();
      final toLng = (raw['toLng'] as num?)?.toDouble();
      final pickupRaw = raw['pickupAt']?.toString();
      final pickup = pickupRaw != null ? DateTime.tryParse(pickupRaw) : null;
      final classes = raw['vehicleClassIds'];
      final classIds = classes is List
          ? classes.map((e) => e.toString()).where((e) => e.isNotEmpty).toList()
          : <String>[];

      if (!mounted) return;
      setState(() {
        _loading = false;
        _serviceType = raw['serviceType']?.toString() ?? 'RIDE';
        _from = Place(
          id: 'edit-from',
          label: raw['fromLabel']?.toString() ?? '',
          lat: fromLat,
          lng: fromLng,
        );
        if (toLat != null && toLng != null) {
          _to = Place(
            id: 'edit-to',
            label: raw['toLabel']?.toString() ?? '',
            lat: toLat,
            lng: toLng,
          );
        }
        if (pickup != null) _pickupAt = pickup.toLocal();
        _adults = (raw['adults'] as num?)?.toInt() ?? 1;
        _flight.text = raw['flight']?.toString() ?? '';
        _signage.text = raw['signage']?.toString() ?? '';
        _comment.text = raw['comment']?.toString() ?? '';
        _vehicleClassIds =
            classIds.isNotEmpty ? classIds : const ['economy'];
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  bool get _needsDropoff =>
      _serviceType == 'RIDE' || _serviceType == 'DELIVERY';

  Future<void> _pickPlace(String field) async {
    final app = context.read<AppState>();
    final prevField = app.locationField;
    final prevFrom = app.from;
    final prevTo = app.to;
    app.setLocationField(field);
    if (field == 'to') {
      app.setTo(_to);
    } else {
      app.setFrom(_from);
    }
    await context.push('/location');
    if (!mounted) return;
    setState(() {
      if (field == 'to') {
        _to = app.to ?? _to;
      } else {
        _from = app.from ?? _from;
      }
    });
    app.setLocationField(prevField);
    app.setFrom(prevFrom);
    app.setTo(prevTo);
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _pickupAt,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_pickupAt),
    );
    if (time == null || !mounted) return;
    setState(() {
      _pickupAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  Future<void> _save() async {
    final from = _from;
    if (from == null || from.label.trim().isEmpty || !from.hasCoords) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a pickup location')),
      );
      return;
    }
    if (_needsDropoff &&
        (_to == null || _to!.label.trim().isEmpty || !_to!.hasCoords)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a drop-off location')),
      );
      return;
    }

    setState(() => _saving = true);
    final app = context.read<AppState>();
    try {
      await app.updateRide(
        widget.rideId,
        fromLabel: from.label,
        fromLat: from.lat,
        fromLng: from.lng,
        toLabel: _to?.label,
        toLat: _to?.lat,
        toLng: _to?.lng,
        pickupAt: _pickupAt.toUtc().toIso8601String(),
        vehicleClassIds: _vehicleClassIds,
        adults: _adults,
        flight: _flight.text.trim().isEmpty ? '' : _flight.text.trim(),
        signage: _signage.text.trim().isEmpty ? '' : _signage.text.trim(),
        comment: _comment.text.trim().isEmpty ? '' : _comment.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Ride updated. Drivers will see the new details.'),
        ),
      );
      context.go('/waiting/${widget.rideId}');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Edit ride'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: GtColors.brand),
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, textAlign: TextAlign.center),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    GtCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('From'),
                            subtitle: Text(
                              _from?.label.isNotEmpty == true
                                  ? _from!.label
                                  : 'Tap to choose',
                            ),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => _pickPlace('from'),
                          ),
                          if (_needsDropoff) ...[
                            const Divider(),
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: const Text('To'),
                              subtitle: Text(
                                _to?.label.isNotEmpty == true
                                    ? _to!.label
                                    : 'Tap to choose',
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => _pickPlace('to'),
                            ),
                          ],
                          const Divider(),
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('Pickup time'),
                            subtitle: Text(
                              MaterialLocalizations.of(context)
                                  .formatFullDate(_pickupAt),
                            ),
                            trailing: Text(
                              TimeOfDay.fromDateTime(_pickupAt).format(context),
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            onTap: _pickDateTime,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    GtCard(
                      child: Column(
                        children: [
                          Row(
                            children: [
                              const Expanded(child: Text('Passengers')),
                              IconButton(
                                onPressed: _adults <= 1
                                    ? null
                                    : () => setState(() => _adults--),
                                icon: const Icon(Icons.remove_circle_outline),
                              ),
                              Text(
                                '$_adults',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                              IconButton(
                                onPressed: _adults >= 20
                                    ? null
                                    : () => setState(() => _adults++),
                                icon: const Icon(Icons.add_circle_outline),
                              ),
                            ],
                          ),
                          TextField(
                            controller: _flight,
                            decoration: const InputDecoration(
                              labelText: 'Flight number',
                            ),
                          ),
                          TextField(
                            controller: _signage,
                            decoration: const InputDecoration(
                              labelText: 'Name sign',
                            ),
                          ),
                          TextField(
                            controller: _comment,
                            decoration: const InputDecoration(
                              labelText: 'Comment for driver',
                            ),
                            maxLines: 3,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Changing route, time, or vehicle class withdraws existing offers so drivers can rebid.',
                      style: TextStyle(
                        color: GtColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _saving ? null : _save,
                      style: FilledButton.styleFrom(
                        backgroundColor: GtColors.brand,
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: _saving
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Save changes'),
                    ),
                  ],
                ),
    );
  }
}
