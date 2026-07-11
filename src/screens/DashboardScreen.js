import React, { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { cacheGet } from '../data/cache';
import { getPhotoCountsBySpot, getSyncSummaryByProject, getUploadSummary, getPhotosForProject } from '../db/localStore';
import * as osc from '../camera/oscClient';
import { API_BASE_HOST } from '../api/client';
import SyncStatusBar from '../components/SyncStatusBar';

const NETWORK_CHECK_MS = 15000;
const CAMERA_CHECK_MS = 15000;

function progressColor(done, total) {
    if (!total) return '#2a2e37';
    if (done === 0) return '#D92906';
    if (done < total) return '#e3b341';
    return '#4fae5e';
}

function networkQuality(net) {
    if (!net.isConnected) return { label: 'Offline', color: '#D92906' };
    if (net.checking) return { label: 'Checking…', color: '#9aa0aa' };
    if (!net.reachable) return { label: `${net.type} · server unreachable`, color: '#e3b341' };
    if (net.latencyMs < 300) return { label: `${net.type} · Good · ${net.latencyMs}ms`, color: '#4fae5e' };
    if (net.latencyMs < 1000) return { label: `${net.type} · Fair · ${net.latencyMs}ms`, color: '#e3b341' };
    return { label: `${net.type} · Slow · ${net.latencyMs}ms`, color: '#D92906' };
}

export default function DashboardScreen() {
    const [projects, setProjects] = useState([]);
    const [stats, setStats] = useState({}); // projectId -> { summary, completion }
    const [globalSummary, setGlobalSummary] = useState({ pending: 0, uploading: 0, done: 0, failed: 0 });
    const [net, setNet] = useState({ isConnected: false, type: 'unknown', reachable: false, latencyMs: null, checking: true });
    const [cameraConnected, setCameraConnected] = useState(null); // null = checking
    const [photosModal, setPhotosModal] = useState({ visible: false, project: null, photos: [] });
    const [viewer, setViewer] = useState({ visible: false, uri: null });
    const intervalsRef = useRef([]);

    const loadStats = useCallback(async () => {
        const cachedProjects = (await cacheGet('cache:projects')) || [];
        setProjects(cachedProjects);

        const [counts, syncByProject, uploadRows] = await Promise.all([
            getPhotoCountsBySpot(),
            getSyncSummaryByProject(),
            getUploadSummary(),
        ]);

        const nextStats = {};
        for (const p of cachedProjects) {
            const structure = await cacheGet(`cache:structure:${p.ProjectId}`);
            let completion = null;
            if (structure) {
                const spots = structure.flatMap((f) => (f.rooms || []).flatMap((r) => r.spots || []));
                completion = { done: spots.filter((s) => (counts[s.SpotId] || 0) > 0).length, total: spots.length };
            }
            nextStats[p.ProjectId] = {
                summary: syncByProject[p.ProjectId] || { pending: 0, uploading: 0, done: 0, failed: 0 },
                completion,
            };
        }
        setStats(nextStats);

        const g = { pending: 0, uploading: 0, done: 0, failed: 0 };
        uploadRows.forEach((r) => { g[r.status] = r.count; });
        setGlobalSummary(g);
    }, []);

    const checkNetwork = useCallback(async () => {
        setNet((prev) => ({ ...prev, checking: true }));
        const state = await NetInfo.fetch();
        if (!state.isConnected) {
            setNet({ isConnected: false, type: state.type, reachable: false, latencyMs: null, checking: false });
            return;
        }
        const start = Date.now();
        try {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 3000);
            await fetch(API_BASE_HOST, { method: 'HEAD', signal: controller.signal });
            clearTimeout(t);
            setNet({ isConnected: true, type: state.type, reachable: true, latencyMs: Date.now() - start, checking: false });
        } catch {
            setNet({ isConnected: true, type: state.type, reachable: false, latencyMs: null, checking: false });
        }
    }, []);

    const checkCamera = useCallback(async () => {
        try {
            await osc.pingCamera(2000);
            setCameraConnected(true);
        } catch {
            setCameraConnected(false);
        }
    }, []);

    const refreshAll = useCallback(() => {
        loadStats();
        checkNetwork();
        checkCamera();
    }, [loadStats, checkNetwork, checkCamera]);

    useFocusEffect(useCallback(() => {
        refreshAll();
        const netTimer = setInterval(checkNetwork, NETWORK_CHECK_MS);
        const camTimer = setInterval(checkCamera, CAMERA_CHECK_MS);
        intervalsRef.current = [netTimer, camTimer];
        return () => intervalsRef.current.forEach(clearInterval);
    }, [refreshAll, checkNetwork, checkCamera]));

    const openPhotos = async (project) => {
        const photos = await getPhotosForProject(project.ProjectId);
        setPhotosModal({ visible: true, project, photos });
    };

    const totalCaptured = globalSummary.pending + globalSummary.uploading + globalSummary.done + globalSummary.failed;
    const withCompletion = Object.values(stats).filter((s) => s.completion);
    const overallDone = withCompletion.reduce((sum, s) => sum + s.completion.done, 0);
    const overallTotal = withCompletion.reduce((sum, s) => sum + s.completion.total, 0);
    const netQ = networkQuality(net);

    return (
        <>
            <SyncStatusBar />
            <View style={styles.c}>
                <View style={styles.headerRow}>
                    <Text style={styles.h}>Dashboard</Text>
                    <TouchableOpacity style={styles.refreshBtn} onPress={refreshAll}>
                        <Text style={styles.refreshBtnT}>⟳ Refresh</Text>
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={projects}
                    keyExtractor={(p) => p.ProjectId}
                    ListHeaderComponent={
                        <View>
                            <View style={styles.kpiRow}>
                                <View style={styles.kpi}>
                                    <Text style={styles.kpiLabel}>Overall progress</Text>
                                    <Text style={styles.kpiValue}>{overallTotal ? `${overallDone}/${overallTotal} spots` : '—'}</Text>
                                </View>
                                <View style={styles.kpi}>
                                    <Text style={styles.kpiLabel}>Camera</Text>
                                    <Text style={[styles.kpiValue, { color: cameraConnected ? '#4fae5e' : cameraConnected === false ? '#D92906' : '#9aa0aa' }]}>
                                        {cameraConnected === null ? 'Checking…' : cameraConnected ? 'Connected' : 'Not connected'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.card}>
                                <Text style={styles.cardLabel}>Network</Text>
                                <Text style={[styles.netText, { color: netQ.color }]}>{netQ.label}</Text>
                            </View>

                            <View style={styles.card}>
                                <Text style={styles.cardLabel}>Uploads by status ({totalCaptured} total captured)</Text>
                                <View style={styles.statusRow}>
                                    <StatusPill label="Pending" count={globalSummary.pending} color="#D92906" />
                                    <StatusPill label="Uploading" count={globalSummary.uploading} color="#e3b341" />
                                    <StatusPill label="Done" count={globalSummary.done} color="#4fae5e" />
                                    <StatusPill label="Failed" count={globalSummary.failed} color="#9aa0aa" />
                                </View>
                            </View>

                            <Text style={styles.sectionH}>Per project</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const s = stats[item.ProjectId] || { summary: { pending: 0, uploading: 0, done: 0, failed: 0 }, completion: null };
                        const pct = s.completion?.total ? Math.round((s.completion.done / s.completion.total) * 100) : null;
                        const uploaded = s.summary.done;
                        const totalLocal = s.summary.pending + s.summary.uploading + s.summary.done + s.summary.failed;
                        return (
                            <View style={styles.projectCard}>
                                <Text style={styles.projectName}>{item.Name}</Text>
                                <Text style={styles.projectMeta}>
                                    {s.completion ? `${s.completion.done}/${s.completion.total} spots (${pct}%)` : 'Open once to load its floor plan'}
                                </Text>
                                {s.completion && (
                                    <View style={styles.barTrack}>
                                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: progressColor(s.completion.done, s.completion.total) }]} />
                                    </View>
                                )}
                                <Text style={styles.projectMeta}>{uploaded}/{totalLocal} photo(s) uploaded to server</Text>
                                <TouchableOpacity style={styles.viewBtn} onPress={() => openPhotos(item)} disabled={totalLocal === 0}>
                                    <Text style={styles.viewBtnT}>{totalLocal === 0 ? 'No photos yet' : `View ${totalLocal} photo(s)`}</Text>
                                </TouchableOpacity>
                            </View>
                        );
                    }}
                    ListEmptyComponent={<Text style={styles.projectMeta}>No projects cached yet — open Projects once online first.</Text>}
                />
            </View>

            <Modal visible={photosModal.visible} animationType="slide" onRequestClose={() => setPhotosModal({ visible: false, project: null, photos: [] })}>
                <View style={styles.modalC}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>{photosModal.project?.Name}</Text>
                        <TouchableOpacity onPress={() => setPhotosModal({ visible: false, project: null, photos: [] })}>
                            <Text style={styles.modalClose}>Close</Text>
                        </TouchableOpacity>
                    </View>
                    <FlatList
                        data={photosModal.photos}
                        keyExtractor={(p) => p.id}
                        contentContainerStyle={{ padding: 16 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.photoRow} onPress={() => setViewer({ visible: true, uri: item.localUri })}>
                                <Image source={{ uri: item.localUri }} style={styles.thumb} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.photoStatus}>
                                        <StatusDot status={item.status} /> {item.status} · {new Date(item.capturedAt).toLocaleString()}
                                    </Text>
                                    <Text style={styles.photoPath} numberOfLines={2}>{item.localUri}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={styles.projectMeta}>No photos captured for this project yet.</Text>}
                    />
                </View>
            </Modal>

            <Modal visible={viewer.visible} transparent animationType="fade" onRequestClose={() => setViewer({ visible: false, uri: null })}>
                <View style={styles.viewerC}>
                    <TouchableOpacity style={styles.viewerClose} onPress={() => setViewer({ visible: false, uri: null })}>
                        <Text style={styles.modalClose}>Close</Text>
                    </TouchableOpacity>
                    {viewer.uri && <Image source={{ uri: viewer.uri }} style={styles.viewerImg} resizeMode="contain" />}
                </View>
            </Modal>
        </>
    );
}

