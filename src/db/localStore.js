import * as SQLite from 'expo-sqlite';

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
  `);
    return db;
}

export async function insertPhoto({ id, projectId, roomId, spotId, localUri, checksum }) {
    await serialized(() => db.runAsync(
        `INSERT INTO photos (id, projectId, roomId, spotId, localUri, checksum, capturedAt, status, attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
        [id, projectId, roomId, spotId, localUri, checksum, Date.now()]
    ));
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