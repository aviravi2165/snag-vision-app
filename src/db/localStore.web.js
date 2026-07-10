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