import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Modal, FlatList, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import api, { webApi } from '../api/client';
import PlanPicker from '../components/PlanPicker';
import { cacheGet, cacheSet } from '../data/cache';
import { insertLocalSpot, queueSpotDelete, getMergedSpotsForFloor } from '../db/localStore';

// Drawer-visible, offline-first spot manager: a worker at a site with no
// WiFi can add/remove spots here and they show up immediately — the
// creates/deletes just queue locally (see localStore's `spots` table) and
// actually reach the server the next time "Sync this project" runs. No role
// check yet — deliberately open to anyone for now; gate this screen once
// real user roles land. Room creation is the one thing that still requires
// a live connection (a one-time per-floor setup step, unlike ongoing spots).
export default function ManageSpotsScreen({ route }) {
  const [projectId, setProjectId] = useState(route?.params?.projectId ?? null);
  const [projectName, setProjectName] = useState(route?.params?.projectName ?? '');
  const [projects, setProjects] = useState([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  const [floors, setFloors] = useState([]);
  const [floorIdx, setFloorIdx] = useState(0);
  const [floorPickerOpen, setFloorPickerOpen] = useState(false);
  const [mergedFloor, setMergedFloor] = useState(null);

  const [loading, setLoading] = useState(true);
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [pendingPoint, setPendingPoint] = useState(null); // {x, y}
  const [spotNameInput, setSpotNameInput] = useState('');

  // Opened directly from the drawer has no route params — fall back to the
  // project the worker last had open, same pattern CaptureScreen uses.
  useEffect(() => {
    if (projectId) return;
    AsyncStorage.getItem('sv_project').then((id) => id && setProjectId(id));
  }, [projectId]);

  useEffect(() => {
    cacheGet('cache:projects').then((cached) => setProjects(cached || []));
  }, []);

  useEffect(() => {
    if (projectName || !projectId) return;
    cacheGet('cache:projects').then((cached) => {
      const match = (cached || []).find((p) => p.ProjectId === projectId);
      if (match) setProjectName(match.Name);
    });
  }, [projectId, projectName]);

  const selectProject = async (p) => {
    setProjectId(p.ProjectId);
    setProjectName(p.Name);
    setFloorIdx(0);
    setFloors([]);
    await AsyncStorage.setItem('sv_project', p.ProjectId);
    setProjectPickerOpen(false);
  };

  // Offline-first, unlike the old admin-only spot screen this replaces:
  // fall back to whatever structure was last cached rather than requiring
  // a live connection just to view existing spots.
  const loadStructure = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setOfflineNotice(false);
    try {
      const r = await api.get(`/projects/${projectId}/structure`);
      setFloors(r.data);
      await cacheSet(`cache:structure:${projectId}`, r.data);
    } catch (e) {
      const cached = await cacheGet(`cache:structure:${projectId}`);
      if (cached) {
        setFloors(cached);
        setOfflineNotice(true);
      } else {
        Alert.alert('No cached floor plan', 'Connect to the internet once to load this project’s floors, then spots can be managed offline.');
      }
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadStructure(); }, [loadStructure]);

  const floor = floors[floorIdx];

  const refreshMerged = useCallback(async () => {
    if (!floor || !projectId) { setMergedFloor(null); return; }
    setMergedFloor(await getMergedSpotsForFloor(floor, projectId));
  }, [floor, projectId]);

  useFocusEffect(useCallback(() => { refreshMerged(); }, [refreshMerged]));

  const room = mergedFloor?.rooms?.[0];
  const allSpots = mergedFloor?.rooms?.flatMap((r) => r.spots || []) || [];
  const pendingCount = allSpots.filter((s) => s._pendingSync).length;

  const createRoom = async () => {
    if (!roomNameInput.trim() || !floor) return;
    setBusy(true);
    try {
      await webApi.post(`/projects/floors/${floor.FloorId}/rooms`, { name: roomNameInput.trim() });
      setRoomNameInput('');
      await loadStructure();
    } catch (e) {
      Alert.alert('Could not create room', e.response?.data?.detail || e.message || 'Room creation needs a live connection.');
    }
    setBusy(false);
  };

  const handleAddPoint = (x, y) => {
    if (!room) return;
    setPendingPoint({ x, y });
    setSpotNameInput(`Spot ${(room.spots?.length || 0) + 1}`);
  };

  const confirmAddSpot = async () => {
    if (!spotNameInput.trim() || !pendingPoint || !room) return;
    setBusy(true);
    try {
      await insertLocalSpot({
        id: uuid.v4(),
        projectId,
        roomId: room.RoomId,
        name: spotNameInput.trim(),
        coordinateX: pendingPoint.x,
        coordinateY: pendingPoint.y,
        sortOrder: (room.spots?.length || 0) + 1,
      });
      setPendingPoint(null);
      await refreshMerged();
    } catch (e) {
      Alert.alert('Could not add spot', e.message);
    }
    setBusy(false);
  };

  const handleDeleteSpot = (spot) => {
    Alert.alert('Delete spot', `Remove "${spot.SpotName}"? Any photos already captured for it stay in the queue, just unlinked from a live spot.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            await queueSpotDelete(spot, projectId);
            await refreshMerged();
          } catch (e) {
            Alert.alert('Could not delete spot', e.message);
          }
          setBusy(false);
        },
      },
    ]);
  };

  if (!projectId) {
    return (
      <View style={styles.center}>
        <Text style={styles.cardSub}>Open a project from the Projects screen first.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#D92906" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.c}>
      <TouchableOpacity style={styles.projectRow} onPress={() => setProjectPickerOpen(true)}>
        <Text style={styles.h}>{projectName}</Text>
        <Text style={styles.switchLink}>Switch project ▾</Text>
      </TouchableOpacity>
      <Text style={styles.sub}>
        {allSpots.length} spot(s){pendingCount > 0 ? ` · ${pendingCount} pending sync` : ''} on this floor
        {offlineNotice ? ' · showing cached data, offline' : ''}
      </Text>

      <Modal visible={projectPickerOpen} transparent animationType="fade" onRequestClose={() => setProjectPickerOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setProjectPickerOpen(false)}>
          <View style={styles.modalCard}>
            <FlatList
              data={projects}
              keyExtractor={(p) => p.ProjectId}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.modalRow, item.ProjectId === projectId && styles.modalRowActive]} onPress={() => selectProject(item)}>
                  <Text style={styles.modalRowT}>{item.Name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {floors.length > 0 && (
        <TouchableOpacity style={styles.floorSelect} onPress={() => setFloorPickerOpen(true)} disabled={floors.length < 2}>
          <Text style={styles.floorSelectLabel}>Floor</Text>
          <Text style={styles.floorSelectValue}>{floor?.FloorName}{floors.length > 1 ? '  ▾' : ''}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={floorPickerOpen} transparent animationType="fade" onRequestClose={() => setFloorPickerOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFloorPickerOpen(false)}>
          <View style={styles.modalCard}>
            <FlatList
              data={floors}
              keyExtractor={(f) => f.FloorId}
              renderItem={({ item, index }) => (
                <TouchableOpacity style={[styles.modalRow, index === floorIdx && styles.modalRowActive]} onPress={() => { setFloorIdx(index); setFloorPickerOpen(false); }}>
                  <Text style={styles.modalRowT}>{item.FloorName}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {!floor ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No floors for this project yet</Text>
          <Text style={styles.cardSub}>Floors (and their plan image) are set up on the backend before spots can be placed.</Text>
        </View>
      ) : !room ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This floor has no rooms yet</Text>
          <Text style={styles.cardSub}>Spots belong to a room — create one first. This step needs a live connection.</Text>
          <TextInput style={styles.input} value={roomNameInput} onChangeText={setRoomNameInput} placeholder="e.g. Lobby" placeholderTextColor="#5a5f6a" />
          <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={createRoom} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create room</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{room.RoomName}</Text>
            {busy && <ActivityIndicator color="#D92906" size="small" />}
          </View>
          <PlanPicker
            planUrl={floor?.FloorPlanImageUrl}
            rooms={mergedFloor?.rooms || []}
            editMode
            onAddPoint={handleAddPoint}
            onDeleteSpot={handleDeleteSpot}
          />
          <Text style={styles.count}>{room.spots?.length || 0} spot(s) on this floor</Text>

          {room.spots?.length > 0 && (
            <View style={styles.spotList}>
              {room.spots.map((s) => (
                <View key={s.SpotId} style={styles.spotRow}>
                  <Text style={styles.spotRowT} numberOfLines={1}>
                    {s.SortOrder}. {s.SpotName}{s._pendingSync ? ' · pending sync' : ''}
                  </Text>
                  <TouchableOpacity style={styles.spotDeleteBtn} onPress={() => handleDeleteSpot(s)}>
                    <Text style={styles.spotDeleteBtnT}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <Modal visible={!!pendingPoint} transparent animationType="fade" onRequestClose={() => setPendingPoint(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.addCard}>
            <Text style={styles.cardTitle}>Name this spot</Text>
            <TextInput style={styles.input} value={spotNameInput} onChangeText={setSpotNameInput} autoFocus placeholder="Spot name" placeholderTextColor="#5a5f6a" />
            <View style={styles.rowGap}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost, { flex: 1 }]} onPress={() => setPendingPoint(null)}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={confirmAddSpot} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Add spot</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#0e0f12', padding: 16 },
  center: { flex: 1, backgroundColor: '#0e0f12', alignItems: 'center', justifyContent: 'center', padding: 24 },
  projectRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h: { color: '#fff', fontSize: 22, fontWeight: '700' },
  switchLink: { color: '#D92906', fontSize: 12, fontWeight: '600' },
  sub: { color: '#9aa0aa', fontSize: 12, marginTop: 2, marginBottom: 16 },
  floorSelect: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#16181d', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2e37', marginBottom: 16 },
  floorSelectLabel: { color: '#9aa0aa', fontSize: 12 },
  floorSelectValue: { color: '#fff', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#16181d', borderRadius: 10, borderWidth: 1, borderColor: '#2a2e37', maxHeight: 320, overflow: 'hidden' },
  modalRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#2a2e37' },
  modalRowActive: { backgroundColor: '#2a2e37' },
  modalRowT: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#16181d', borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#2a2e37', marginBottom: 16 },
  cardTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cardSub: { color: '#9aa0aa', fontSize: 12, marginTop: 4, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowGap: { flexDirection: 'row', gap: 10, marginTop: 4 },
  count: { color: '#9aa0aa', fontSize: 12, marginTop: 10 },
  spotList: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#2a2e37', paddingTop: 6 },
  spotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  spotRowT: { color: '#e8eaed', fontSize: 13, flex: 1, marginRight: 10 },
  spotDeleteBtn: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: '#2a2e37', alignItems: 'center', justifyContent: 'center' },
  spotDeleteBtnT: { color: '#D92906', fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: '#1f222a', color: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#2a2e37' },
  btn: { backgroundColor: '#D92906', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2a2e37' },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhostText: { color: '#e8eaed', fontWeight: '700' },
  addCard: { backgroundColor: '#16181d', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#2a2e37' },
});
