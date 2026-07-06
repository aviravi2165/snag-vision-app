import AsyncStorage from '@react-native-async-storage/async-storage';

export async function cacheSet(key, value) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
}
export async function cacheGet(key) {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
}