function StatusPill({ label, count, color }) {
    return (
        <View style={styles.pill}>
            <View style={[styles.pillDot, { backgroundColor: color }]} />
            <Text style={styles.pillT}>{label} {count}</Text>
        </View>
    );
}

function StatusDot({ status }) {
    const color = status === 'done' ? '#4fae5e' : status === 'failed' ? '#D92906' : status === 'uploading' ? '#e3b341' : '#9aa0aa';
    return <Text style={{ color }}>●</Text>;
}

const styles = StyleSheet.create({
    c: { flex: 1, backgroundColor: '#0e0f12', padding: 16 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    h: { color: '#fff', fontSize: 22, fontWeight: '700' },
    refreshBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#D92906' },
    refreshBtnT: { color: '#fff', fontSize: 12, fontWeight: '600' },
    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    kpi: { flex: 1, backgroundColor: '#16181d', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2e37' },
    kpiLabel: { color: '#9aa0aa', fontSize: 12, marginBottom: 4 },
    kpiValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
    card: { backgroundColor: '#16181d', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2e37', marginBottom: 12 },
    cardLabel: { color: '#9aa0aa', fontSize: 12, marginBottom: 6 },
    netText: { fontSize: 14, fontWeight: '700' },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
    pill: { flexDirection: 'row', alignItems: 'center' },
    pillDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    pillT: { color: '#e8eaed', fontSize: 12 },
    sectionH: { color: '#fff', fontWeight: '700', marginBottom: 8, marginTop: 4 },
    projectCard: { backgroundColor: '#16181d', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2e37', marginBottom: 10 },
    projectName: { color: '#fff', fontSize: 15, fontWeight: '700' },
    projectMeta: { color: '#9aa0aa', fontSize: 12, marginTop: 4 },
    barTrack: { height: 6, backgroundColor: '#2a2e37', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    viewBtn: { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2a2e37' },
    viewBtnT: { color: '#e8eaed', fontSize: 12, fontWeight: '600' },
    modalC: { flex: 1, backgroundColor: '#0e0f12' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#2a2e37' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    modalClose: { color: '#D92906', fontWeight: '700' },
    photoRow: { flexDirection: 'row', backgroundColor: '#16181d', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#2a2e37' },
    thumb: { width: 56, height: 56, borderRadius: 6, marginRight: 10, backgroundColor: '#2a2e37' },
    photoStatus: { color: '#e8eaed', fontSize: 12, marginBottom: 4 },
    photoPath: { color: '#6a707b', fontSize: 10 },
    viewerC: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    viewerImg: { width: '100%', height: '100%' },
    viewerClose: { position: 'absolute', top: 48, right: 20, zIndex: 1, backgroundColor: 'rgba(22,24,29,.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
});
