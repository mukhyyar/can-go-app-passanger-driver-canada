import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

/// Orange teardrop pin with vehicle icon + callout label.
class BaseLocationMarker extends StatelessWidget {
  const BaseLocationMarker({
    super.key,
    this.label = 'Base location of your transport',
  });

  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          elevation: 3,
          borderRadius: BorderRadius.circular(6),
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: GtColors.text,
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          width: 40,
          height: 48,
          child: Stack(
            alignment: Alignment.topCenter,
            children: [
              CustomPaint(
                size: const Size(36, 44),
                painter: _PinPainter(color: GtColors.orange),
              ),
              const Padding(
                padding: EdgeInsets.only(top: 7),
                child: Icon(
                  Icons.directions_car,
                  color: Colors.white,
                  size: 16,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PinPainter extends CustomPainter {
  _PinPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final path = Path();
    final cx = size.width / 2;
    final r = size.width / 2;
    path.addOval(Rect.fromCircle(center: Offset(cx, r * 0.85), radius: r * 0.92));
    path.moveTo(cx - r * 0.55, r * 1.35);
    path.lineTo(cx, size.height);
    path.lineTo(cx + r * 0.55, r * 1.35);
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _PinPainter oldDelegate) =>
      oldDelegate.color != color;
}
