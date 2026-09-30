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
  bool _isRoundTrip = false;
  DateTime? _returnAt;
  double _hours = 1.0;
  int _adults = 1;
  ChildSeats _childSeats = const ChildSeats();
  List<String> _vehicleClassIds = const ['economy'];

  final _flight = TextEditingController();
  final _returnFlight = TextEditingController();
  final _signage = TextEditingController();
  final _comment = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _flight.dispose();
    _returnFlight.dispose();
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
          _error =
              'This ride can no longer be edited. Cancel and create a new request instead.';
        });
        return;
      }

      final fromLat = (raw['fromLat'] as num?)?.toDouble() ?? 0;
      final fromLng = (raw['fromLng'] as num?)?.toDouble() ?? 0;
      final toLat = (raw['toLat'] as num?)?.toDouble();
      final toLng = (raw['toLng'] as num?)?.toDouble();
      final pickupRaw = raw['pickupAt']?.toString();
      final pickup = pickupRaw != null ? DateTime.tryParse(pickupRaw) : null;
      final returnRaw = raw['returnAt']?.toString();
      final returnDt = returnRaw != null ? DateTime.tryParse(returnRaw) : null;
      final isRoundTrip = raw['isRoundTrip'] == true || returnDt != null;

      final classes = raw['vehicleClassIds'];
      final classIds = classes is List
          ? classes.map((e) => e.toString()).where((e) => e.isNotEmpty).toList()
          : <String>[];

      final seatsRaw = raw['childSeatsJson'];
      ChildSeats childSeats = const ChildSeats();
      if (seatsRaw is Map) {
        childSeats = ChildSeats(
          infant: (seatsRaw['infant'] as num?)?.toInt() ?? 0,
          convertible: (seatsRaw['convertible'] as num?)?.toInt() ??
              (seatsRaw['child'] as num?)?.toInt() ??
              0,
          booster: (seatsRaw['booster'] as num?)?.toInt() ?? 0,
        );
      }

      final snap = raw['priceSnapshot'];
      final hoursVal = snap is Map && snap['hours'] is num
          ? (snap['hours'] as num).toDouble()
          : 1.0;

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
        _isRoundTrip = isRoundTrip;
        if (returnDt != null) {
          _returnAt = returnDt.toLocal();
        } else if (isRoundTrip) {
          _returnAt = _pickupAt.add(const Duration(hours: 3));
        }
        _adults = (raw['adults'] as num?)?.toInt() ?? 1;
        _childSeats = childSeats;
        _flight.text = raw['flight']?.toString() ?? '';
        _returnFlight.text = raw['returnFlight']?.toString() ?? '';
        _signage.text = raw['signage']?.toString() ?? '';
        _comment.text = raw['comment']?.toString() ?? '';
        _vehicleClassIds =
            classIds.isNotEmpty ? classIds : const ['economy'];
        _hours = hoursVal;
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
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
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
      if (_returnAt != null && !_returnAt!.isAfter(_pickupAt)) {
        _returnAt = _pickupAt.add(const Duration(hours: 3));
      }
    });
  }

  Future<void> _pickReturnDateTime() async {
    final start = _pickupAt;
    final initial = _returnAt ?? start.add(const Duration(hours: 3));
    final date = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(start) ? start : initial,
      firstDate: DateTime(start.year, start.month, start.day),
      lastDate: start.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null || !mounted) return;
    var returnDt = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    if (!returnDt.isAfter(start)) {
      returnDt = start.add(const Duration(hours: 2));
    }
    setState(() {
      _returnAt = returnDt;
    });
  }

  Future<void> _openChildSeatsSheet() async {
    var seats = _childSeats;
    await showGtSheet(
      context: context,
      child: StatefulBuilder(
        builder: (context, setModal) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
              16,
              16,
              16,
              16 + MediaQuery.of(context).viewInsets.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Child seats',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 16),
                _seatRow(
                  'Infant carrier',
                  'Up to 10 kg, 6 months',
                  seats.infant,
                  (v) => setModal(() => seats = seats.copyWith(infant: v)),
                ),
                _seatRow(
                  'Convertible seat',
                  '9–25 kg, 0–7 years',
                  seats.convertible,
                  (v) => setModal(() => seats = seats.copyWith(convertible: v)),
                ),
                _seatRow(
                  'Booster seat',
                  '22–36 kg, 6–12 years',
                  seats.booster,
                  (v) => setModal(() => seats = seats.copyWith(booster: v)),
                ),
                const SizedBox(height: 16),
                GtGreenButton(
                  label: 'Done',
                  onPressed: () {
                    setState(() => _childSeats = seats);
                    Navigator.pop(context);
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _seatRow(
    String label,
    String subtitle,
    int value,
    ValueChanged<int> onChanged,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style:
                      const TextStyle(fontSize: 12, color: GtColors.textMuted),
                ),
              ],
            ),
          ),
          GtStepper(value: value, min: 0, max: 5, onChanged: onChanged),
        ],
      ),
    );
  }

  void _toggleVehicleClass(String classId) {
    setState(() {
      final current = List<String>.from(_vehicleClassIds);
      if (current.contains(classId)) {
        if (current.length <= 1) {
          ScaffoldMessenger.of(context).hideCurrentSnackBar();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              behavior: SnackBarBehavior.floating,
              duration: Duration(seconds: 2),
              content: Text('At least one vehicle class must be selected.'),
            ),
          );
          return;
        }
        current.remove(classId);
      } else {
        current.add(classId);
      }
      _vehicleClassIds = current;
    });
  }

  void _appendCommentChip(String text) {
    final current = _comment.text.trim();
    if (current.contains(text)) return;
    setState(() {
      if (current.isEmpty) {
        _comment.text = text;
      } else {
        _comment.text = '$current. $text';
      }
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
    if (_isRoundTrip && _returnAt == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a return pickup date and time')),
      );
      return;
    }
    if (_vehicleClassIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one vehicle class')),
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
        childSeatsJson: _childSeats.toJson(),
        flight: _flight.text.trim().isEmpty ? '' : _flight.text.trim(),
        returnFlight: _isRoundTrip && _returnFlight.text.trim().isNotEmpty
            ? _returnFlight.text.trim()
            : '',
        signage: _signage.text.trim().isEmpty ? '' : _signage.text.trim(),
        comment: _comment.text.trim().isEmpty ? '' : _comment.text.trim(),
        isRoundTrip: _isRoundTrip,
        returnAt: _isRoundTrip && _returnAt != null
            ? _returnAt!.toUtc().toIso8601String()
            : null,
        hours: _serviceType == 'PER_HOUR' ? _hours : null,
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
    final isRide = _serviceType == 'RIDE';
    final isPerHour = _serviceType == 'PER_HOUR';

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
                    // Card 1: Route & Schedule
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
                          if (isPerHour) ...[
                            const Divider(),
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Row(
                                children: [
                                  const Expanded(
                                    child: Text(
                                      'Duration',
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                  SingleChildScrollView(
                                    scrollDirection: Axis.horizontal,
                                    child: Row(
                                      children: [
                                        for (final (h, label) in const [
                                          (0.5, '30m'),
                                          (1.0, '1h'),
                                          (2.0, '2h'),
                                          (3.0, '3h'),
                                          (4.0, '4h'),
                                          (6.0, '6h'),
                                        ])
                                          Padding(
                                            padding: const EdgeInsets.only(left: 6),
                                            child: ChoiceChip(
                                              label: Text(label),
                                              selected: _hours == h,
                                              onSelected: (val) {
                                                if (val) setState(() => _hours = h);
                                              },
                                              selectedColor: GtColors.brand,
                                              labelStyle: TextStyle(
                                                color: _hours == h
                                                    ? Colors.white
                                                    : GtColors.text,
                                                fontWeight: FontWeight.w600,
                                                fontSize: 12,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          if (isRide) ...[
                            const Divider(),
                            SwitchListTile.adaptive(
                              contentPadding: EdgeInsets.zero,
                              title: const Text(
                                'Add return trip',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              value: _isRoundTrip,
                              activeTrackColor: GtColors.brand,
                              onChanged: (val) {
                                setState(() {
                                  _isRoundTrip = val;
                                  if (val && _returnAt == null) {
                                    _returnAt =
                                        _pickupAt.add(const Duration(hours: 3));
                                  }
                                });
                              },
                            ),
                            if (_isRoundTrip) ...[
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: Container(
                                  width: 32,
                                  height: 32,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFFF3CD),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: const Color(0xFFE6B800),
                                      width: 0.8,
                                    ),
                                  ),
                                  child: const Icon(
                                    Icons.swap_vert_rounded,
                                    color: Color(0xFF8A6900),
                                    size: 18,
                                  ),
                                ),
                                title: const Text('Return pickup time'),
                                subtitle: Text(
                                  _returnAt != null
                                      ? MaterialLocalizations.of(context)
                                          .formatFullDate(_returnAt!)
                                      : 'Tap to schedule return',
                                ),
                                trailing: _returnAt != null
                                    ? Text(
                                        TimeOfDay.fromDateTime(_returnAt!)
                                            .format(context),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      )
                                    : const Icon(Icons.chevron_right),
                                onTap: _pickReturnDateTime,
                              ),
                            ],
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Card 2: Passengers & Child Seats
                    GtCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              const Icon(
                                Icons.person_outline,
                                size: 22,
                                color: GtColors.textSecondary,
                              ),
                              const SizedBox(width: 10),
                              const Expanded(
                                child: Text(
                                  'Passengers',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                              GtStepper(
                                value: _adults,
                                min: 1,
                                max: 20,
                                onChanged: (v) => setState(() => _adults = v),
                              ),
                            ],
                          ),
                          if (isRide || isPerHour) ...[
                            const Divider(),
                            Row(
                              children: [
                                const Icon(
                                  Icons.child_care,
                                  size: 22,
                                  color: GtColors.textSecondary,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    _childSeats.summaryLabel,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                                TextButton(
                                  onPressed: _openChildSeatsSheet,
                                  child: const Text(
                                    'Edit',
                                    style: TextStyle(
                                      color: GtColors.brand,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Card 3: Vehicle Preferences
                    GtCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Vehicle preferences',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                              Text(
                                '${_vehicleClassIds.length} of ${MockData.vehicleClasses.length} selected',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: GtColors.textSecondary,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Select vehicle classes to receive driver offers from.',
                            style: TextStyle(
                              fontSize: 12,
                              color: GtColors.textMuted,
                            ),
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            height: 116,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: MockData.vehicleClasses.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(width: 8),
                              itemBuilder: (ctx, i) {
                                final vc = MockData.vehicleClasses[i];
                                final selected =
                                    _vehicleClassIds.contains(vc.id);
                                return InkWell(
                                  onTap: () => _toggleVehicleClass(vc.id),
                                  borderRadius: BorderRadius.circular(12),
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 150),
                                    width: 108,
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: selected
                                            ? GtColors.brand
                                            : GtColors.border,
                                        width: selected ? 1.5 : 1,
                                      ),
                                    ),
                                    child: Column(
                                      children: [
                                        Expanded(
                                          child: Stack(
                                            clipBehavior: Clip.none,
                                            children: [
                                              Center(
                                                child: vc.imageAsset != null
                                                    ? Image.asset(
                                                        vc.imageAsset!,
                                                        package: 'gt_ui',
                                                        fit: BoxFit.contain,
                                                        width: double.infinity,
                                                        errorBuilder:
                                                            (_, __, ___) =>
                                                                Icon(
                                                          Icons.directions_car,
                                                          size: 38,
                                                          color: selected
                                                              ? GtColors.brand
                                                              : GtColors.text,
                                                        ),
                                                      )
                                                    : Icon(
                                                        Icons.directions_car,
                                                        size: 38,
                                                        color: selected
                                                            ? GtColors.brand
                                                            : GtColors.text,
                                                      ),
                                              ),
                                              if (selected)
                                                const Positioned(
                                                  top: -2,
                                                  right: -2,
                                                  child: Icon(
                                                    Icons.check_circle,
                                                    size: 18,
                                                    color: GtColors.brand,
                                                  ),
                                                ),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Row(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Flexible(
                                              child: Text(
                                                vc.name,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 12.5,
                                                ),
                                              ),
                                            ),
                                            const SizedBox(width: 3),
                                            Tooltip(
                                              message:
                                                  '${vc.name} Capacity:\n• Up to ${vc.passengerSeats} passenger seats\n• Up to ${vc.luggagePlaces} standard bags',
                                              triggerMode:
                                                  TooltipTriggerMode.tap,
                                              showDuration:
                                                  const Duration(seconds: 4),
                                              preferBelow: false,
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                horizontal: 10,
                                                vertical: 6,
                                              ),
                                              margin:
                                                  const EdgeInsets.symmetric(
                                                      horizontal: 16),
                                              decoration: BoxDecoration(
                                                color: const Color(0xFF1E293B),
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                              ),
                                              textStyle: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 11.5,
                                                height: 1.3,
                                                fontWeight: FontWeight.w500,
                                              ),
                                              child: const Padding(
                                                padding: EdgeInsets.all(2.0),
                                                child: Icon(
                                                  Icons.info_outline,
                                                  size: 13,
                                                  color: GtColors.textSecondary,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Card 4: Flight & Signage & Driver Instructions
                    GtCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextField(
                            controller: _flight,
                            decoration: const InputDecoration(
                              labelText: 'Flight number',
                              hintText: 'e.g. AC824, pk737',
                              prefixIcon: Icon(Icons.flight, size: 20),
                            ),
                          ),
                          if (_isRoundTrip) ...[
                            const SizedBox(height: 8),
                            TextField(
                              controller: _returnFlight,
                              decoration: const InputDecoration(
                                labelText: 'Return flight number',
                                hintText: 'Return arrival flight number',
                                prefixIcon: Icon(Icons.flight_takeoff, size: 20),
                              ),
                            ),
                          ],
                          const SizedBox(height: 8),
                          TextField(
                            controller: _signage,
                            decoration: const InputDecoration(
                              labelText: 'Name sign',
                              hintText: "Name on a sign the driver'll hold",
                              prefixIcon:
                                  Icon(Icons.badge_outlined, size: 20),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _comment,
                            decoration: const InputDecoration(
                              labelText: 'Comment for driver',
                              hintText:
                                  'Luggage, special needs or tasks for the driver',
                              prefixIcon: Icon(Icons.chat_bubble_outline,
                                  size: 20),
                            ),
                            maxLines: 3,
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final c in [
                                'I need Wi-Fi',
                                'I need an English-speaking driver',
                                if (isPerHour) 'My route has several stops',
                                'Extra luggage',
                                'Pet friendly',
                              ])
                                ActionChip(
                                  label: Text(
                                    c,
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                  onPressed: () => _appendCommentChip(c),
                                  backgroundColor: GtColors.bgGrey,
                                  side: BorderSide.none,
                                ),
                            ],
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
