package app.revisio.engine

import java.io.File

/**
 * The storage seam.
 *
 * The offline state is small (a pack of twenty cards, a list of owed reviews),
 * so it needs a key/value store and nothing more. Keeping that behind an
 * interface is what lets the whole engine run — and be tested — on the JVM: the
 * Android app binds it to the app's private files directory, a unit test binds
 * it to memory. Every access is guarded so a device with no writable storage
 * degrades offline instead of failing to open at all.
 */
interface KeyValueStore {
    fun read(key: String): String?
    fun write(key: String, value: String)
    fun remove(key: String)
}

/** Non-durable; for tests and for the one code path that runs before binding. */
class MemoryKeyValueStore : KeyValueStore {
    private val values = mutableMapOf<String, String>()

    override fun read(key: String): String? = values[key]

    override fun write(key: String, value: String) {
        values[key] = value
    }

    override fun remove(key: String) {
        values.remove(key)
    }
}

/** One file per key in a private directory. */
class FileKeyValueStore(private val dir: File) : KeyValueStore {

    init {
        runCatching { dir.mkdirs() }
    }

    private fun file(key: String) = File(dir, key)

    override fun read(key: String): String? =
        runCatching { file(key).takeIf { it.exists() }?.readText() }.getOrNull()

    override fun write(key: String, value: String) {
        runCatching { file(key).writeText(value) }
    }

    override fun remove(key: String) {
        runCatching { file(key).delete() }
    }
}
