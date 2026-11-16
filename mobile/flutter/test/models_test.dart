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

  test('SocialOverview parses consent, connections and board', () {
    final s = SocialOverview.fromJson(const {
      'consentSocial': true,
      'connections': [
        {
          'id': 'c1',
          'kind': 'accountability',
          'status': 'accepted',
          'direction': 'incoming',
          'user': {'id': 'u2', 'name': 'Sam', 'username': 'sam', 'avatarColor': 'sky'},
        },
      ],
      'board': [
        {'userId': 'u2', 'name': 'Sam', 'weeklyXp': 340, 'streak': 6, 'rank': 1},
        {'userId': 'me', 'name': 'Me', 'weeklyXp': 200, 'streak': 3, 'rank': 2, 'isSelf': true},
      ],
    });
    expect(s.consentSocial, isTrue);
    expect(s.connections.single.kind, 'accountability');
    expect(s.connections.single.direction, 'incoming');
    expect(s.connections.single.user.username, 'sam');
    expect(s.board.length, 2);
    expect(s.board[1].isSelf, isTrue);
    expect(s.board[0].weeklyXp, 340);
  });

  test('SocialOverview consent-off keeps empty collections', () {
    final s = SocialOverview.fromJson(const {'consentSocial': false});
    expect(s.consentSocial, isFalse);
    expect(s.connections, isEmpty);
    expect(s.board, isEmpty);
  });

  test('GuardianLink and GuardianSummary parse both sides', () {
    final l = GuardianLink.fromJson(const {
      'id': 'l1',
      'role': 'student',
      'status': 'accepted',
      'user': {'id': 'g1', 'name': 'Pat'},
    });
    expect(l.role, 'student');
    expect(l.user?.name, 'Pat');

    final s = GuardianSummary.fromJson(const {
      'last30Days': {'reviews': 120, 'correct': 96, 'accuracy': 80},
      'streak': 12,
      'topicsMastered': 4,
    });
    expect(s.hasCounts, isTrue);
    expect(s.accuracy, 80);
    expect(s.streak, 12);
    expect(s.topicsMastered, 4);
    expect(GuardianSummary.fromJson(const {}).hasCounts, isFalse);
  });

  test('ExamPlan parses pace summary, weakest topics and reflection', () {
    final p = ExamPlan.fromJson(const {
      'id': 'p1',
      'title': 'GCSE Maths — Paper 1',
      'examDate': '2026-12-05',
      'subjectId': 's1',
      'dailyTarget': 8,
      'status': 'active',
      'daysLeft': 19,
      'topicsTotal': 12,
      'topicsRemaining': 7,
      'perDayNeeded': 1,
      'onTrack': true,
      'weakestTopics': [
        {'id': 't1', 'name': 'Quadratics', 'remaining': 3},
      ],
      'reflection': {'score': 72, 'maxScore': 100, 'note': 'Cram worked.'},
    });
    expect(p.daysLeft, 19);
    expect(p.perDayNeeded, 1);
    expect(p.onTrack, isTrue);
    expect(p.weakestTopics.single.name, 'Quadratics');
    expect(p.reflection?.score, 72);
    expect(ExamPlan.fromJson(const {'id': 'p2'}).reflection, isNull);
  });
}
