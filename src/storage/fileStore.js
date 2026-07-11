// import * as FileSystem from 'expo-file-system';

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const DIR = FileSystem.documentDirectory + 'siteiq_photos/';
const MAX_EDGE = 1920;

async function ensureDir() {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

function getImageSize(uri) {
    return new Promise((resolve, reject) => {
        Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
    });
}

// Resizes down to a ~1920px long edge before upload — full-res originals
// (especially from the OSC camera) are often 3-8MB for no visible benefit
// on a floor-plan pin photo. Best-effort: any failure here (corrupt image,
// OOM on a huge original, unsupported format) just falls back to the
// original bytes rather than losing the capture.
async function resizeIfNeeded(sourceUri) {
    try {
        const { width, height } = await getImageSize(sourceUri);
        if (Math.max(width, height) <= MAX_EDGE) return sourceUri;
        const resize = width > height ? { width: MAX_EDGE } : { height: MAX_EDGE };
        const result = await manipulateAsync(sourceUri, [{ resize }], { compress: 0.85, format: SaveFormat.JPEG });
        return result.uri;
    } catch {
        return sourceUri;
    }
}

// sourceUri: temp URI from image picker or camera response
export async function savePhotoLocally(sourceUri, photoId) {
    await ensureDir();
    const destUri = `${DIR}${photoId}.jpg`;
    const resizedUri = await resizeIfNeeded(sourceUri);
    // Copy happens after resizing, so the checksum below covers exactly the
    // bytes that end up uploaded.
    await FileSystem.copyAsync({ from: resizedUri, to: destUri });
    if (resizedUri !== sourceUri) {
        await FileSystem.deleteAsync(resizedUri, { idempotent: true });
    }

    const base64 = await FileSystem.readAsStringAsync(destUri, { encoding: FileSystem.EncodingType.Base64 });
    const checksum = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);

    return { localUri: destUri, checksum };
}

export async function deletePhotoLocally(localUri) {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) await FileSystem.deleteAsync(localUri);
}