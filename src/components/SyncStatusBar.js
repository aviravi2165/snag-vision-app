import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { onSyncProgress, getQueueSummary, getFailedPhotosInfo, runSync } from '../sync/syncEngine';
import { colors, fonts, radius, shadow } from '../theme';

// The global "sync everything" button used to live here. Now that every
// project has its own scoped Sync button (uploads only that project's
// photos — less load, lets a worker choose order), this bar is just a
// live status readout. runSync() with no args still works for a future
// global-sync entry point elsewhere; nothing here calls it anymore.
export default function SyncStatusBar() {
    const [summary, setSummary] = useState({ pending: 0, uploading: 0, done: 0, failed: 0 });
    const [message, setMessage] = useState('');
    const [photoPct, setPhotoPct] = useState(null); // null = no upload in flight right now
    const [failedInfo, setFailedInfo] = useState({ failedCount: 0, stuckCount: 0 });
    const [retrying, setRetrying] = useState(false);

    const refresh = useCallback(async () => {
        const rows = await getQueueSummary();
        const next = { pending: 0, uploading: 0, done: 0, failed: 0 };
        rows.forEach((r) => { next[r.status] = r.count; });
        setSummary(next);
        setFailedInfo(await getFailedPhotosInfo());
    }, []);

    const retryFailed = async () => {
        setRetrying(true);
        await runSync();
        setRetrying(false);
    };

    useEffect(() => {
        refresh();
        return onSyncProgress((e) => {
            if (e.type === 'start') { setMessage(`Uploading 0/${e.total}`); setPhotoPct(e.total > 0 ? 0 : null); }
            if (e.type === 'progress') {
                const pct = Math.round((e.photoPct || 0) * 100);
                setMessage(`Uploading ${e.done + e.failed + 1}/${e.total} — ${pct}%`);
                setPhotoPct(e.photoPct ?? 0);
            }
            if (e.type === 'walkthrough-started') {
                setMessage(e.number ? `Started Walkthrough ${e.number}` : 'Started a new walkthrough');
            }
            if (e.type === 'offline') { setMessage('No network — connect to WiFi to sync'); setPhotoPct(null); }
            if (e.type === 'offline-mid-sync') { setMessage('Lost connection — will resume automatically'); setPhotoPct(null); }
            if (e.type === 'auth-expired') { setMessage('Session expired — sign in again to continue syncing'); setPhotoPct(null); }
            if (e.type === 'complete') {
                setMessage(e.failed > 0 ? `${e.failed} failed, will retry next sync` : 'All photos uploaded');
                setPhotoPct(null);
                refresh();
            }
        });
    }, [refresh]);

    const pendingTotal = summary.pending + summary.uploading + summary.failed;
    return (
        <View style={styles.bar}>
            <Text style={styles.text}>{pendingTotal > 0 ? `${pendingTotal} photo(s) waiting to upload` : 'All photos synced'}</Text>
            {message ? <Text style={styles.sub}>{message}</Text> : null}
            {photoPct !== null && (
                <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.max(4, photoPct * 100)}%` }]} />
                </View>
            )}
            {failedInfo.failedCount > 0 && (
                <View style={styles.failedRow}>
                    <Text style={styles.failedText}>
                        {failedInfo.stuckCount > 0
                            ? `⚠ ${failedInfo.stuckCount} photo(s) keep failing — check they still exist`
                            : `${failedInfo.failedCount} photo(s) failed`}
                    </Text>
                    <TouchableOpacity onPress={retryFailed} disabled={retrying}>
                        {retrying ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.retryLink}>Retry now</Text>}
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    bar: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 14, marginBottom: 16, ...shadow.card },
    text: { color: colors.text, fontWeight: '700', fontFamily: fonts.heading },
    sub: { color: colors.textMuted, fontSize: 12, marginTop: 4, fontFamily: fonts.body },
    track: { height: 5, backgroundColor: colors.border, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
    failedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    failedText: { color: colors.danger, fontSize: 12, flex: 1, fontFamily: fonts.bodyMedium },
    retryLink: { color: colors.accent, fontSize: 12, fontWeight: '700', fontFamily: fonts.bodySemiBold },
});
