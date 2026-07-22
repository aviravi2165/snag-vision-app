import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import SyncStatusBar from '../components/SyncStatusBar';
import { cacheGet, cacheSet } from '../data/cache';
import { ensureLocalPlanImage } from '../data/planCache';
import { getProjectSyncSummary, getLastActivityByProject, getPhotoCountsBySpot, getMergedStructureForProject } from '../db/localStore';
import { runSync, onSyncProgress } from '../sync/syncEngine';
import { colors, fonts, radius } from '../theme';

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

  const openManage = async (p) => {
    await AsyncStorage.setItem('sv_project', p.ProjectId);
    navigation.navigate('ManageSpots', { projectId: p.ProjectId, projectName: p.Name });
  };

  return (
    <>
      <SyncStatusBar />
      <View style={styles.c}>
        <View style={styles.headerRow}>
          <Text style={styles.h}>Select Project</Text>
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchFromServer} disabled={refreshing}>
              {refreshing ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.refreshBtnT}>⟳ Refresh</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.refreshBtn, styles.prepareBtn]} onPress={prepareForOffline} disabled={preparing || projects.length === 0}>
              {preparing ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.refreshBtnT}>⬇ Prepare for offline</Text>}
            </TouchableOpacity>
          </View>
        </View>
        {serverCount !== null && <Text style={styles.serverCount}>{serverCount} project(s) on server</Text>}
        {!!prepareStatus && <Text style={styles.serverCount}>{prepareStatus}</Text>}
        <FlatList
          data={projects}
          keyExtractor={(p) => p.ProjectId}
          renderItem={({ item }) => <ProjectRow project={item} onOpen={open} onManage={openManage} />}
          ListEmptyComponent={<Text style={styles.meta}>No projects yet — connect to the internet to load them.</Text>}
        />
      </View>
    </>
  );
}

function ProjectRow({ project, onOpen, onManage }) {
  const [summary, setSummary] = useState({ pending: 0, uploading: 0, done: 0, failed: 0 });
  const [completion, setCompletion] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setSummary(await getProjectSyncSummary(project.ProjectId));
    const structure = await cacheGet(`cache:structure:${project.ProjectId}`);
    if (structure) {
      const merged = await getMergedStructureForProject(structure, project.ProjectId);
      const spots = merged.flatMap((f) => (f.rooms || []).flatMap((r) => r.spots || []));
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

  // The structure cache this reads only actually gets populated the first
  // time Capture/Manage Spots successfully loads this project — refresh on
  // every return to this screen so a stale "0/0" doesn't linger after that.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const pendingTotal = summary.pending + summary.uploading + summary.failed;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onOpen(project)}>
      <Text style={styles.name}>{project.Name}</Text>
      <Text style={styles.meta}>{project.Folder} · {project.City} · No. of floors - {project.FloorCount} </Text>
      <Text style={styles.meta}>
        {completion ? `${completion.done}/${completion.total} spots captured` : 'Open once to load its floor plan'}
      </Text>
      <View style={styles.rowBottom}>
        <Text style={styles.meta}>{pendingTotal > 0 ? `${pendingTotal} photo(s) waiting` : 'Synced'}</Text>
        <View style={styles.rowBtns}>
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={(e) => { e.stopPropagation?.(); onManage(project); }}
          >
            <Text style={styles.manageBtnT}>Manage Spots</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.syncBtn, (syncing || pendingTotal === 0) && { opacity: 0.5 }]}
            disabled={syncing || pendingTotal === 0}
            onPress={(e) => { e.stopPropagation?.(); runSync(project.ProjectId); }}
          >
            {syncing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.syncBtnT}>Sync this project</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  headerBtns: { flexDirection: 'row', gap: 8 },
  h: { color: colors.text, fontSize: 22, fontWeight: '700', fontFamily: fonts.headingBold, letterSpacing: -0.4 },
  refreshBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.button, borderWidth: 1, borderColor: colors.accent },
  prepareBtn: { borderColor: colors.border, backgroundColor: colors.surface },
  refreshBtnT: { color: colors.accent, fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemiBold },
  serverCount: { color: colors.textMuted, fontSize: 12, marginTop: 6, marginBottom: 4, fontFamily: fonts.body },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, marginTop: 12, marginBottom: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', fontFamily: fonts.heading },
  meta: { color: colors.textMuted, marginTop: 4, fontFamily: fonts.body },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 },
  rowBtns: { flexDirection: 'row', gap: 8 },
  manageBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.button, borderWidth: 1, borderColor: colors.accent },
  manageBtnT: { color: colors.accent, fontSize: 12, fontWeight: '700', fontFamily: fonts.bodySemiBold },
  syncBtn: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.button },
  syncBtnT: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: fonts.bodySemiBold },
});
