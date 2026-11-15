/// Learn — the catalogue, a screen-for-screen port of the web's
/// `learn/page.tsx`: PageHeader, search, and one card per subject that
/// links into `/learn/[subjectId]` with a Follow/Open action.
library revisio.features.learn.learn_screen;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/models.dart';
import '../app/app_data.dart';
import '../auth/auth_provider.dart';
import '../../services/api_client.dart';

class LearnScreen extends ConsumerStatefulWidget {
  const LearnScreen({super.key});

  @override
  ConsumerState<LearnScreen> createState() => _LearnScreenState();
}

class _LearnScreenState extends ConsumerState<LearnScreen> {
  String _query = '';
  String? _busyId;
  String _followError = '';

  @override
  Widget build(BuildContext context) {
    final subjects = ref.watch(subjectsProvider);

    return Scaffold(
      body: SafeArea(
        child: subjects.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) => Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Subjects could not be loaded.',
                    style: TypeScale.body.copyWith(
                      color: context.mutedForeground,
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => ref.invalidate(subjectsProvider),
                    child: const Text('Try again'),
                  ),
                ],
              ),
            ),
          ),
          data: (list) {
            final q = _query.trim().toLowerCase();
            final visible = q.isEmpty
                ? list
                : list
                      .where(
                        (s) =>
                            s.name.toLowerCase().contains(q) ||
                            (s.description ?? '').toLowerCase().contains(q),
                      )
                      .toList();

            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              children: [
                if (_followError.isNotEmpty) ...[
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: context.destructive.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(RadiusTokens.md),
                      border: Border.all(
                        color: context.destructive.withOpacity(0.4),
                      ),
                    ),
                    child: Text(
                      _followError,
                      style: TypeScale.caption.copyWith(
                        color: context.destructiveInk,
                      ),
                    ),
                  ),
                ],
                // PageHeader — icon, title, subtitle.
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: context.secondary,
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: const RevisioIcon('learn', size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Learn', style: TypeScale.title),
                          Text(
                            'Pick a subject to see its topics, notes and specification.',
                            style: TypeScale.caption.copyWith(
                              color: context.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                if (list.length > 3)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: TextField(
                      onChanged: (v) => setState(() => _query = v),
                      decoration: InputDecoration(
                        hintText: 'Search subjects…',
                        prefixIcon: Padding(
                          padding: const EdgeInsets.all(12),
                          child: RevisioIcon(
                            'search',
                            size: 17,
                            color: context.mutedForeground,
                          ),
                        ),
                      ),
                    ),
                  ),

                if (list.isEmpty) _EmptyCatalogue(),

                if (visible.isEmpty && list.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: context.card,
                      borderRadius: BorderRadius.circular(RadiusTokens.lg),
                      border: Border.all(color: context.border),
                    ),
                    child: Column(
                      children: [
                        Text(
                          'Nothing matches “$_query”',
                          style: TypeScale.strong,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Try a shorter piece of the name.',
                          style: TypeScale.caption.copyWith(
                            color: context.mutedForeground,
                          ),
                        ),
                        const SizedBox(height: 12),
                        _SmallSecondary(
                          label: 'Clear the search',
                          onTap: () => setState(() => _query = ''),
                        ),
                      ],
                    ),
                  ),

                for (final s in visible) ...[
                  _SubjectCard(
                    subject: s,
                    busy: _busyId == s.id,
                    onOpen: () => context.push('/learn/${s.id}'),
                    onFollow: () => _follow(s),
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _follow(Subject s) async {
    setState(() {
      _busyId = s.id;
      _followError = '';
    });
    try {
      await ref.read(apiClientProvider).enrollSubject(s.id);
      ref.invalidate(subjectsProvider);
      ref.invalidate(meProvider);
    } catch (e) {
      if (mounted) {
        setState(
          () => _followError = e is ApiError
              ? e.message
              : 'We could not follow that subject.',
        );
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }
}

class _SubjectCard extends StatelessWidget {
  const _SubjectCard({
    required this.subject,
    required this.busy,
    required this.onOpen,
    required this.onFollow,
  });

  final Subject subject;
  final bool busy;
  final VoidCallback onOpen;
  final VoidCallback onFollow;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // Link-first row: the whole info block navigates.
            InkWell(
              onTap: onOpen,
              borderRadius: BorderRadius.circular(RadiusTokens.md),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: kTouchTarget,
                    decoration: BoxDecoration(
                      color: context.secondary,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: const RevisioIcon('topic', size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(subject.name, style: TypeScale.strong),
                        if ((subject.description ?? '').isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            subject.description!,
                            style: TypeScale.caption.copyWith(
                              color: context.mutedForeground,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _Chip(
                  '${subject.topicCount} '
                  '${subject.topicCount == 1 ? 'topic' : 'topics'}',
                ),
                const Spacer(),
                if (!subject.enrolled)
                  _SmallSecondary(
                    label: busy ? 'Adding…' : 'Follow',
                    onTap: busy ? null : onFollow,
                  )
                else
                  _SmallPrimary(label: 'Open', onTap: onOpen),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.pill),
        border: Border.all(color: context.border),
      ),
      child: Text(
        text,
        style: TypeScale.caption.copyWith(
          color: context.foreground,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _SmallPrimary extends StatelessWidget {
  const _SmallPrimary({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: kTouchTarget,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: context.primary,
          foregroundColor: context.primaryForeground,
          elevation: 0,
          minimumSize: const Size(0, kTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: const StadiumBorder(),
        ),
        child: Text(label),
      ),
    );
  }
}

class _SmallSecondary extends StatelessWidget {
  const _SmallSecondary({required this.label, this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: kTouchTarget,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: context.foreground,
          side: BorderSide(color: context.border),
          minimumSize: const Size(0, kTouchTarget),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: const StadiumBorder(),
        ),
        child: Text(label),
      ),
    );
  }
}

class _EmptyCatalogue extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: context.card,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
        border: Border.all(color: context.border),
      ),
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: context.secondary,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: const RevisioIcon('library', size: 22),
          ),
          const SizedBox(height: 16),
          Text('Nothing published yet', style: TypeScale.tagline),
          const SizedBox(height: 8),
          Text(
            'No subjects are available on this deployment. Create your own '
            'in My content, or ask a teacher to publish one.',
            style: TypeScale.caption.copyWith(color: context.mutedForeground),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          _SmallPrimary(
            label: 'Go to My content',
            onTap: () => context.push('/library'),
          ),
        ],
      ),
    );
  }
}
