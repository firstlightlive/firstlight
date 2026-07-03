import Foundation
import WidgetKit

/// Shared timeline machinery — both widgets render from WidgetSnapshot.json
/// (written by the app on every mutation; app calls reloadAllTimelines()).
/// Entries every 15 min for 6h keep relative state fresh between app pokes.
struct SnapshotEntry: TimelineEntry {
    let date: Date
    let snap: WidgetSnapshot
    var relevance: TimelineEntryRelevance? {
        // surface in the Smart Stack when a block is live
        snap.blockName != nil ? TimelineEntryRelevance(score: 80) : TimelineEntryRelevance(score: 20)
    }
}

struct SnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snap: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snap: WidgetSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let snap = WidgetSnapshot.load()
        let now = Date()
        let entries = (0..<24).map { i in
            SnapshotEntry(date: now.addingTimeInterval(TimeInterval(i) * 15 * 60), snap: snap)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}
