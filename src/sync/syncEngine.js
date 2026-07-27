import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    getPendingPhotos, markUploading, markDone, markFailed, resetPhotoToPending, getUploadSummary,
    getPendingSyncSpots, getPendingDeleteSpots, markSpotSyncing, markSpotQueued, markSpotSynced,
    markSpotSyncFailed, markSpotDeleteFailed, removeLocalSpot, reassignPhotosSpotId, pruneSyncedSpots,
} from '../db/localStore';
import api, { API_BASE } from '../api/client';
import { cacheSet } from '../data/cache';
import { clearSession } from '../auth/session';

let isSyncing = false;
let listeners = [];

export function onSyncProgress(cb) {
    listeners.push(cb);
    return () => { listeners = listeners.filter((l) => l !== cb); };
}
function notify(event) { listeners.forEach((l) => l(event)); }

// createUploadTask (not the simpler uploadAsync) so we get a real per-photo
// progress callback instead of just "photo N of M" — matters most on the
// slow/flaky office WiFi this app is built for. Same multipart transport,
// same idempotent parameters, just observable mid-flight now.
async function uploadOne(photo, onProgress) {
    const token = await AsyncStorage.getItem('sv_token');
    const task = FileSystem.createUploadTask(
        `${API_BASE}/uploads/photo`,
        photo.localUri,
        {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'image',
            headers: { Authorization: `Bearer ${token}` },
            // photoId doubles as the idempotency key — if this exact upload
            // already landed on a previous attempt, the backend should
            // return the existing record instead of creating a duplicate.
            parameters: {
                photoId: photo.id,
                projectId: photo.projectId,
                roomId: photo.roomId,
                spotId: photo.spotId,
                checksum: photo.checksum || '',
            },
        },
        (data) => {
            if (onProgress && data.totalBytesExpectedToSend > 0) {
                onProgress(data.totalBytesSent / data.totalBytesExpectedToSend);
            }
        }
    );
    const result = await task.uploadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
        const err = new Error(`Upload failed (${result?.status ?? 'no response'})`);
        err.status = result?.status;
        // This goes through a raw upload task, not axios, so client.js's
        // response interceptor never sees it — do the same session cleanup
        // here so an expired token behaves identically everywhere.
        if (result?.status === 401) {
            err.isAuthExpired = true;
            await clearSession();
        }
        throw err;
    }
    return JSON.parse(result.body || '{}');
}

// A single flaky request (timeout, 502 from a waking-up server) shouldn't
// cost a photo a full sync-pass retry cycle — retry it a couple times right
// here first. 4xx responses are not retried: the request itself is wrong
// (bad token, bad ids) and retrying identical input just wastes time.
const MAX_ATTEMPTS_PER_SYNC = 3;
const RETRY_DELAY_MS = [800, 1600];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(err) {
    const status = err?.status;
    if (status === undefined || status === null) return true; // no HTTP response at all — network/timeout
    return status >= 500;
}

async function uploadWithRetry(photo, onProgress) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await uploadOne(photo, onProgress);
        } catch (e) {
            if (!isRetryable(e) || attempt >= MAX_ATTEMPTS_PER_SYNC - 1) throw e;
            await delay(RETRY_DELAY_MS[attempt] || 1600);
        }
    }
}

// A photo whose status is 'failed' across this many separate sync PASSES
// (not in-pass retries, see uploadWithRetry above) is treated as stuck —
// surfaced distinctly in the UI instead of silently retrying forever.
const STUCK_AFTER_ATTEMPTS = 3;

export async function getFailedPhotosInfo() {
    const pending = await getPendingPhotos();
    const failed = pending.filter((p) => p.status === 'failed');
    const stuck = failed.filter((p) => (p.attempts || 0) >= STUCK_AFTER_ATTEMPTS);
    return { failedCount: failed.length, stuckCount: stuck.length };
}

