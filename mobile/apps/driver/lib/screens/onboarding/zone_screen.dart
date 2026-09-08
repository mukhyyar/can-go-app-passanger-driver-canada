import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import 'zone/add_zone_button.dart';
import 'zone/operating_zone_map.dart';
import 'zone/zone_creation_bar.dart';
import 'zone/zone_geo.dart';

class ZoneScreen extends StatefulWidget {
  const ZoneScreen({super.key});

  @override
  State<ZoneScreen> createState() => _ZoneScreenState();
}

class _ZoneScreenState extends State<ZoneScreen> {
  final List<OperatingZone> _zones = [];
  final MapController _mapController = MapController();

  ZoneMapMode _mode = ZoneMapMode.viewing;
  ZoneCreationTool _tool = ZoneCreationTool.circle;
  String? _selectedId;

  double _draftRadiusKm = 66;
  List<GeoPoint>? _draftPolygon;

  bool _infoShown = false;
  bool _saving = false;
  bool _loaded = false;

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      if (s.isAuthenticated) {
        await s.loadOperatingZones();
      }
      if (!mounted) return;
      _hydrate();
      if (!_infoShown) {
        _infoShown = true;
        _showIntro();
      }
    });
  }

  void _hydrate() {
    final s = context.read<AppState>();
    setState(() {
      _zones
        ..clear()
        ..addAll(s.operatingZones.map((z) => z.copyWith()));
      _loaded = true;
      _mode = ZoneMapMode.viewing;
      _selectedId = null;
      _clearDraft();
    });
  }

  void _clearDraft() {
    _draftPolygon = null;
    _draftRadiusKm = 66;
  }

  GeoPoint _currentMapCenter() {
    try {
      final c = _mapController.camera.center;
      return GeoPoint(latitude: c.latitude, longitude: c.longitude);
    } catch (_) {
      final s = context.read<AppState>();
      return GeoPoint(latitude: s.baseLatitude, longitude: s.baseLongitude);
    }
  }

  Future<void> _showIntro() async {
    await showGtSheet(
      context: context,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 12, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: GtColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Set your zone — Don’t miss out',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text('📍  Get rides that start or end in your zone.'),
            const SizedBox(height: 8),
            const Text('🚗  Bigger zone = more rides.'),
            const SizedBox(height: 8),
            const Text('🔄  You can change it later.'),
            const SizedBox(height: 8),
            const Text('💡  Tip: Include airports and neighborhoods.'),
            const SizedBox(height: 20),
            GtGreenButton(
              label: 'OK',
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    );
  }

  void _startAdd() {
    final s = context.read<AppState>();
    setState(() {
      _mode = ZoneMapMode.creating;
      _tool = ZoneCreationTool.circle;
      _selectedId = null;
      _draftRadiusKm = 66;
      _draftPolygon = null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        _mapController.move(
          LatLng(s.baseLatitude, s.baseLongitude),
          9.5,
        );
      } catch (_) {}
    });
  }

  void _cancelCreate() {
    setState(() {
      _mode = ZoneMapMode.viewing;
      _clearDraft();
    });
  }

  void _selectTool(ZoneCreationTool tool) {
    setState(() {
      _tool = tool;
      _draftPolygon = null;
    });
  }

  bool get _canConfirm {
    if (_mode != ZoneMapMode.creating) return false;
    if (_tool == ZoneCreationTool.circle) {
      return _draftRadiusKm >= ZoneCreationBar.minKm;
    }
    return _draftPolygon != null && _draftPolygon!.length >= 3;
  }

  void _confirmCreate() {
    if (!_canConfirm) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _tool == ZoneCreationTool.draw
                ? 'Draw an area on the map first.'
                : 'Adjust the circle radius, then confirm.',
          ),
        ),
      );
      return;
    }

    final id = 'zone_${DateTime.now().millisecondsSinceEpoch}';
    final name = 'Operating Zone ${_zones.length + 1}';
    late final OperatingZone zone;

    if (_tool == ZoneCreationTool.circle) {
      zone = ZoneGeo.circleZone(
        id: id,
        name: name,
        center: _currentMapCenter(),
        radiusKm: _draftRadiusKm.roundToDouble(),
      );
    } else {
      zone = ZoneGeo.polygonZone(
        id: id,
        name: name,
        coordinates: List<GeoPoint>.from(_draftPolygon!),
      );
    }

    setState(() {
      _zones.add(zone);
      _mode = ZoneMapMode.viewing;
      _clearDraft();
      _selectedId = null;
    });
  }

  void _onZoneSelected(String? id) {
    if (_mode == ZoneMapMode.creating) return;
    setState(() {
      if (id == null || id.isEmpty) {
        _selectedId = null;
        _mode = ZoneMapMode.viewing;
      } else {
        _selectedId = id;
        _mode = ZoneMapMode.selected;
      }
    });
  }

  Future<void> _confirmDelete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove operating zone?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: GtColors.brand),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _zones.removeWhere((z) => z.id == _selectedId);
      _selectedId = null;
      _mode = ZoneMapMode.viewing;
    });
  }

  Future<void> _onNext() async {
    if (_mode == ZoneMapMode.creating) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Finish or cancel zone creation first.')),
      );
      return;
    }
    if (_zones.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please add at least one operating zone.'),
        ),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await context.read<AppState>().saveOperatingZones(_zones);
      if (!mounted) return;
      context.push('/onboarding/documents');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    final creating = _mode == ZoneMapMode.creating;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Your operating zone'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (creating) {
              _cancelCreate();
            } else {
              context.pop();
            }
          },
        ),
        actions: [
          IconButton(
            onPressed: _showIntro,
            icon: const Icon(Icons.info_outline),
            tooltip: 'Info',
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (v) {
              if (v == 'clear') {
                setState(() {
                  _zones.clear();
                  _selectedId = null;
                  _mode = ZoneMapMode.viewing;
                  _clearDraft();
                });
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'clear', child: Text('Clear all zones')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: !_loaded
                ? const Center(child: CircularProgressIndicator())
                : OperatingZoneMap(
                    mapController: _mapController,
                    baseLatitude: s.baseLatitude,
                    baseLongitude: s.baseLongitude,
                    zones: _zones,
                    mode: _mode,
                    creationTool: creating ? _tool : null,
                    draftRadiusKm: _draftRadiusKm,
                    draftPolygon: _draftPolygon,
                    selectedZoneId: _selectedId,
                    onZoneSelected: _onZoneSelected,
                    onDeleteSelected: _confirmDelete,
                    onFreehandCompleted: (pts) {
                      setState(() => _draftPolygon = pts);
                    },
                  ),
          ),
          if (creating)
            ZoneCreationBar(
              tool: _tool,
              radiusKm: _draftRadiusKm,
              canConfirm: _canConfirm,
              bottomInset: bottomPad,
              onCancel: _cancelCreate,
              onSelectTool: _selectTool,
              onRadiusChanged: (v) => setState(() => _draftRadiusKm = v),
              onConfirm: _confirmCreate,
            )
          else
            Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: GtColors.border)),
              ),
              padding: EdgeInsets.fromLTRB(8, 10, 12, 12 + bottomPad),
              child: Row(
                children: [
                  AddZoneButton(
                    onPressed: _startAdd,
                    enabled: !_saving,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: GtGreenButton(
                      label: _saving ? 'Saving…' : 'Next',
                      onPressed: _saving ? null : _onNext,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
