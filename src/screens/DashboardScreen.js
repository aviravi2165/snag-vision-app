import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheGet } from '../data/cache';
import { getPhotoCountsBySpot } from '../db/localStore';
import SyncStatusBar from '../components/SyncStatusBar';

export default function DashboardScreen() {
    const [floors, setFloors] = useState([]);
    const [counts, setCounts] = useState({});

    const load = useCallback(async () => {
        const projectId = await AsyncStorage.getItem('sv_project');
        const cached = projectId ? await cacheGet(`cache:structure:${projectId}`) : null;
        setFloors(cached || []);
        setCounts(await getPhotoCountsBySpot());
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const allSpots = floors.flatMap((f) =>
        (f.rooms || []).flatMap((r) => (r.spots || []).map((s) => ({ ...s, floorName: f.FloorName, roomName: r.RoomName })))
    );
    const doneCount = allSpots.filter((s) => (counts[s.SpotId] || 0) > 0).length;

    return (
        <>
            <SyncStatusBar />
            <View style={styles.c}>
                <Text style={styles.h}>Progress</Text>
                <Text style={styles.summary}>{doneCount} / {allSpots.length} spots captured</Text>
                <FlatList
                    data={allSpots}
                    keyExtractor={(s) => s.SpotId}
                    renderItem={({ item }) => {
                        const n = counts[item.SpotId] || 0;
                        return (
                            <View style={styles.row}>
                                <Text style={styles.rowText}>{item.floorName} · {item.roomName} · {item.SpotName}</Text>
                                <Text style={[styles.badge, n > 0 ? styles.badgeDone : styles.badgePending]}>
                                    {n > 0 ? `${n} photo(s)` : 'Pending'}
                                </Text>
                            </View>
                        );
                    }}
                    ListEmptyComponent={<Text style={styles.rowText}>No cached floor plan yet — open Capture once online first.</Text>}
                />
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    c: { flex: 1, backgroundColor: '#0e0f12', padding: 16 },
    h: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
    summary: { color: '#9aa0aa', marginBottom: 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#16181d', borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#2a2e37' },
    rowText: { color: '#e8eaed', flex: 1, marginRight: 8 },
    badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
    badgeDone: { color: '#fff', backgroundColor: '#4fae5e' },
    badgePending: { color: '#fff', backgroundColor: '#D92906' },
}); 