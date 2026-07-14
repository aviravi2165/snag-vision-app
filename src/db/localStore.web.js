import { get, set, keys, del } from 'idb-keyval';

const KEY_PREFIX = 'photo:';

export async function initDb() { return true; }

export async function insertPhoto(photo) {
  await set(KEY_PREFIX + photo.id, { ...photo, status: 'pending', attempts: 0 });
}

async function allPhotos() {
  const allKeys = (await keys()).filter((k) => String(k).startsWith(KEY_PREFIX));
  return Promise.all(allKeys.map((k) => get(k)));
}

export async function getPhotosForSpot(spotId) {
  const all = await allPhotos();
  return all.filter((p) => p.spotId === spotId);
}

export async function getPendingPhotos(projectId) {
  const all = await allPhotos();
  return all.filter((p) => (p.status === 'pending' || p.status === 'failed') && (!projectId || p.projectId === projectId));
}

export async function markUploading(id) {
  const p = await get(KEY_PREFIX + id);
  await set(KEY_PREFIX + id, { ...p, status: 'uploading' });
}
export async function markDone(id, remoteId) {
  const p = await get(KEY_PREFIX + id);
  await set(KEY_PREFIX + id, { ...p, status: 'done', remoteId });
}
export async function markFailed(id, errorMsg) {
  const p = await get(KEY_PREFIX + id);
  await set(KEY_PREFIX + id, { ...p, status: 'failed', attempts: (p.attempts || 0) + 1, lastError: errorMsg });
}

export async function getUploadSummary() {
  const all = await allPhotos();
  const counts = {};
  all.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}
export async function getPhotoCountsBySpot() { 
  const all = await allPhotos();
  const map = {};
  all.forEach((p) => { map[p.spotId] = (map[p.spotId] || 0) + 1; });
  return map;
} 

export async function getPhotosForProject(projectId) {
  const all = (await allPhotos()).filter((p) => p.projectId === projectId);
  return all.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
}

export async function getSyncSummaryByProject() {
  const all = await allPhotos();
  const map = {};
  all.forEach((p) => {
    if (!map[p.projectId]) map[p.projectId] = { pending: 0, uploading: 0, done: 0, failed: 0 };
    map[p.projectId][p.status] = (map[p.projectId][p.status] || 0) + 1;
  });
  return map;
}

export async function getProjectSyncSummary(projectId) {
  const all = (await allPhotos()).filter((p) => p.projectId === projectId);
  const summary = { pending: 0, uploading: 0, done: 0, failed: 0 };
  all.forEach((p) => { summary[p.status] = (summary[p.status] || 0) + 1; });
  return summary;
}

export async function getLastActivityByProject() {
  const all = await allPhotos();
  const map = {};
  all.forEach((p) => { map[p.projectId] = Math.max(map[p.projectId] || 0, p.capturedAt || 0); });
  return map;
}

// ── Offline-first spot management (web parity, see localStore.js for the
// native/SQLite version and full comments) ──────────────────────────────────
const SPOT_PREFIX = 'spot:';

async function allSpots() {
  const allKeys = (await keys()).filter((k) => String(k).startsWith(SPOT_PREFIX));
  return Promise.all(allKeys.map((k) => get(k)));
}

export async function insertLocalSpot({ id, projectId, roomId, name, coordinateX, coordinateY, sortOrder }) {
  await set(SPOT_PREFIX + id, {
    id, projectId, roomId, name, coordinateX, coordinateY, sortOrder,
    createdAt: Date.now(), syncStatus: 'pending', remoteId: null, pendingDelete: 0, attempts: 0, lastError: null,
  });
}

export async function getLocalSpotsForProject(projectId) {
  const all = await allSpots();
  return all.filter((s) => s.projectId === projectId);
}

export async function queueSpotDelete(spot, projectId) {
  if (spot._localId) {
    const row = await get(SPOT_PREFIX + spot._localId);
    if (row && !row.remoteId) {
      await del(SPOT_PREFIX + spot._localId);
    } else if (row) {
      await set(SPOT_PREFIX + spot._localId, { ...row, pendingDelete: 1 });
    }
    return;
  }
  await set(SPOT_PREFIX + spot.SpotId, {
    id: spot.SpotId, projectId, roomId: spot.RoomId, name: spot.SpotName,
    coordinateX: spot.CoordinateX, coordinateY: spot.CoordinateY, sortOrder: spot.SortOrder,
    createdAt: Date.now(), syncStatus: 'synced', remoteId: spot.SpotId, pendingDelete: 1, attempts: 0, lastError: null,
  });
}

export async function getPendingSyncSpots(projectId) {
  const all = await getLocalSpotsForProject(projectId);
  return all.filter((s) => !s.pendingDelete && (s.syncStatus === 'pending' || s.syncStatus === 'failed'));
}

export async function getPendingDeleteSpots(projectId) {
  const all = await getLocalSpotsForProject(projectId);
  return all.filter((s) => s.pendingDelete && s.remoteId);
}

export async function markSpotSyncing(id) {
  const s = await get(SPOT_PREFIX + id);
  await set(SPOT_PREFIX + id, { ...s, syncStatus: 'syncing' });
}
export async function markSpotSynced(id, remoteId) {
  const s = await get(SPOT_PREFIX + id);
  await set(SPOT_PREFIX + id, { ...s, syncStatus: 'synced', remoteId });
}
export async function markSpotSyncFailed(id, errorMsg) {
  const s = await get(SPOT_PREFIX + id);
  await set(SPOT_PREFIX + id, { ...s, syncStatus: 'failed', attempts: (s.attempts || 0) + 1, lastError: errorMsg });
}
export async function markSpotDeleteFailed(id, errorMsg) {
  const s = await get(SPOT_PREFIX + id);
  await set(SPOT_PREFIX + id, { ...s, attempts: (s.attempts || 0) + 1, lastError: errorMsg });
}
export async function removeLocalSpot(id) {
  await del(SPOT_PREFIX + id);
}
export async function pruneSyncedSpots(projectId) {
  const all = await getLocalSpotsForProject(projectId);
  await Promise.all(all.filter((s) => s.syncStatus === 'synced' && !s.pendingDelete).map((s) => del(SPOT_PREFIX + s.id)));
}

export async function reassignPhotosSpotId(oldSpotId, newSpotId) {
  const all = await allPhotos();
  await Promise.all(
    all.filter((p) => p.spotId === oldSpotId).map((p) => set(KEY_PREFIX + p.id, { ...p, spotId: newSpotId }))
  );
}

export async function getMergedSpotsForFloor(floor, projectId) {
  if (!floor) return floor;
  const localRows = await getLocalSpotsForProject(projectId);
  const deletedRemoteIds = new Set(localRows.filter((r) => r.pendingDelete && r.remoteId).map((r) => r.remoteId));
  const pendingByRoom = {};
  localRows
    .filter((r) => !r.pendingDelete && r.syncStatus !== 'synced')
    .forEach((r) => {
      if (!pendingByRoom[r.roomId]) pendingByRoom[r.roomId] = [];
      pendingByRoom[r.roomId].push({
        SpotId: r.id, SpotName: r.name, RoomId: r.roomId,
        CoordinateX: r.coordinateX, CoordinateY: r.coordinateY, SortOrder: r.sortOrder,
        _localId: r.id, _pendingSync: true,
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

export async function getMergedStructureForProject(floors, projectId) {
  if (!floors) return floors;
  return Promise.all(floors.map((f) => getMergedSpotsForFloor(f, projectId)));
}