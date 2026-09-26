package app.revisio.engine

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** What survives a restart: the long-lived refresh token and who it belongs to. */
@Serializable
data class StoredSession(val refreshToken: String, val user: ApiUser)

/**
 * The session that outlives the process.
 *
 * Only the refresh token is durable; the access token is short-lived and lives
 * in memory. Keeping the user here too is what lets the app open *offline* to a
 * greeting with the learner's name rather than a sign-in form — the one thing
 * that makes the offline launch feel like an app instead of a locked door.
 */
class SessionStore(
    private val kv: KeyValueStore,
    private val json: Json = EngineJson,
) {
    private val key = "revisio.session.v1"

    fun save(session: AuthSession) {
        val refresh = session.refreshToken ?: return
        runCatching { kv.write(key, json.encodeToString(StoredSession.serializer(), StoredSession(refresh, session.user))) }
    }

    fun load(): StoredSession? {
        val raw = kv.read(key) ?: return null
        return runCatching { json.decodeFromString(StoredSession.serializer(), raw) }.getOrNull()
    }

    fun clear() {
        kv.remove(key)
    }
}
