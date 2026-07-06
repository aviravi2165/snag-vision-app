// import * as FileSystem from 'expo-file-system';

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

const DIR = FileSystem.documentDirectory + 'siteiq_photos/';

async function ensureDir() {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

// sourceUri: temp URI from image picker or camera response
export async function savePhotoLocally(sourceUri, photoId) {
    await ensureDir();
    const destUri = `${DIR}${photoId}.jpg`;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });

    const base64 = await FileSystem.readAsStringAsync(destUri, { encoding: FileSystem.EncodingType.Base64 });
    const checksum = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);

    return { localUri: destUri, checksum };
}

export async function deletePhotoLocally(localUri) {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists) await FileSystem.deleteAsync(localUri);
}