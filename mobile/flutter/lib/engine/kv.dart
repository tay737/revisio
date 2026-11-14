/// The storage seam — the offline state's one door.
///
/// The offline state is small (a pack of twenty cards, a list of owed
/// reviews), so it needs a key/value store and nothing more. The app binds it
/// to the documents directory; tests bind it to memory.
library revisio.engine.kv;

import 'dart:io';

abstract class KeyValueStore {
  String? read(String key);
  void write(String key, String value);
  void remove(String key);
}

/// Non-durable; for tests.
class MemoryKeyValueStore implements KeyValueStore {
  final _values = <String, String>{};

  @override
  String? read(String key) => _values[key];

  @override
  void write(String key, String value) => _values[key] = value;

  @override
  void remove(String key) => _values.remove(key);
}

/// One file per key in a private directory — the same shape the Kotlin engine
/// uses, so both clients cache the same thing.
class FileKeyValueStore implements KeyValueStore {
  FileKeyValueStore(this.dir) {
    try {
      dir.createSync(recursive: true);
    } catch (_) {}
  }

  final Directory dir;

  File _file(String key) => File('${dir.path}/$key');

  @override
  String? read(String key) {
    try {
      final f = _file(key);
      return f.existsSync() ? f.readAsStringSync() : null;
    } catch (_) {
      return null;
    }
  }

  @override
  void write(String key, String value) {
    try {
      _file(key).writeAsStringSync(value);
    } catch (_) {}
  }

  @override
  void remove(String key) {
    try {
      _file(key).deleteSync();
    } catch (_) {}
  }
}
