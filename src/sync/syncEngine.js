import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingPhotos, markUploading, markDone, markFailed, getUploadSummary } from '../db/localStore';
import { API_BASE } from '../api/client';

let isSyncing = false;
let listeners = [];

export function onSyncProgress(cb) {
    listeners.push(cb);
    return () => { listeners = listeners.filter((l) => l !== cb); };
}
function notify(event) { listeners.forEach((l) => l(event)); }

export const MOCK_UPLOAD = false;

async function uploadOne(photo) {
     if (MOCK_UPLOAD) {
    await new Promise((r) => setTimeout(r, 300));
    return { id: 'mock-' + photo.id };
  }
    const token = await AsyncStorage.getItem('sv_token');
    const result = await FileSystem.uploadAsync(`${API_BASE}/uploads/photo`, photo.localUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'image',
        headers: { Authorization: `Bearer ${token}` },
        // photoId doubles as the idempotency key — if this exact upload already
        // landed on a previous attempt, the backend should return the existing
        // record instead of creating a duplicate.
        parameters: {
            photoId: photo.id,
            projectId: photo.projectId,
            roomId: photo.roomId,
            spotId: photo.spotId,
            checksum: photo.checksum || '',
        },
    });
    if (result.status < 200 || result.status >= 300) throw new Error(`Upload failed (${result.status})`);
    return JSON.parse(result.body || '{}');
}

// projectId is optional — omit it to drain the whole cross-project queue
// (used by the global auto-sync-on-reconnect watcher), or pass one so a
// worker can choose which project's photos go up first.
export async function runSync(projectId) {
    if (isSyncing) return { alreadyRunning: true };
    const net = await NetInfo.fetch();
    if (!net.isConnected) { notify({ type: 'offline', projectId }); return { offline: true }; }

    isSyncing = true;
    const pending = await getPendingPhotos(projectId);
    notify({ type: 'start', total: pending.length, projectId });

    let done = 0, failed = 0;
    for (const photo of pending) {
        const still = await NetInfo.fetch();
        if (!still.isConnected) { notify({ type: 'offline-mid-sync', projectId }); break; }

        await markUploading(photo.id);
        notify({ type: 'progress', done, failed, total: pending.length, projectId });
        try {
            const result = await uploadOne(photo);
            await markDone(photo.id, result.id || 'ok');
            done += 1;
        } catch (e) {
            await markFailed(photo.id, e.message);
            failed += 1;
        }
    }

    isSyncing = false;
    notify({ type: 'complete', done, failed, total: pending.length, projectId });
    return { done, failed, total: pending.length };
}

export const getQueueSummary = getUploadSummary;

// Call once at app start — auto-fires a sync whenever real connectivity returns.
export function watchConnectivityAndAutoSync() {
    return NetInfo.addEventListener((state) => { if (state.isConnected) runSync(); });
}