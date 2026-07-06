import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { runSync, onSyncProgress, getQueueSummary } from '../sync/syncEngine';

export default function SyncStatusBar() {
    const [summary, setSummary] = useState({ pending: 0, uploading: 0, done: 0, failed: 0 });
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState('');

    const refresh = useCallback(async () => {
        const rows = await getQueueSummary();
        const next = { pending: 0, uploading: 0, done: 0, failed: 0 };
        rows.forEach((r) => { next[r.status] = r.count; });
        setSummary(next);
    }, []);

    useEffect(() => {
        refresh();
        return onSyncProgress((e) => {
            if (e.type === 'start') { setSyncing(true); setMessage(`Uploading 0/${e.total}`); }
            if (e.type === 'progress') setMessage(`Uploading ${e.done + e.failed + 1}/${e.total}`);
            if (e.type === 'offline') setMessage('No network — connect to WiFi to sync');
            if (e.type === 'offline-mid-sync') setMessage('Lost connection — will resume automatically');
            if (e.type === 'complete') {
                setSyncing(false);
                setMessage(e.failed > 0 ? `${e.failed} failed, will retry next sync` : 'All photos uploaded');
                refresh();
            }
        });
    }, [refresh]);

    const pendingTotal = summary.pending + summary.uploading + summary.failed;
    return (
        <View style={styles.bar}>
            <Text style={styles.text}>{pendingTotal > 0 ? `${pendingTotal} photo(s) waiting to upload` : 'All photos synced'}</Text>
            {message ? <Text style={styles.sub}>{message}</Text> : null}
            <TouchableOpacity style={[styles.btn, (syncing || pendingTotal === 0) && { opacity: 0.5 }]} disabled={syncing || pendingTotal === 0} onPress={runSync}>
                {syncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sync now</Text>}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: { backgroundColor: '#16181d', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2e37', marginBottom: 16 },
    text: { color: '#fff', fontWeight: '700', marginBottom: 4 },
    sub: { color: '#9aa0aa', fontSize: 12, marginBottom: 10 },
    btn: { backgroundColor: '#D92906', paddingVertical: 10, borderRadius: 8 },
    btnText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
});