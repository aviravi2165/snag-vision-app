// import * as FileSystem from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

// Fixed by the camera itself once your phone joins its WiFi AP — same for all X-series.
const CAMERA_BASE = 'http://192.168.42.1';

async function post(path, body) {
    const res = await fetch(`${CAMERA_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify(body || {}),
    });
    return res.json();
}

export async function pingCamera() {
    const res = await fetch(`${CAMERA_BASE}/osc/info`);
    if (!res.ok) throw new Error('Camera not reachable');
    return res.json();
}

// Must run once after connecting — takePicture errors out otherwise.
export async function prepareImageMode() {
    return post('/osc/commands/execute', {
        name: 'camera.setOptions',
        parameters: { options: { captureMode: 'image', photoStitching: 'ondevice' } },
    });
}

// Fires the shutter, polls camera until the stitched photo is ready,
// returns the camera-hosted file URL (NOT local yet — see downloadToLocal).
export async function takePicture({ pollMs = 1000, timeoutMs = 20000 } = {}) {
    const exec = await post('/osc/commands/execute', { name: 'camera.takePicture' });
    if (exec.state === 'error') throw new Error(exec.error?.message || 'Camera error');
    if (exec.state === 'done') return exec.results._fileGroup[0];

    const id = exec.id;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const status = await post('/osc/commands/status', { id });
        if (status.state === 'done') return status.results._fileGroup[0];
        if (status.state === 'error') throw new Error(status.error?.message || 'Capture failed');
    }
    throw new Error('Capture timed out — camera may be busy or out of range');
}

// Streams the JPEG straight to disk (never buffers the whole file in JS memory —
// these stitched panoramas can be tens of MB).
export async function downloadToLocal(fileUrl, destUri) {
    const result = await FileSystem.downloadAsync(fileUrl, destUri);
    return result.uri;
}