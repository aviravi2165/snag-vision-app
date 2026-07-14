import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { onSyncProgress, getQueueSummary } from '../sync/syncEngine';
import { colors, fonts, radius } from '../theme';

// The global "sync everything" button used to live here. Now that every
// project has its own scoped Sync button (uploads only that project's
// photos — less load, lets a worker choose order), this bar is just a
// live status readout. runSync() with no args still works for a future
// global-sync entry point elsewhere; nothing here calls it anymore.
export default function SyncStatusBar() {
    const [summary, setSummary] = useState({ pending: 0, uploading: 0, done: 0, failed: 0 });
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
            if (e.type === 'start') setMessage(`Uploading 0/${e.total}`);
            if (e.type === 'progress') setMessage(`Uploading ${e.done + e.failed + 1}/${e.total}`);
            if (e.type === 'offline') setMessage('No network — connect to WiFi to sync');
            if (e.type === 'offline-mid-sync') setMessage('Lost connection — will resume automatically');
            if (e.type === 'complete') {
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
        </View>
    );
}

const styles = StyleSheet.create({
    bar: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 14, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    text: { color: colors.text, fontWeight: '700', fontFamily: fonts.heading },
    sub: { color: colors.textMuted, fontSize: 12, marginTop: 4, fontFamily: fonts.body },
});