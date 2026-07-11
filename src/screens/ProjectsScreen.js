import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import SyncStatusBar from '../components/SyncStatusBar';
import { cacheGet, cacheSet } from '../data/cache';
import { ensureLocalPlanImage } from '../data/planCache';
import { getProjectSyncSummary, getLastActivityByProject, getPhotoCountsBySpot } from '../db/localStore';
import { runSync, onSyncProgress } from '../sync/syncEngine';

function sortByActivity(list, lastMap) {
  return [...list].sort((a, b) => (lastMap[b.ProjectId] || 0) - (lastMap[a.ProjectId] || 0));
}

export default function ProjectsScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [serverCount, setServerCount] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareStatus, setPrepareStatus] = useState('');

  const resort = useCallback(async () => {
    const lastMap = await getLastActivityByProject();
    setProjects((prev) => sortByActivity(prev, lastMap));
  }, []);

  useEffect(() => {
    api.get('/projects')
      .then(async (r) => { setProjects(r.data); await cacheSet('cache:projects', r.data); })
      .catch(async () => setProjects((await cacheGet('cache:projects')) || []))
      .then(resort);
  }, []);

  useEffect(() => onSyncProgress((e) => { if (e.type === 'complete') resort(); }), [resort]);

  // Explicit "talk to the server" action — separate from the silent
  // fetch-on-mount above — so a worker can deliberately refresh + cache
  // today's full project list while they still have signal.
  const fetchFromServer = async () => {
    setRefreshing(true);
    try {
      const r = await api.get('/projects');
      setProjects(r.data);
      await cacheSet('cache:projects', r.data);
      setServerCount(r.data.length);
      await resort();
      Alert.alert('Project list updated', `${r.data.length} project(s) found on server — saved for offline use.`);
    } catch (e) {
      Alert.alert('Could not reach server', 'Check your connection. Showing the last locally cached project list.');
    }
    setRefreshing(false);
  };

  // Deliberate "go dark" action — a worker taps this while still on office
  // WiFi to pull every project's floor plan + spot layout down before
  // heading to a site with no signal, instead of relying on incidentally
  // having opened each project's Capture screen at least once already.
  const prepareForOffline = async () => {
    setPreparing(true);
    let ok = 0, failed = 0;
    for (const p of projects) {
      setPrepareStatus(`Caching ${ok + failed + 1}/${projects.length}: ${p.Name}`);
      try {
        const r = await api.get(`/projects/${p.ProjectId}/structure`);
        const localized = await Promise.all(r.data.map(ensureLocalPlanImage));
        await cacheSet(`cache:structure:${p.ProjectId}`, localized);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setPreparing(false);
    setPrepareStatus('');
    Alert.alert(
      'Ready for offline',
      failed > 0
        ? `${ok} of ${projects.length} project(s) cached. ${failed} need signal to retry.`
        : `All ${ok} project(s) cached — floor plans and spots will load with no network.`
    );
  };

  const open = async (p) => {
    await AsyncStorage.setItem('sv_project', p.ProjectId);
    navigation.navigate('Capture', { projectId: p.ProjectId, projectName: p.Name });
  };

  return (
    <>
      <SyncStatusBar />
      <View style={styles.c}>
        <View style={styles.headerRow}>
          <Text style={styles.h}>Select Project</Text>
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchFromServer} disabled={refreshing}>
              {refreshing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.refreshBtnT}>⟳ Refresh</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.refreshBtn, styles.prepareBtn]} onPress={prepareForOffline} disabled={preparing || projects.length === 0}>
              {preparing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.refreshBtnT}>⬇ Prepare for offline</Text>}
            </TouchableOpacity>
          </View>
        </View>
        {serverCount !== null && <Text style={styles.serverCount}>{serverCount} project(s) on server</Text>}
        {!!prepareStatus && <Text style={styles.serverCount}>{prepareStatus}</Text>}
        <FlatList
          data={projects}
          keyExtractor={(p) => p.ProjectId}
          renderItem={({ item }) => <ProjectRow project={item} onOpen={open} />}
          ListEmptyComponent={<Text style={styles.meta}>No projects yet — connect to the internet to load them.</Text>}
        />
      </View>
    </>
  );
}

function ProjectRow({ project, onOpen }) {
  const [summary, setSummary] = useState({ pending: 0, uploading: 0, done: 0, failed: 0 });
  const [completion, setCompletion] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setSummary(await getProjectSyncSummary(project.ProjectId));
    const structure = await cacheGet(`cache:structure:${project.ProjectId}`);
    if (structure) {
      const spots = structure.flatMap((f) => (f.rooms || []).flatMap((r) => r.spots || []));
      const counts = await getPhotoCountsBySpot();
      const done = spots.filter((s) => (counts[s.SpotId] || 0) > 0).length;
      setCompletion({ done, total: spots.length });
    } else {
      setCompletion(null);
    }
  }, [project.ProjectId]);

  useEffect(() => {
    refresh();
    return onSyncProgress((e) => {
      if (e.projectId !== project.ProjectId) return;
      if (e.type === 'start') setSyncing(true);
      if (e.type === 'complete' || e.type === 'offline') { setSyncing(false); refresh(); }
    });
  }, [refresh, project.ProjectId]);

  const pendingTotal = summary.pending + summary.uploading + summary.failed;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onOpen(project)}>
      <Text style={styles.name}>{project.Name}</Text>
      <Text style={styles.meta}>{project.Folder} · {project.City} · {project.FloorCount} floors</Text>
      <Text style={styles.meta}>
        {completion ? `${completion.done}/${completion.total} spots captured` : 'Open once to load its floor plan'}
      </Text>
      <View style={styles.rowBottom}>
        <Text style={styles.meta}>{pendingTotal > 0 ? `${pendingTotal} photo(s) waiting` : 'Synced'}</Text>
        <TouchableOpacity
          style={[styles.syncBtn, (syncing || pendingTotal === 0) && { opacity: 0.5 }]}
          disabled={syncing || pendingTotal === 0}
          onPress={(e) => { e.stopPropagation?.(); runSync(project.ProjectId); }}
        >
          {syncing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.syncBtnT}>Sync this project</Text>}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#0e0f12', padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  h: { color: '#fff', fontSize: 22, fontWeight: '700' },
  refreshBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#D92906' },
  prepareBtn: { borderColor: '#2a2e37', backgroundColor: '#16181d' },
  refreshBtnT: { color: '#fff', fontSize: 12, fontWeight: '600' },
  serverCount: { color: '#9aa0aa', fontSize: 12, marginTop: 6, marginBottom: 4 },
  card: { backgroundColor: '#16181d', borderRadius: 10, padding: 16, marginTop: 12, marginBottom: 2, borderWidth: 1, borderColor: '#2a2e37' },
  name: { color: '#fff', fontSize: 16, fontWeight: '700' },
  meta: { color: '#9aa0aa', marginTop: 4 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  syncBtn: { backgroundColor: '#D92906', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  syncBtnT: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
