import * as FileSystem from 'expo-file-system/legacy';

export async function ensureLocalPlanImage(floor) {
    if (!floor?.FloorPlanImageUrl || floor.FloorPlanImageUrl.startsWith('file://')) return floor;
    const dir = `${FileSystem.documentDirectory}plans/`;
    const localPath = `${dir}${floor.FloorId}.jpg`;
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) return { ...floor, FloorPlanImageUrl: localPath };
    try {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const dl = await FileSystem.downloadAsync(floor.FloorPlanImageUrl, localPath);
        return { ...floor, FloorPlanImageUrl: dl.uri };
    } catch {
        return floor; // stays remote if download fails — will retry next time online
    }
}