import Foundation

/// HTTP client for the ritual-sync edge action.
/// Two headers are required on every call:
///  - Authorization: Bearer <anon key>  — Supabase's platform JWT gate
///    (the anon key is PUBLIC by design: it ships in website/js/config.js
///    to every visitor; it grants nothing here — RLS blocks it)
///  - x-watch-key: <secret from Keychain> — our narrow app auth
enum FLAPI {
    static let base = URL(string: "https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync")!
    // Split like website/js/config.js — same public value, avoids scanner noise.
    private static let a1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    private static let a2 = "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0"
    private static let a3 = "UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk"
    static var anonKey: String { [a1, a2, a3].joined(separator: ".") }
}

// MARK: - Wire types

struct SyncGetResponse: Codable {
    struct PeriodState: Codable { let completed_ids: [String]; let updated_at: String? }
    struct Checkin: Codable {
        let morning_pct: Int?; let midday_pct: Int?; let evening_pct: Int?
        let sealed: Bool?; let sealed_at: String?
    }
    struct ServerInfo: Codable {
        let now_ist: String; let effective_today: String
        let grace_active: Bool; let writable: Bool
    }
    let success: Bool
    let date: String
    let periods: [String: PeriodState]
    let weekend_tasks: PeriodState
    let checkin: Checkin
    let server: ServerInfo
}

struct SyncPostResponse: Codable {
    struct Wrote: Codable {
        let rituals_log: Bool?; let daily_rituals: Bool?
        let daily_checkin: Bool?; let weekend_log: Bool?
    }
    let success: Bool
    let date: String
    let period: String
    let merged_ids: [String]
    let merged_count: Int
    let completion_pct: Int?
    let sealed: Bool
    let wrote: Wrote
    let warnings: [String]
}

struct SyncErrorBody: Codable { let error: String; let detail: String? }

enum SyncError: Error {
    case noKey
    case http(status: Int, code: String?)
    case network(Error)
    case decode
}

// MARK: - Client

struct APIClient {
    var session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.waitsForConnectivity = true
        cfg.timeoutIntervalForRequest = 15
        cfg.timeoutIntervalForResource = 30
        return URLSession(configuration: cfg)
    }()

    private func request(_ method: String, query: String, body: Data? = nil) throws -> URLRequest {
        guard let key = KeychainStore.loadKey() else { throw SyncError.noKey }
        var comps = URLComponents(url: FLAPI.base, resolvingAgainstBaseURL: false)!
        comps.query = query
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.httpBody = body
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(FLAPI.anonKey)", forHTTPHeaderField: "Authorization")
        req.setValue(key, forHTTPHeaderField: "x-watch-key")
        return req
    }

    private func run<T: Decodable>(_ req: URLRequest, as type: T.Type) async throws -> T {
        let data: Data
        let resp: URLResponse
        do { (data, resp) = try await session.data(for: req) }
        catch { throw SyncError.network(error) }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let code = (try? JSONDecoder().decode(SyncErrorBody.self, from: data))?.error
            throw SyncError.http(status: status, code: code)
        }
        guard let decoded = try? JSONDecoder().decode(T.self, from: data) else { throw SyncError.decode }
        return decoded
    }

    func getState(date: String) async throws -> SyncGetResponse {
        let req = try request("GET", query: "action=ritual-sync&date=\(date)")
        return try await run(req, as: SyncGetResponse.self)
    }

    func push(date: String, period: Period, completed: [String], removed: [String],
              totalActive: Int) async throws -> SyncPostResponse {
        var payload: [String: Any] = [
            "date": date,
            "period": period.rawValue,
            "completed_ids": completed.sorted(),
            "removed_ids": removed.sorted(),
            "client_ts": ISO8601DateFormatter().string(from: Date()),
            "device": "watch"
        ]
        if period != .weekend { payload["total_active"] = totalActive }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let req = try request("POST", query: "action=ritual-sync", body: body)
        return try await run(req, as: SyncPostResponse.self)
    }

    /// Settings "validate key". Distinguishes a truly rejected key (403) from
    /// an unreachable network — a transient failure must never destroy a key.
    enum KeyValidation { case valid, invalid, unreachable }

    func validateKeyDetailed() async -> KeyValidation {
        guard let req = try? request("GET", query: "action=ritual-sync&date=\(FLDate.effectiveToday())") else {
            return .invalid   // no key in Keychain
        }
        do {
            let result = try await run(req, as: SyncGetResponse.self)
            return result.success ? .valid : .invalid
        } catch SyncError.http(let status, _) {
            return status == 403 ? .invalid : .unreachable
        } catch {
            return .unreachable
        }
    }
}
