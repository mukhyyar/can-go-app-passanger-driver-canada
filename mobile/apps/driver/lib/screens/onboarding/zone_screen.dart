import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
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
  ZoneMapController? _mapController;

  ZoneMapMode _mode = ZoneMapMode.viewing;
  ZoneCreationTool _tool = ZoneCreationTool.circle;
  String? _selectedId;

  double _draftRadiusKm = 66;
  final List<List<GeoPoint>> _draftPolygons = [];

  bool _infoShown = false;
  bool _saving = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      _mapController = ZoneMapController(
        lat: s.baseLatitude,
        lng: s.baseLongitude,
      );
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
    _draftPolygons.clear();
    _draftRadiusKm = 66;
  }

  GeoPoint _currentMapCenter() {
    final c = _mapController;
    if (c != null) return c.center;
    final s = context.read<AppState>();
    return GeoPoint(latitude: s.baseLatitude, longitude: s.baseLongitude);
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
            const Text('Get rides that start or end in your zone.'),
            const SizedBox(height: 8),
            const Text('Bigger zone = more rides.'),
            const SizedBox(height: 8),
            const Text('You can change it later.'),
            const SizedBox(height: 8),
            const Text('Tip: Include airports and neighborhoods.'),
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
      _draftPolygons.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _mapController?.move(s.baseLatitude, s.baseLongitude, 9.5);
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
      _draftPolygons.clear();
      _draftRadiusKm = tool == ZoneCreationTool.circle ? 66 : 0;
    });
  }

  bool get _canConfirm {
    if (_mode != ZoneMapMode.creating) return false;
    if (_tool == ZoneCreationTool.circle) {
      return _draftRadiusKm >= ZoneCreationBar.minKm;
    }
    return _draftPolygons.isNotEmpty;
  }

  void _onFreehandCompleted(List<GeoPoint> pts) {
    if (pts.length < 3) return;
    setState(() => _draftPolygons.add(List<GeoPoint>.from(pts)));
  }

  void _confirmCreate() {
    if (!_canConfirm) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _tool == ZoneCreationTool.draw
                ? 'Draw at least one area on the map first.'
                : 'Adjust the circle radius, then confirm.',
          ),
        ),
      );
      return;
    }

    if (_tool == ZoneCreationTool.circle) {
      final id = 'zone_${DateTime.now().millisecondsSinceEpoch}';
      final zone = ZoneGeo.circleZone(
        id: id,
        name: 'Operating Zone ${_zones.length + 1}',
        center: _currentMapCenter(),
        radiusKm: _draftRadiusKm.roundToDouble(),
      );
      setState(() {
        _zones.add(zone);
        _mode = ZoneMapMode.viewing;
        _clearDraft();
        _selectedId = null;
      });
      return;
    }

    final base = _zones.length;
    final newZones = <OperatingZone>[];
    for (var i = 0; i < _draftPolygons.length; i++) {
      final id = 'zone_${DateTime.now().millisecondsSinceEpoch}_$i';
      newZones.add(
        ZoneGeo.polygonZone(
          id: id,
          name: 'Operating Zone ${base + i + 1}',
          coordinates: List<GeoPoint>.from(_draftPolygons[i]),
        ),
      );
    }

    setState(() {
      _zones.addAll(newZones);
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

  Future<void> _onSave() async {
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

    final s = context.read<AppState>();
    final settingsMode = s.onboardedComplete;
    setState(() => _saving = true);
    try {
      await s.saveOperatingZones(_zones);
      if (!mounted) return;
      if (settingsMode) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Operating zones saved')),
        );
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/');
        }
      } else {
        context.push('/onboarding/documents');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _handleBack() {
    if (_mode == ZoneMapMode.creating) {
      _cancelCreate();
      return;
    }
    if (_selectedId != null) {
      setState(() {
        _selectedId = null;
        _mode = ZoneMapMode.viewing;
      });
      return;
    }
    if (context.canPop()) {
      context.pop();
    } else {
      final s = context.read<AppState>();
      if (s.onboardedComplete) {
        context.go('/');
      } else {
        context.go('/onboarding/location');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    final creating = _mode == ZoneMapMode.creating;
    final settingsMode = s.onboardedComplete;
    final isCircleTool = creating && _tool == ZoneCreationTool.circle;
    final isDrawTool = creating && _tool == ZoneCreationTool.draw;
    _mapController ??= ZoneMapController(
      lat: s.baseLatitude,
      lng: s.baseLongitude,
    );

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _handleBack();
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          title: const Text('Your operating zone'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: _handleBack,
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
                    draftRadiusKm: isCircleTool ? _draftRadiusKm : 0,
                    showDraftCircle: isCircleTool,
                    draftPolygons: isDrawTool ? _draftPolygons : const [],
                    selectedZoneId: _selectedId,
                    onZoneSelected: _onZoneSelected,
                    onDeleteSelected: _confirmDelete,
                    onFreehandCompleted: _onFreehandCompleted,
                  ),
          ),
          if (creating)
            ZoneCreationBar(
              tool: _tool,
              radiusKm: isCircleTool ? _draftRadiusKm : 0,
              draftPolygonCount: isDrawTool ? _draftPolygons.length : 0,
              canConfirm: _canConfirm,
              bottomInset: bottomPad,
              onCancel: _cancelCreate,
              onSelectTool: _selectTool,
              onRadiusChanged: (v) {
                if (_tool != ZoneCreationTool.circle) return;
                setState(() => _draftRadiusKm = v);
              },
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
                      label: _saving
                          ? 'Saving…'
                          : (settingsMode ? 'Save' : 'Next'),
                      onPressed: _saving ? null : _onSave,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    ),
  );
  }
}
