import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Candidate addresses, tried in order of likelihood. A hardcoded single host
// was wrong the moment the camera brand changed — Ricoh THETA in access-point
// mode is ALWAYS 192.168.1.1 (documented, not user-changeable), while the old
// value here only ever applied to other vendors' OSC implementations.
//
// Probing rather than hardcoding also covers client (CL) mode, where the
// camera joins the site router and gets an arbitrary DHCP address — that case
// still needs the manual override below, but nothing here has to change.
const KNOWN_CAMERA_HOSTS = [
    'http://192.168.1.1',    // Ricoh THETA — access-point mode (fixed by firmware)
    // 'http://192.168.42.1',   // Other OSC vendors / USB-tether style addressing
];

// Ricoh's hosted OSC simulator. Useful for testing the whole capture flow with
// no physical camera present — set it as the override via setCameraHost().
export const SIMULATOR_HOST = 'https://fake-theta.vercel.app';

const HOST_KEY = 'sv_camera_host';       // user-set override, survives restarts
const LAST_GOOD_KEY = 'sv_camera_last';  // cache so we don't re-probe every shot

let resolvedBase = null; // in-memory cache for this app session

// A plain "did it respond" check is not enough: home and site routers very
// commonly sit on 192.168.1.1 themselves and will happily answer HTTP. Only a
// real OSC camera returns /osc/info with these identity fields, so shape-check
// the body before trusting the host.
function looksLikeCamera(info) {
    return !!(info && (info.manufacturer || info.model || info.serialNumber));
}

