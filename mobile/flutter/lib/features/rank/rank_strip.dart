/// The dark rank band — the web's `RankStrip`, shared by the dashboard and
/// the Rank page so the two can never disagree.
library revisio.features.rank.rank_strip;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/revisio_icons.dart';
import '../../design/theme.dart';
import '../../design/tokens.dart';
import '../../engine/copy.dart' as copy;
import '../../engine/models.dart';
import '../../engine/ranked.dart';
import '../nav/rank_crest.dart';

class RankStrip extends StatelessWidget {
  const RankStrip({super.key, required this.ranked});

  final Ranked ranked;

  @override
  Widget build(BuildContext context) {
    final rank = ranked.rank;
    final placement = ranked.placement;
    final placing = placement.placing;
    final lobby = ranked.lobby;
    final season = ranked.season;

    final smallLobby = lobby.filled < lobbyZoneMin;
    final zoneLabel = smallLobby
        ? 'Small lobby'
        : switch (lobby.zone) {
            'promotion' => 'Promotion zone',
            'demotion' => 'Drop zone',
            'pending' => 'Being placed',
            _ => 'Safe',
          };
    final zoneIcon = smallLobby
        ? 'person'
        : switch (lobby.zone) {
            'demotion' => 'zoneDown',
            _ => 'zoneUp',
          };
    final zoneColor = smallLobby
        ? context.bandMuted
        : switch (lobby.zone) {
            'promotion' => context.goodStrong,
            'demotion' => context.destructiveInk,
            _ => context.bandMuted,
          };

    final caption = season != null
        ? copy.seasonLine(
            daysLeft: season.daysLeft,
            rankLabel: rank.label,
            placed: !placing,
            isLastDay: season.daysLeft <= 1,
          )
        : placing
        ? 'Placement: ${placement.done} of ${placement.target} reviews before you hold a rank.'
        : rank.isApex
        ? 'Top of the ladder. Holding it is the hard part.'
        : '${rank.remaining} RP to the next rung · about ${reviewsForRp(rank.remaining)} reviews.';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.band,
        borderRadius: BorderRadius.circular(RadiusTokens.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RankCrest(rank: rank, size: 88),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      season != null
                          ? 'Your rank · ${season.label}'
                          : 'Your rank',
                      style: TypeScale.micro.copyWith(
                        color: context.bandMuted,
                        letterSpacing: 0.08,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      placing ? 'Being placed' : rank.label,
                      style: TypeScale.display.copyWith(
                        color: context.bandForeground,
                        fontSize: 26,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      caption,
                      style: TypeScale.caption.copyWith(
                        color: context.bandMuted,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 8,
                            decoration: BoxDecoration(
                              color: context.bandBorder,
                              borderRadius: BorderRadius.circular(
                                RadiusTokens.pill,
                              ),
                            ),
                            child: FractionallySizedBox(
                              alignment: Alignment.centerLeft,
                              widthFactor:
                                  ((placing
                                              ? placement.percent
                                              : rank.percent) /
                                          100)
                                      .clamp(0, 1),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: context.bandForeground,
                                  borderRadius: BorderRadius.circular(
                                    RadiusTokens.pill,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          placing
                              ? '${placement.done}/${placement.target}'
                              : '${rank.points} RP',
                          style: TypeScale.fine.copyWith(
                            color: context.bandMuted,
                          ),
                        ),
                      ],
                    ),
                    if (season != null) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: Container(
                              height: 4,
                              decoration: BoxDecoration(
                                color: context.bandBorder,
                                borderRadius: BorderRadius.circular(
                                  RadiusTokens.pill,
                                ),
                              ),
                              child: FractionallySizedBox(
                                alignment: Alignment.centerLeft,
                                widthFactor: (season.percentElapsed / 100)
                                    .clamp(0, 1),
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: context.bandForeground,
                                    borderRadius: BorderRadius.circular(
                                      RadiusTokens.pill,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            'Day ${season.day}/${season.lengthDays} · ${season.daysLeft} left',
                            style: TypeScale.fine.copyWith(
                              color: context.bandMuted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Lobby status — the weekly stake, with the clock on it.
          InkWell(
            onTap: () => context.push('/rank?view=lobby'),
            borderRadius: BorderRadius.circular(RadiusTokens.md),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: context.bandSecondary,
                borderRadius: BorderRadius.circular(RadiusTokens.md),
                border: Border.all(color: context.bandBorder),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          ranked.week.daysLeft == 1
                              ? 'Last day this week'
                              : '${ranked.week.daysLeft} days left this week',
                          style: TypeScale.fine.copyWith(
                            color: context.bandMuted,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Text(
                              zoneLabel,
                              style: TypeScale.caption.copyWith(
                                color: context.bandForeground,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(width: 6),
                            RevisioIcon(zoneIcon, size: 13, color: zoneColor),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${lobby.position} of ${lobby.filled} · ${ranked.xpThisWeek} XP this week',
                          style: TypeScale.fine.copyWith(
                            color: context.bandMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  RevisioIcon('next', size: 16, color: context.bandMuted),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