// NOTE: POST /mobile/spots and DELETE /mobile/spots/{id} are the backend
// contract this sync phase is built against — they don't exist on the
// server yet (backend work deliberately deferred). Until they're added,
// every spot create/delete will fail here with a 404 and stay queued
// locally as 'failed' — that's expected, not a bug in this code. Spots
// still show up immediately in the UI (see getMergedSpotsForFloor) even
// while permanently un-synced, so the app stays usable in the meantime.

async function syncSpotCreates(projectId, items) {
    const pendingCreates = await getPendingSyncSpots(projectId);
    let done = 0, failed = 0;
    const unsyncedIds = new Set(pendingCreates.map((r) => r.id));
    for (const row of pendingCreates) {
        const still = await NetInfo.fetch();
        if (!still.isConnected) break;
        await markSpotSyncing(row.id);
        try {
            const r = await api.post('/spots', {
                clientSpotId: row.id,
                roomId: row.roomId,
                name: row.name,
                coordinateX: row.coordinateX,
                coordinateY: row.coordinateY,
                sortOrder: row.sortOrder,
            });
            const remoteId = r.data.SpotId;
            await markSpotSynced(row.id, remoteId);
            // Interleaved per-spot, not batched at the end — so an
            // interruption mid-loop never leaves a photo pointing at a
            // local id whose spot already landed on the server.
            await reassignPhotosSpotId(row.id, remoteId);
            unsyncedIds.delete(row.id);
            items.push({ kind: 'spot', action: 'create', localId: row.id, remoteId, status: 'done' });
            done += 1;
        } catch (e) {
            if (e.isAuthExpired) {
                // Reverse the markSpotSyncing above so this row is picked up
                // again next time, not stuck invisible in 'syncing' forever.
                await markSpotQueued(row.id);
                return { total: pendingCreates.length, done, failed, unsyncedIds, authExpired: true };
            }
            await markSpotSyncFailed(row.id, e.message);
            items.push({ kind: 'spot', action: 'create', localId: row.id, status: 'failed', error: e.message });
            failed += 1;
        }
    }
    return { total: pendingCreates.length, done, failed, unsyncedIds };
}

async function syncSpotDeletes(projectId, items) {
    const pendingDeletes = await getPendingDeleteSpots(projectId);
    let done = 0, failed = 0;
    for (const row of pendingDeletes) {
        const still = await NetInfo.fetch();
        if (!still.isConnected) break;
        try {
            await api.delete(`/spots/${row.remoteId}`);
            await removeLocalSpot(row.id);
            items.push({ kind: 'spot', action: 'delete', localId: row.id, remoteId: row.remoteId, status: 'done' });
            done += 1;
        } catch (e) {
            if (e.isAuthExpired) {
                return { total: pendingDeletes.length, done, failed, authExpired: true };
            }
            if (e.response?.status === 404) {
                // Already gone server-side — treat as a successful delete.
                await removeLocalSpot(row.id);
                items.push({ kind: 'spot', action: 'delete', localId: row.id, remoteId: row.remoteId, status: 'done' });
                done += 1;
            } else {
                await markSpotDeleteFailed(row.id, e.message);
                items.push({ kind: 'spot', action: 'delete', localId: row.id, remoteId: row.remoteId, status: 'failed', error: e.message });
                failed += 1;
            }
        }
    }
    return { total: pendingDeletes.length, done, failed };
}

