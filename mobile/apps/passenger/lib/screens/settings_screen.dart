import 'package:flutter/material.dart';
import 'package:passenger/screens/menu_panel.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(child: MenuPanel()),
    );
  }
}
