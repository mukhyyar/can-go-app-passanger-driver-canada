import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/menu_panel.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: GtColors.bgGrey,
      body: SafeArea(child: MenuPanel()),
    );
  }
}
