import 'package:flutter/material.dart';
import 'app_router.dart';
import 'design/design.dart';

void main() {
  runApp(const RevisioApp());
}

class RevisioApp extends StatelessWidget {
  const RevisioApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Revisio',
      theme: lightTheme(),
      darkTheme: darkTheme(),
      themeMode: ThemeMode.system,
      routerConfig: goRouter,
      debugShowCheckedModeBanner: false,
    );
  }
}
