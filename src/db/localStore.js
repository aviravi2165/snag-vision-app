import * as SQLite from 'expo-sqlite';
import { deletePhotoLocally } from '../storage/fileStore';

let db;

// expo-sqlite on Android throws a native NullPointerException
// ("NativeDatabase.prepareAsync ... rejected") when two statements are
// prepared on the same connection at once. Screens (Dashboard, SyncStatusBar,
// Capture) all query this db independently, so funnel every call through one
// chain to guarantee they never overlap.
let queue = Promise.resolve();
function serialized(fn) {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
}

export async function initDb() {
    db = await SQLite.openDatabaseAsync('siteiq.db');
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      roomId TEXT NOT NULL,
      spotId TEXT NOT NULL,
      localUri TEXT NOT NULL,
      checksum TEXT,
      capturedAt INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      remoteId TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);
    CREATE INDEX IF NOT EXISTS idx_photos_spot ON photos(spotId);
    CREATE TABLE IF NOT EXISTS spots (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      roomId TEXT NOT NULL,
      name TEXT NOT NULL,
      coordinateX REAL NOT NULL,
      coordinateY REAL NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL,
      syncStatus TEXT NOT NULL DEFAULT 'pending',
      remoteId TEXT,
      pendingDelete INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_spots_room ON spots(roomId);
    CREATE INDEX IF NOT EXISTS idx_spots_project ON spots(projectId);
  `);
    return db;
}

// Only one photo may exist locally per spot at a time — a recapture
// replaces whatever was there before (deleting its file and row) rather
// than adding another. This is local-only: if the old photo had already
// synced, that upload stays on the server untouched (full history there),
// this just governs what's queued/shown on the phone.
export async function insertPhoto({ id, projectId, roomId, spotId, localUri, checksum }) {
    await serialized(async () => {
        const existing = await db.getAllAsync(`SELECT * FROM photos WHERE spotId = ?`, [spotId]);
        for (const old of existing) {
            await deletePhotoLocally(old.localUri);
        }
        await db.runAsync(`DELETE FROM photos WHERE spotId = ?`, [spotId]);
        await db.runAsync(
            `INSERT INTO photos (id, projectId, roomId, spotId, localUri, checksum, capturedAt, status, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
            [id, projectId, roomId, spotId, localUri, checksum, Date.now()]
        );
    });
}

export async function getPhotosForSpot(spotId) {
    return serialized(() => db.getAllAsync(`SELECT * FROM photos WHERE spotId = ? ORDER BY capturedAt`, [spotId]));
}

export async function getPendingPhotos(projectId) {
    if (projectId) {
        return serialized(() => db.getAllAsync(
            `SELECT * FROM photos WHERE status IN ('pending', 'failed') AND projectId = ? ORDER BY capturedAt`,
            [projectId]
        ));
    }
    return serialized(() => db.getAllAsync(
        `SELECT * FROM photos WHERE status IN ('pending', 'failed') ORDER BY capturedAt`
    ));
}

export async function markUploading(id) {
    await serialized(() => db.runAsync(`UPDATE photos SET status = 'uploading' WHERE id = ?`, [id]));
}

export async function markDone(id, remoteId) {
    await serialized(() => db.runAsync(`UPDATE photos SET status = 'done', remoteId = ? WHERE id = ?`, [remoteId, id]));
}

export async function markFailed(id, errorMsg) {
    await serialized(() => db.runAsync(
        `UPDATE photos SET status = 'failed', attempts = attempts + 1, lastError = ? WHERE id = ?`,
        [errorMsg, id]
    ));
}

export async function getUploadSummary() {
    return serialized(() => db.getAllAsync(
        `SELECT status, COUNT(*) as count FROM photos GROUP BY status`
    ));
}

export async function getPhotoCountsBySpot() {
  const rows = await serialized(() => db.getAllAsync(`SELECT spotId, COUNT(*) as count FROM photos GROUP BY spotId`));
  const map = {};
  rows.forEach((r) => { map[r.spotId] = r.count; });
  return map;
}

