import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

/// White circular floating delete control with red trash icon.
class DeleteZoneButton extends StatelessWidget {
  const DeleteZoneButton({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 4,
      shadowColor: Colors.black26,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: const SizedBox(
          width: 44,
          height: 44,
          child: Icon(Icons.delete_outline, color: GtColors.brand, size: 22),
        ),
      ),
    );
  }
}
