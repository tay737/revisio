/// Legal documents (privacy / terms).
///
/// The full text lives on the web at the same origin the API uses — it is
/// long, versioned and updated with each release, so the app links out rather
/// than keeping a copy that could drift. App-store reviewers can read the
/// canonical document in the browser.
library revisio.features.legal.legal_screen;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../design/design.dart';
import '../../services/api_client.dart';

class LegalScreen extends StatelessWidget {
  final String title;
  final String path;
  final String summary;

  const LegalScreen({
    super.key,
    required this.title,
    required this.path,
    required this.summary,
  });

  String get _url => '$kBaseUrl$path';

  Future<void> _open(BuildContext context) async {
    final uri = Uri.parse(_url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open $_url')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 24),
              Text(
                title,
                style: TypeScale.title.copyWith(color: context.foreground),
              ),
              const SizedBox(height: 16),
              Text(
                summary,
                style: TypeScale.body.copyWith(
                  color: context.mutedForeground,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 24),
              InkWell(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: _url));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Link copied')),
                  );
                },
                child: Text(
                  _url,
                  style: TypeScale.caption.copyWith(
                    color: context.primary,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: kTouchTarget,
                child: RevisioButton(
                  onPressed: () => _open(context),
                  child: Text(
                    'Open $title',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                  ),
                ),
              ),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }
}
