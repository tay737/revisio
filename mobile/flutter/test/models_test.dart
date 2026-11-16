import 'package:flutter_test/flutter_test.dart';
import 'package:revisio/engine/models.dart';

void main() {
  test('Gamification parses streakFreezes from /me', () {
    final g = Gamification.fromJson(const {
      'totalXp': 120,
      'level': 2,
      'streak': 5,
      'bestStreak': 9,
      'streakFreezes': 2,
    });
    expect(g.streakFreezes, 2);
    expect(g.streak, 5);
  });

  test('Gamification defaults streakFreezes to 0 when absent', () {
    expect(Gamification.fromJson(const {}).streakFreezes, 0);
  });

  test('Challenge parses the nested def + live progress', () {
    final c = Challenge.fromJson(const {
      'def': {
        'id': 'daily-reviews',
        'period': 'daily',
        'title': 'Review 10 cards',
        'description': 'Ten reviews today.',
        'rewardXp': 15,
      },
      'periodStart': '2026-11-16',
      'progress': 7,
      'target': 10,
      'completed': false,
      'rewardXp': 15,
    });
    expect(c.id, 'daily-reviews');
    expect(c.period, 'daily');
    expect(c.progress, 7);
    expect(c.target, 10);
    expect(c.completed, isFalse);
    expect(c.rewardXp, 15);
  });

  test('Goal parses id/kind/target/deadline/progress', () {
    final g = Goal.fromJson(const {
      'id': 'g1',
      'kind': 'reviews',
      'title': '100 reviews',
      'target': 100,
      'deadline': '2026-12-01',
      'progress': 42,
      'completed': false,
    });
    expect(g.id, 'g1');
    expect(g.kind, 'reviews');
    expect(g.deadline, '2026-12-01');
    expect(g.progress, 42);
    expect(Goal.fromJson(const {'id': 'g2'}).deadline, isNull);
  });
}
