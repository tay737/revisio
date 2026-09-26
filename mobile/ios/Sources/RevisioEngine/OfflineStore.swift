import Foundation

/// The storage seam, so the engine runs and is tested without a device.
public protocol KeyValueStore {
    func read(_ key: String) -> String?
    func write(_ key: String, _ value: String)
    func remove(_ key: String)
}

public final class MemoryKeyValueStore: KeyValueStore {
    private var values: [String: String] = [:]
    public init() {}
    public func read(_ key: String) -> String? { values[key] }
    public func write(_ key: String, _ value: String) { values[key] = value }
    public func remove(_ key: String) { values.removeValue(forKey: key) }
}

/// One file per key in a private directory.
public final class FileKeyValueStore: KeyValueStore {
    private let directory: URL

    public init(directory: URL) {
        self.directory = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func url(_ key: String) -> URL { directory.appendingPathComponent(key) }

    public func read(_ key: String) -> String? { try? String(contentsOf: url(key), encoding: .utf8) }

    public func write(_ key: String, _ value: String) {
        try? value.write(to: url(key), atomically: true, encoding: .utf8)
    }

    public func remove(_ key: String) { try? FileManager.default.removeItem(at: url(key)) }
}

/// The single owner of everything offline: the cached pack and the outbox.
public final class OfflineStore {
    private let kv: KeyValueStore
    private let packKey = "revisio.offline.pack.v1"
    private let outboxKey = "revisio.offline.outbox.v1"
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(_ kv: KeyValueStore) { self.kv = kv }

    // ── the cached session ──────────────────────────────────────────────────

    public func savePack(_ pack: OfflinePack) {
        if let data = try? encoder.encode(pack), let text = String(data: data, encoding: .utf8) {
            kv.write(packKey, text)
        }
    }

    public func cachedPack() -> OfflinePack? {
        guard let raw = kv.read(packKey), let data = raw.data(using: .utf8),
              let pack = try? decoder.decode(OfflinePack.self, from: data) else { return nil }
        return pack.cards.isEmpty ? nil : pack
    }

    public func clearPack() { kv.remove(packKey) }

    /// Remove a card once the server has accepted a review of it, so coming back
    /// offline cannot deal a card that was already answered.
    public func dropCardFromPack(_ cardId: String) {
        guard let pack = cachedPack() else { return }
        let remaining = pack.cards.filter { $0.id != cardId }
        if remaining.count == pack.cards.count { return }
        savePack(OfflinePack(cards: remaining, builtAt: pack.builtAt))
    }

    // ── the outbox ──────────────────────────────────────────────────────────

    public func pendingReviews() -> [PendingReview] {
        guard let raw = kv.read(outboxKey), let data = raw.data(using: .utf8),
              let list = try? decoder.decode([PendingReview].self, from: data) else { return [] }
        return list
    }

    public func pendingCount() -> Int { pendingReviews().count }

    @discardableResult
    public func enqueueReview(
        cardId: String,
        answer: String?,
        selectedOptionId: String?,
        durationMs: Int,
        mode: String = "daily"
    ) -> PendingReview {
        let entry = PendingReview(
            id: "\(cardId):\(Int(Date().timeIntervalSince1970 * 1000)):\(UUID().uuidString.prefix(6))",
            cardId: cardId,
            answer: answer,
            selectedOptionId: selectedOptionId,
            durationMs: durationMs,
            mode: mode,
            queuedAt: ISO8601DateFormatter().string(from: Date())
        )
        write(pendingReviews() + [entry])
        return entry
    }

    public func dropReview(_ id: String) {
        write(pendingReviews().filter { $0.id != id })
    }

    private func write(_ list: [PendingReview]) {
        if let data = try? encoder.encode(list), let text = String(data: data, encoding: .utf8) {
            kv.write(outboxKey, text)
        }
    }
}

/// What survives a restart: the long-lived refresh token and who it belongs to.
public struct StoredSession: Codable {
    public var refreshToken: String
    public var user: ApiUser
}

public final class SessionStore {
    private let kv: KeyValueStore
    private let key = "revisio.session.v1"

    public init(_ kv: KeyValueStore) { self.kv = kv }

    public func save(_ session: AuthSession) {
        guard let refresh = session.refreshToken else { return }
        let stored = StoredSession(refreshToken: refresh, user: session.user)
        if let data = try? JSONEncoder().encode(stored), let text = String(data: data, encoding: .utf8) {
            kv.write(key, text)
        }
    }

    public func load() -> StoredSession? {
        guard let raw = kv.read(key), let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }

    public func clear() { kv.remove(key) }
}

/// How a sync went: what the server took, and what is still owed.
public struct SyncOutcome {
    public let sent: Int
    public let remaining: Int
}
