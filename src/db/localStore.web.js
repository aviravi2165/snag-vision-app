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

export async function getPendingPhotos() {
  const all = await allPhotos();
  return all.filter((p) => p.status === 'pending' || p.status === 'failed');
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