export async function getPhotosForProject(projectId) {
    return serialized(() => db.getAllAsync(
        `SELECT * FROM photos WHERE projectId = ? ORDER BY capturedAt DESC`,
        [projectId]
    ));
}

// One grouped query instead of one getProjectSyncSummary() call per project —
// used by the Dashboard, which needs every project's breakdown at once.
export async function getSyncSummaryByProject() {
    const rows = await serialized(() => db.getAllAsync(
        `SELECT projectId, status, COUNT(*) as count FROM photos GROUP BY projectId, status`
    ));
    const map = {};
    rows.forEach((r) => {
        if (!map[r.projectId]) map[r.projectId] = { pending: 0, uploading: 0, done: 0, failed: 0 };
        map[r.projectId][r.status] = r.count;
    });
    return map;
}

export async function getProjectSyncSummary(projectId) {
    const rows = await serialized(() => db.getAllAsync(
        `SELECT status, COUNT(*) as count FROM photos WHERE projectId = ? GROUP BY status`,
        [projectId]
    ));
    const summary = { pending: 0, uploading: 0, done: 0, failed: 0 };
    rows.forEach((r) => { summary[r.status] = r.count; });
    return summary;
}

// Drives "sort by latest updated" on the Projects screen — a project a worker
// captured photos for five minutes ago should sort above one untouched for days.
export async function getLastActivityByProject() {
    const rows = await serialized(() => db.getAllAsync(
        `SELECT projectId, MAX(capturedAt) as last FROM photos GROUP BY projectId`
    ));
    const map = {};
    rows.forEach((r) => { map[r.projectId] = r.last; });
    return map;
}

// ── Offline-first spot management ───────────────────────────────────────────
// Spots created/deleted at a site with no WiFi live here until the next sync.
// photos.spotId can point at a row here (still local-only) as freely as it
// points at a real server spot id — see reassignPhotosSpotId, which the sync
// engine calls the moment a spot lands on the server so photos captured
// against it resolve to the real id before they themselves upload.

