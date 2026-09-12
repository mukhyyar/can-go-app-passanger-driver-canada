import 'package:flutter/material.dart';

/// Controlled text field that syncs when [initial] changes from outside.
class BoundField extends StatefulWidget {
  const BoundField({
    super.key,
    required this.fieldKey,
    required this.initial,
    required this.hint,
    required this.onChanged,
    this.maxLines = 1,
  });

  final Key fieldKey;
  final String initial;
  final String hint;
  final ValueChanged<String> onChanged;
  final int maxLines;

  @override
  State<BoundField> createState() => _BoundFieldState();
}

class _BoundFieldState extends State<BoundField> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initial);
  }

  @override
  void didUpdateWidget(covariant BoundField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initial != _controller.text &&
        widget.initial != oldWidget.initial) {
      _controller.text = widget.initial;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      key: widget.fieldKey,
      controller: _controller,
      maxLines: widget.maxLines,
      decoration: InputDecoration(
        hintText: widget.hint,
        border: InputBorder.none,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
      ),
      onChanged: widget.onChanged,
    );
  }
}
