/// Staff console state — the Flutter port of the native ViewModel's staff
/// slice (`loadTeaching`, `loadAdmin`, `staffAction`, the student-progress
/// sheet).
///
/// One owner per fact, same as the native clients: this notifier holds the
/// console payloads, the in-flight flag, the persistent notices, and runs
/// every write through `staffAction`, which re-reads the console afterwards
/// so a screen never shows a state the server has already moved past.
library revisio.features.staff.staff_controller;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../engine/staff_models.dart';
import '../../services/api_client.dart';
import '../auth/auth_provider.dart';

/// Who a student-progress sheet is about.
class StaffStudentRef {
  final String userId;
  final String name;

  const StaffStudentRef(this.userId, this.name);
}

/// `teacher` and `developer` both reach Teaching; only `developer` reaches
/// Admin — the same split `canManageContent`/`isDeveloper` draw server-side.
bool staffCanTeach(String? role) => role == 'teacher' || role == 'developer';
bool staffCanAdmin(String? role) => role == 'developer';

class StaffState {
  final TeacherPayload? teacherData;
  final AdminPayload? adminData;
  final List<MyTopic> myTopics;
  final bool staffBusy;
  final String? staffNote;
  final String? staffError;

  const StaffState({
    this.teacherData,
    this.adminData,
    this.myTopics = const [],
    this.staffBusy = false,
    this.staffNote,
    this.staffError,
  });

  StaffState copyWith({
    TeacherPayload? teacherData,
    AdminPayload? adminData,
    List<MyTopic>? myTopics,
    bool? staffBusy,
    String? staffNote,
    String? staffError,
    bool clearNote = false,
    bool clearError = false,
  }) => StaffState(
    teacherData: teacherData ?? this.teacherData,
    adminData: adminData ?? this.adminData,
    myTopics: myTopics ?? this.myTopics,
    staffBusy: staffBusy ?? this.staffBusy,
    staffNote: clearNote ? null : (staffNote ?? this.staffNote),
    staffError: clearError ? null : (staffError ?? this.staffError),
  );
}

class StaffController extends StateNotifier<StaffState> {
  StaffController(this._ref) : super(const StaffState());

  final Ref _ref;

  RevisioApi get _api => _ref.read(apiClientProvider);

  /// `GET /teacher` plus the editable-topics list the publish section needs.
  /// The topics read is best-effort: a teacher without authoring rights still
  /// gets their classes.
  Future<void> loadTeaching() async {
    state = state.copyWith(staffBusy: true, clearNote: true, clearError: true);
    try {
      final classes = await _api.teacher();
      List<MyTopic> topics = const [];
      try {
        topics = (await _api.myTopics()).topics;
      } catch (_) {}
      if (!mounted) return;
      state = state.copyWith(
        teacherData: classes,
        myTopics: topics,
        staffBusy: false,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(staffBusy: false, staffError: _message(e));
    }
  }

  /// `GET /admin` — developers only; the server 403s anyone else.
  Future<void> loadAdmin() async {
    state = state.copyWith(staffBusy: true, clearNote: true, clearError: true);
    try {
      final data = await _api.admin();
      if (!mounted) return;
      state = state.copyWith(adminData: data, staffBusy: false);
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(staffBusy: false, staffError: _message(e));
    }
  }

  /// One staff action, then re-read whatever it changed — the same reload the
  /// web's `act()` performs. The note lands in `staffNote`, the error in
  /// `staffError`; both are persistent notices, not snackbars.
  Future<void> staffAction({
    required bool admin,
    required Map<String, dynamic> body,
    required String okMsg,
  }) async {
    state = state.copyWith(staffBusy: true, clearNote: true, clearError: true);
    try {
      if (admin) {
        await _api.adminAction(body);
      } else {
        await _api.teacherAction(body);
      }
      if (!mounted) return;
      // Reload first, note after: loadX() clears staffNote on entry, so a
      // note set before the re-fetch would never paint.
      if (admin) {
        await loadAdmin();
      } else {
        await loadTeaching();
      }
      if (!mounted) return;
      state = state.copyWith(staffNote: okMsg);
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(staffBusy: false, staffError: _message(e));
    }
  }

  void clearStaffNote() =>
      state = state.copyWith(clearNote: true, clearError: true);

  /// A sign-out or account switch drops every cached console — staff data
  /// must never survive into a different session.
  void reset() => state = const StaffState();

  String _message(Object e) {
    if (e is ApiError) return e.message;
    return 'That did not work — try again.';
  }
}

final staffControllerProvider =
    StateNotifierProvider<StaffController, StaffState>((ref) {
      final controller = StaffController(ref);
      // Session changes invalidate every console read.
      ref.listen(authProvider, (_, __) => controller.reset());
      return controller;
    });