export async function insertLocalSpot({ id, projectId, roomId, name, coordinateX, coordinateY, sortOrder }) {
    await serialized(() => db.runAsync(
        `INSERT INTO spots (id, projectId, roomId, name, coordinateX, coordinateY, sortOrder, createdAt, syncStatus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [id, projectId, roomId, name, coordinateX, coordinateY, sortOrder, Date.now()]
    ));
}

export async function getLocalSpotsForProject(projectId) {
    return serialized(() => db.getAllAsync(`SELECT * FROM spots WHERE projectId = ?`, [projectId]));
}

// Single entry point the UI calls for every delete — branches on whether the
// spot ever made it to the server so the caller never has to know the rules.
export async function queueSpotDelete(spot, projectId) {
    if (spot._localId) {
        const row = await serialized(() => db.getFirstAsync(`SELECT * FROM spots WHERE id = ?`, [spot._localId]));
        if (row && !row.remoteId) {
            // Never synced — nothing on the server to delete, just forget it.
            await serialized(() => db.runAsync(`DELETE FROM spots WHERE id = ?`, [spot._localId]));
        } else {
            await serialized(() => db.runAsync(`UPDATE spots SET pendingDelete = 1 WHERE id = ?`, [spot._localId]));
        }
        return;
    }
    // A server-known spot with no local row (created before this table
    // existed, or already pruned after a previous sync) — insert a
    // pre-synced "shim" row so the sync engine has something to queue the
    // DELETE against. Reuses the server id as the local primary key since
    // no photo will ever reference this row by a local-only id.
    await serialized(() => db.runAsync(
        `INSERT OR REPLACE INTO spots (id, projectId, roomId, name, coordinateX, coordinateY, sortOrder, createdAt, syncStatus, remoteId, pendingDelete)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, 1)`,
        [spot.SpotId, projectId, spot.RoomId, spot.SpotName, spot.CoordinateX, spot.CoordinateY, spot.SortOrder, Date.now(), spot.SpotId]
    ));
}

export async function getPendingSyncSpots(projectId) {
    return serialized(() => db.getAllAsync(
        `SELECT * FROM spots WHERE projectId = ? AND pendingDelete = 0 AND syncStatus IN ('pending', 'failed')`,
        [projectId]
    ));
}

export async function getPendingDeleteSpots(projectId) {
    return serialized(() => db.getAllAsync(
        `SELECT * FROM spots WHERE projectId = ? AND pendingDelete = 1 AND remoteId IS NOT NULL`,
        [projectId]
    ));
}

export async function markSpotSyncing(id) {
    await serialized(() => db.runAsync(`UPDATE spots SET syncStatus = 'syncing' WHERE id = ?`, [id]));
}

export async function markSpotSynced(id, remoteId) {
    await serialized(() => db.runAsync(`UPDATE spots SET syncStatus = 'synced', remoteId = ? WHERE id = ?`, [remoteId, id]));
}

export async function markSpotSyncFailed(id, errorMsg) {
    await serialized(() => db.runAsync(
        `UPDATE spots SET syncStatus = 'failed', attempts = attempts + 1, lastError = ? WHERE id = ?`,
        [errorMsg, id]
    ));
}

export async function markSpotDeleteFailed(id, errorMsg) {
    await serialized(() => db.runAsync(
        `UPDATE spots SET attempts = attempts + 1, lastError = ? WHERE id = ?`,
        [errorMsg, id]
    ));
}

export async function removeLocalSpot(id) {
    await serialized(() => db.runAsync(`DELETE FROM spots WHERE id = ?`, [id]));
}

// Safe/optional housekeeping — getMergedSpotsForFloor already dedupes a
// synced-but-not-yet-pruned row against the cached server structure by
// remoteId, so this is never a correctness dependency, just cleanup.
export async function pruneSyncedSpots(projectId) {
    await serialized(() => db.runAsync(
        `DELETE FROM spots WHERE projectId = ? AND syncStatus = 'synced' AND pendingDelete = 0`,
        [projectId]
    ));
}

export async function reassignPhotosSpotId(oldSpotId, newSpotId) {
    await serialized(() => db.runAsync(`UPDATE photos SET spotId = ? WHERE spotId = ?`, [newSpotId, oldSpotId]));
}

// Union of server-known spots (from the cached structure) and locally
// pending creates, minus anything queued for delete — the shape PlanPicker
// and CaptureScreen already expect, so callers need no changes.
export async function getMergedSpotsForFloor(floor, projectId) {
    if (!floor) return floor;
    const localRows = await getLocalSpotsForProject(projectId);
    const deletedRemoteIds = new Set(
        localRows.filter((r) => r.pendingDelete && r.remoteId).map((r) => r.remoteId)
    );
    const pendingByRoom = {};
    localRows
        .filter((r) => !r.pendingDelete && r.syncStatus !== 'synced')
        .forEach((r) => {
            if (!pendingByRoom[r.roomId]) pendingByRoom[r.roomId] = [];
            pendingByRoom[r.roomId].push({
                SpotId: r.id,
                SpotName: r.name,
                RoomId: r.roomId,
                CoordinateX: r.coordinateX,
                CoordinateY: r.coordinateY,
                SortOrder: r.sortOrder,
                _localId: r.id,
                _pendingSync: true,
            });
        });

    return {
        ...floor,
        rooms: (floor.rooms || []).map((room) => ({
            ...room,
            spots: [
                ...(room.spots || []).filter((s) => !deletedRemoteIds.has(s.SpotId)),
                ...(pendingByRoom[room.RoomId] || []),
            ],
        })),
    };
}

// Same merge as getMergedSpotsForFloor, but for every floor in a cached
// project structure at once — used anywhere that counts/lists spots across
// a whole project (Projects and Dashboard screens) rather than one floor.
export async function getMergedStructureForProject(floors, projectId) {
    if (!floors) return floors;
    return Promise.all(floors.map((f) => getMergedSpotsForFloor(f, projectId)));
}