// projectId is optional for the photo phase — omit it to drain the whole
// cross-project photo queue (used by the global auto-sync-on-reconnect
// watcher). The spot-sync phase only ever runs when a projectId is passed
// (i.e. from the "Sync this project" button), since local spot rows are
// always looked up per-project.
export async function runSync(projectId) {
    if (isSyncing) return { alreadyRunning: true };
    const net = await NetInfo.fetch();
    if (!net.isConnected) { notify({ type: 'offline', projectId }); return { offline: true }; }

    isSyncing = true;
    // Guaranteed reset on the way out, even if something throws mid-loop —
    // without this, one bad photo/network hiccup could leave isSyncing stuck
    // `true` forever, silently no-op'ing every future sync tap.
    try {
        const items = [];
        let spotsResult = { total: 0, done: 0, failed: 0 };
        let unsyncedSpotIds = new Set();

        if (projectId) {
            const createResult = await syncSpotCreates(projectId, items);
            if (createResult.authExpired) {
                notify({ type: 'auth-expired', projectId });
                return { authExpired: true, spots: { total: createResult.total, done: createResult.done, failed: createResult.failed }, items };
            }
            const deleteResult = await syncSpotDeletes(projectId, items);
            if (deleteResult.authExpired) {
                notify({ type: 'auth-expired', projectId });
                return {
                    authExpired: true,
                    spots: { total: createResult.total + deleteResult.total, done: createResult.done + deleteResult.done, failed: createResult.failed + deleteResult.failed },
                    items,
                };
            }
            spotsResult = {
                total: createResult.total + deleteResult.total,
                done: createResult.done + deleteResult.done,
                failed: createResult.failed + deleteResult.failed,
            };
            unsyncedSpotIds = createResult.unsyncedIds;
            notify({ type: 'spots-complete', ...spotsResult, projectId });

            if (createResult.done > 0) {
                // Best-effort — a failed refresh here shouldn't fail the sync,
                // the newly-created spots are still visible locally regardless.
                try {
                    const r = await api.get(`/projects/${projectId}/structure`);
                    await cacheSet(`cache:structure:${projectId}`, r.data);
                    await pruneSyncedSpots(projectId);
                } catch { /* stale cache is fine, next load retries */ }
            }
        }

        const pending = await getPendingPhotos(projectId);
        // A photo captured against a spot that didn't sync this round has
        // nothing to upload against yet — skip it, don't fail it, it'll be
        // picked up automatically once its spot syncs on a later run.
        const toUpload = pending.filter((p) => !unsyncedSpotIds.has(p.spotId));
        notify({ type: 'start', total: toUpload.length, projectId });

        let done = 0, failed = 0;
        for (const photo of toUpload) {
            const still = await NetInfo.fetch();
            if (!still.isConnected) { notify({ type: 'offline-mid-sync', projectId }); break; }

            await markUploading(photo.id);
            notify({ type: 'progress', done, failed, total: toUpload.length, projectId, photoPct: 0 });
            try {
                const result = await uploadWithRetry(photo, (pct) => {
                    notify({ type: 'progress', done, failed, total: toUpload.length, projectId, photoPct: pct });
                });
                await markDone(photo.id, result.id || 'ok');
                items.push({ kind: 'photo', localId: photo.id, remoteId: result.id, status: 'done' });
                done += 1;
            } catch (e) {
                if (e.isAuthExpired) {
                    // Put it back exactly where it was — this has nothing to
                    // do with the photo itself, so it shouldn't count as a
                    // failed attempt or need a stuck-photo retry.
                    await resetPhotoToPending(photo.id);
                    notify({ type: 'auth-expired', projectId });
                    return { authExpired: true, spots: spotsResult, photos: { total: toUpload.length, done, failed }, items };
                }
                await markFailed(photo.id, e.message);
                items.push({ kind: 'photo', localId: photo.id, status: 'failed', error: e.message });
                failed += 1;
            }
        }

        notify({ type: 'complete', done, failed, total: toUpload.length, projectId });
        return {
            spots: spotsResult,
            photos: { total: toUpload.length, done, failed },
            items,
        };
    } finally {
        isSyncing = false;
    }
}

export const getQueueSummary = getUploadSummary;

// Call once at app start — auto-fires a sync whenever real connectivity returns.
export function watchConnectivityAndAutoSync() {
    return NetInfo.addEventListener((state) => { if (state.isConnected) runSync(); });
}