async function probeHost(host, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${host}/osc/info`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const info = await res.json();
        if (!looksLikeCamera(info)) throw new Error('Not an OSC camera');
        return info;
    } finally {
        clearTimeout(timer);
    }
}

// Resolves as soon as ANY candidate answers, instead of waiting out the full
// timeout on each one in turn — keeps the Dashboard's 2s status check honest.
// Deliberately avoids Promise.any, which isn't guaranteed on older Hermes.
function firstResponding(hosts, timeoutMs) {
    return new Promise((resolve, reject) => {
        let remaining = hosts.length;
        let settled = false;
        // Per-host failure reasons. Without these a failed connect is just
        // "not found", which is indistinguishable between "wrong WiFi",
        // "request went out over mobile data", and "camera answered something
        // unexpected" — three very different fixes.
        const attempts = [];
        hosts.forEach((host) => {
            probeHost(host, timeoutMs)
                .then((info) => {
                    if (settled) return;
                    settled = true;
                    resolve({ host, info });
                })
                .catch((err) => {
                    const reason = err?.name === 'AbortError'
                        ? `timed out after ${timeoutMs}ms`
                        : (err?.message || String(err));
                    attempts.push(`${host} — ${reason}`);
                    remaining -= 1;
                    if (remaining === 0 && !settled) {
                        const e = new Error('Camera not reachable — check you are connected to its WiFi');
                        e.attempts = attempts;
                        reject(e);
                    }
                });
        });
    });
}

/** Manually pin the camera address (client mode, unusual networks, simulator). */
export async function setCameraHost(host) {
    const clean = host ? host.replace(/\/+$/, '') : null;
    resolvedBase = clean;
    if (clean) await AsyncStorage.setItem(HOST_KEY, clean);
    else await AsyncStorage.removeItem(HOST_KEY);
    return clean;
}

export async function getCameraHost() {
    return AsyncStorage.getItem(HOST_KEY);
}

/** The address actually in use right now — surfaced in the UI so a wrong one
 *  (e.g. a leftover simulator) is visible instead of silently guessed at. */
export function getResolvedHost() {
    return resolvedBase;
}

/** Forget BOTH the cached address and any manual override, so the next call
 *  re-discovers from scratch. Clearing only the cache (the previous
 *  behaviour) left a stale override — e.g. the simulator, set during
 *  desk testing — permanently pinned with no way to undo it from the app. */
export async function forgetCameraHost() {
    resolvedBase = null;
    await AsyncStorage.multiRemove([LAST_GOOD_KEY, HOST_KEY]);
}

// A physically-present camera must always beat a remembered address. The
// simulator is a PUBLIC url, so on a phone with mobile data still enabled it
// stays reachable even while the phone is on the camera's own (internet-less)
// WiFi — it would answer the probe and quietly serve its dummy image instead
// of the real camera sitting right there.
//
// So: probe the real camera addresses FIRST and use one if it answers. Only if
// none does do we fall back to an override or the last-known-good, which is
// what client mode (camera on the site router, arbitrary DHCP address) and
// simulator testing rely on.
async function resolveBase(timeoutMs) {
    if (resolvedBase) return resolvedBase;

    // Local addresses are on-link and answer fast; don't spend the full budget
    // here or the fallback never gets a turn.
    const localTimeout = Math.min(timeoutMs, 3000);
    let localAttempts = [];
    try {
        const { host } = await firstResponding(KNOWN_CAMERA_HOSTS, localTimeout);
        resolvedBase = host;
        await AsyncStorage.setItem(LAST_GOOD_KEY, host);
        return host;
    } catch (e) {
        localAttempts = e.attempts || [];  // kept for the error below
    }

    const override = await AsyncStorage.getItem(HOST_KEY);
    if (override) {
        resolvedBase = override;
        return override;
    }

    const lastGood = await AsyncStorage.getItem(LAST_GOOD_KEY);
    if (lastGood && !KNOWN_CAMERA_HOSTS.includes(lastGood)) {
        const { host } = await firstResponding([lastGood], timeoutMs);
        resolvedBase = host;
        return host;
    }

    const err = new Error('Camera not reachable — check you are connected to its WiFi');
    err.attempts = localAttempts;
    throw err;
}

async function post(path, body) {
    const base = await resolveBase(8000);
    const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const json = await res.json();
    // A camera-side rejection comes back as HTTP 200 with state:"error" in the
    // body. Returning it unchecked meant a failed setOptions looked like a
    // success, and the real complaint only surfaced later as a confusing
    // "disabled command" from whatever ran next.
    if (json?.state === 'error') {
        const err = new Error(json.error?.message || 'Camera rejected the command');
        err.oscCode = json.error?.code;
        throw err;
    }
    return json;
}

// Finds the camera and returns its /osc/info payload. Every other call in this
// module reuses whatever address this resolves, so callers should keep doing
// this first (CaptureScreen and DashboardScreen already do).
export async function pingCamera(timeoutMs = 8000) {
    const base = await resolveBase(timeoutMs);
    return probeHost(base, timeoutMs);
}

/** Reads back the options we care about, so we configure the camera from its
 *  actual state rather than assuming. */
export async function getCameraOptions() {
    const r = await post('/osc/commands/execute', {
        name: 'camera.getOptions',
        parameters: {
            optionNames: ['captureMode', 'photoStitching', 'photoStitchingSupport', 'captureModeSupport'],
        },
    });
    return r?.results?.options || {};
}

// Must run once after connecting — takePicture is a *disabled command* while
// the camera sits in video mode, which is the state it powers on in if that's
// how it was last used.
//
// captureMode and photoStitching are set SEPARATELY on purpose. Bundling them
// meant that if the camera didn't accept on-device stitching, the whole
// setOptions call failed — leaving the camera in video mode and producing a
// baffling "command is currently disabled" at capture time instead of an
// error naming the option it actually objected to.
export async function prepareImageMode() {
    await post('/osc/commands/execute', {
        name: 'camera.setOptions',
        parameters: { options: { captureMode: 'image' } },
    });

    // Best-effort: only worth sending where the camera advertises support, and
    // never fatal — an unstitched capture is still a capture.
    try {
        const opts = await getCameraOptions();
        const supported = opts.photoStitchingSupport;
        if (!supported || supported.includes('ondevice')) {
            await post('/osc/commands/execute', {
                name: 'camera.setOptions',
                parameters: { options: { photoStitching: 'ondevice' } },
            });
        }
    } catch { /* stitching preference is optional — carry on */ }
}

// The standard single-shot camera.takePicture command returns the file at
// results.fileUrl (confirmed against Ricoh's own OSC simulator); _fileGroup
// is used by other commands (e.g. bracket/interval shooting), not this one —
// checking both is a safe, cheap hedge against firmware/model differences.
function extractFileUrl(results) {
    const url = results?.fileUrl || results?._fileGroup?.[0];
    if (!url) throw new Error('Camera response had no file URL');
    return url;
}

// Fires the shutter, polls camera until the stitched photo is ready,
// returns the camera-hosted file URL (NOT local yet — see downloadToLocal).
export async function takePicture({ pollMs = 1000, timeoutMs = 20000 } = {}) {
    const exec = await post('/osc/commands/execute', { name: 'camera.takePicture' });
    if (exec.state === 'error') throw new Error(exec.error?.message || 'Camera error');
    if (exec.state === 'done') return extractFileUrl(exec.results);

    const id = exec.id;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const status = await post('/osc/commands/status', { id });
        if (status.state === 'done') return extractFileUrl(status.results);
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
