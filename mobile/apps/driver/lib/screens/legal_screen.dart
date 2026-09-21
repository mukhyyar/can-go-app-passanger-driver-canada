import 'package:driver/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

/// Screen displaying the Canadian-compliant Privacy Policy and Service Agreement for drivers.
class DriverLegalScreen extends StatefulWidget {
  const DriverLegalScreen({super.key, this.initialSlug = 'privacy'});

  final String initialSlug;

  @override
  State<DriverLegalScreen> createState() => _DriverLegalScreenState();
}

class _DriverLegalScreenState extends State<DriverLegalScreen> {
  late String _activeSlug;

  @override
  void initState() {
    super.initState();
    _activeSlug = widget.initialSlug == 'terms' ? 'terms' : 'privacy';
  }

  Future<Map<String, dynamic>?> _fetchDocument(String slug) async {
    final cms = context.read<AppState>().api.cms;
    try {
      final doc = await cms.page(slug);
      return doc;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: Text(
          _activeSlug == 'terms' ? 'Service Agreement' : 'Privacy Policy',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back',
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        bottom: false,
        child: GtLegalDocumentView(
          initialSlug: _activeSlug,
          fetchDocument: _fetchDocument,
          onSlugChanged: (slug) {
            setState(() {
              _activeSlug = slug;
            });
          },
          onContactSupport: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Contact support at partner@can-go.ca'),
              ),
            );
          },
        ),
      ),
    );
  }
}
