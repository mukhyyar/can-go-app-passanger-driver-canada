import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/shell.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class BookHeader extends StatelessWidget {
  const BookHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(0, 4, 0, 0),
      padding: const EdgeInsets.fromLTRB(6, 8, 8, 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFFFFFFF),
            Color(0xFFFFF8F8),
            Color(0xFFFDEAEA),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GtColors.border),
        boxShadow: [
          BoxShadow(
            color: GtColors.brand.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => openPassengerMenu(context),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: GtColors.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Icon(Icons.menu_rounded, color: GtColors.text),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: CanRideHeaderLockup(
              markSize: 44,
              trailing: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () {
                    final app = context.read<AppState>();
                    if (app.isAuthenticated) {
                      openPassengerMenu(context);
                    } else {
                      context.push('/auth');
                    }
                  },
                  borderRadius: BorderRadius.circular(22),
                  child: Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: GtColors.soft,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: GtColors.brand.withValues(alpha: 0.18),
                      ),
                    ),
                    child: const Icon(
                      Icons.person_outline_rounded,
                      color: GtColors.brand,
                      size: 22,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
