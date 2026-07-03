import Foundation

/// All day/time math is pinned to IST (Asia/Kolkata) — never the device
/// timezone — mirroring the server's enforce_history_lock() semantics.
enum FLDate {
    static let istTimeZone = TimeZone(identifier: "Asia/Kolkata")!

    static var istCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = istTimeZone
        return cal
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = istTimeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    static func dayString(_ date: Date = Date()) -> String {
        dayFormatter.string(from: date)
    }

    /// Current IST wall-clock minutes since midnight (e.g. 04:17 → 257).
    static func istMinutesNow(_ now: Date = Date()) -> Int {
        let c = istCalendar.dateComponents([.hour, .minute], from: now)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    /// Effective editable day: before 3:00 AM IST, yesterday is still open
    /// (server grace window). `date` for a tick is ALWAYS captured at tap time.
    static func effectiveToday(_ now: Date = Date()) -> String {
        let hour = istCalendar.component(.hour, from: now)
        if hour < 3, let yesterday = istCalendar.date(byAdding: .day, value: -1, to: now) {
            return dayString(yesterday)
        }
        return dayString(now)
    }

    static func graceActive(_ now: Date = Date()) -> Bool {
        istCalendar.component(.hour, from: now) < 3
    }

    /// IST weekday for the EFFECTIVE day. 1 = Sunday … 7 = Saturday.
    static func effectiveWeekday(_ now: Date = Date()) -> Int {
        let hour = istCalendar.component(.hour, from: now)
        let ref = (hour < 3) ? (istCalendar.date(byAdding: .day, value: -1, to: now) ?? now) : now
        return istCalendar.component(.weekday, from: ref)
    }

    static func isWeekendDay(_ now: Date = Date()) -> Bool {
        let wd = effectiveWeekday(now)
        return wd == 1 || wd == 7
    }

    static func isSaturday(_ now: Date = Date()) -> Bool { effectiveWeekday(now) == 7 }
    static func isSunday(_ now: Date = Date()) -> Bool { effectiveWeekday(now) == 1 }

    /// "HH:MM" → minutes since midnight.
    static func minutes(from time24: String) -> Int {
        let parts = time24.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return 0 }
        return h * 60 + m
    }

    /// Auto period by IST clock: <11:00 morning, 11:00–17:44 midday, ≥17:45 evening.
    /// Boundaries sit inside schedule gaps.
    /// During the 00:00–03:00 grace window the effective day is YESTERDAY, so
    /// the period is yesterday's EVENING (backfill) — never tomorrow-morning's
    /// items filed onto the old date (review fix: grace mis-attribution).
    static func autoPeriod(_ now: Date = Date()) -> Period {
        if graceActive(now) { return .evening }
        let mins = istMinutesNow(now)
        if mins < 11 * 60 { return .morning }
        if mins < 17 * 60 + 45 { return .midday }
        return .evening
    }

    /// Chapter 2 ENDURANCE day number (Day 1 = 2026-06-20 IST).
    static func chapterDay(_ now: Date = Date()) -> Int {
        let f = dayFormatter
        guard let start = f.date(from: "2026-06-20"), let today = f.date(from: effectiveToday(now)) else { return 0 }
        let days = istCalendar.dateComponents([.day], from: start, to: today).day ?? 0
        return days + 1
    }
}

// MARK: - NOW cursor engine

enum HeroState: Equatable {
    case live(RitualDef)          // item window is now (block start ≤ now+10min)
    case upcoming(RitualDef, startsInMin: Int)
    case gap(name: String, nextBlockName: String, nextBlockTime: String)
    case periodDone(done: Int, total: Int)
    case periodClosed(done: Int, total: Int)  // window over, incomplete — honest, not celebratory
}

enum CursorEngine {
    /// Spec §2.2: sort the period's ACTIVE PENDING items chronologically;
    /// cursor = first pending whose block start ≤ now+10min, else first future
    /// pending (UPCOMING), else PERIOD_DONE. Skipped items round-robin to the
    /// end of their block's pending set.
    static func hero(seed: SeedCatalog, period: Period, completed: Set<String>,
                     skipped: Set<String>, now: Date = Date(), isSunday: Bool) -> HeroState {
        let blocks = seed.blocks(for: period)
        // m_earthing is tickable on Sundays only (active:false otherwise)
        func isTickable(_ item: RitualDef) -> Bool {
            if item.active { return true }
            return item.id == "m_earthing" && isSunday
        }
        let allTickable = blocks.flatMap(\.items).filter(isTickable)
        // The NOW cursor walks REQUIRED (active) items only — an optional
        // Sunday m_earthing must not hold the hero hostage at 27/27; it stays
        // tickable from the checklist (review fix).
        let pending = allTickable.filter { $0.active && !completed.contains($0.id) }
        let doneCount = allTickable.filter { $0.active && completed.contains($0.id) }.count
        // denominator: active-only (m_earthing never counts even on Sunday — web parity)
        let activeTotal = seed.totalActive(for: period)

        if pending.isEmpty {
            return .periodDone(done: min(doneCount, activeTotal), total: activeTotal)
        }

        let nowMin = FLDate.istMinutesNow(now)
        let blockStart: [String: Int] = Dictionary(uniqueKeysWithValues: blocks.map { ($0.id, FLDate.minutes(from: $0.start24)) })
        func startOfBlock(containing item: RitualDef) -> Int {
            for b in blocks where b.items.contains(where: { $0.id == item.id }) { return blockStart[b.id] ?? 0 }
            return 0
        }

        // Round-robin: prefer non-skipped pending; fall back to skipped ones.
        let ordered = pending.sorted { FLDate.minutes(from: $0.time24) < FLDate.minutes(from: $1.time24) }
        let firstChoice = ordered.first { !skipped.contains($0.id) } ?? ordered.first

        guard let candidate = firstChoice else {
            return .periodDone(done: min(doneCount, activeTotal), total: activeTotal)
        }

        let cStart = startOfBlock(containing: candidate)
        if cStart <= nowMin + 10 {
            // Are we in a gap? (candidate's block start is well past AND next block far away)
            return .live(candidate)
        }

        // Candidate is in the future — is there a named gap right now?
        if let gapInfo = currentGap(blocks: blocks, period: period, nowMin: nowMin, nextStart: cStart) {
            let nextBlock = blocks.first { (blockStart[$0.id] ?? 0) == cStart }
            return .gap(name: gapInfo,
                        nextBlockName: nextBlock?.shortName ?? candidate.title,
                        nextBlockTime: nextBlock?.start24 ?? candidate.time24)
        }
        return .upcoming(candidate, startsInMin: max(0, cStart - nowMin))
    }

    /// Named schedule gaps (fact of the timetable, shown on the GAP card).
    private static func currentGap(blocks: [RitualBlock], period: Period, nowMin: Int, nextStart: Int) -> String? {
        guard nextStart - nowMin > 15 else { return nil }
        switch period {
        case .morning:
            // 04:35–07:00 = RUN + GYM
            if nowMin >= 4 * 60 + 35 && nowMin < 7 * 60 { return "RUN + GYM" }
            return nowMin >= 8 * 60 + 10 ? "DEEP WORK" : nil
        case .midday:
            return "DEEP WORK"
        case .evening:
            return nil
        case .weekend:
            return nil
        }
    }
}
