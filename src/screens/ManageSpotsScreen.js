import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Modal, FlatList, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import api, { webApi } from '../api/client';
import PlanPicker from '../components/PlanPicker';
import { cacheGet, cacheSet } from '../data/cache';
import { insertLocalSpot, queueSpotDelete, getMergedSpotsForFloor } from '../db/localStore';
import { colors, fonts, radius } from '../theme';

// Drawer-visible, offline-first spot manager: a worker at a site with no
// WiFi can add/remove spots here and they show up immediately — the
// creates/deletes just queue locally (see localStore's `spots` table) and
// actually reach the server the next time "Sync this project" runs.
// Editing (add/delete a spot) is restricted to admin/project_manager,
// matching the backend's own POST/DELETE /mobile/spots role check — anyone
// else can still open this screen to view spots and completion status,
// just can't change them. Room creation is the one thing that still
// requires a live connection (a one-time per-floor setup step, unlike
// ongoing spots).
export default function ManageSpotsScreen({ route }) {
  const [projectId, setProjectId] = useState(route?.params?.projectId ?? null);
  const [projectName, setProjectName] = useState(route?.params?.projectName ?? '');
  const [projects, setProjects] = useState([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [role, setRole] = useState(null);

  useEffect(() => { AsyncStorage.getItem('sv_role').then(setRole); }, []);
  const canEdit = role === 'admin' || role === 'project_manager';

  const [floors, setFloors] = useState([]);
  const [floorIdx, setFloorIdx] = useState(0);
  const [floorPickerOpen, setFloorPickerOpen] = useState(false);
  const [roomIdx, setRoomIdx] = useState(0);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
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

  // React Navigation reuses this screen instance rather than remounting it
  // when navigated to again with different params, so useState's initial
  // value alone would keep showing whichever project was first opened.
  useEffect(() => {
    const incomingId = route?.params?.projectId;
    if (!incomingId || incomingId === projectId) return;
    setProjectId(incomingId);
    setProjectName(route?.params?.projectName ?? '');
    setFloors([]);
    setFloorIdx(0);
  }, [route?.params?.projectId]);

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

  // A different floor almost certainly has different rooms — don't carry
  // over an index that might now point at the wrong one (or nothing).
  useEffect(() => { setRoomIdx(0); }, [floor?.FloorId]);

  const refreshMerged = useCallback(async () => {
    if (!floor || !projectId) { setMergedFloor(null); return; }
    setMergedFloor(await getMergedSpotsForFloor(floor, projectId));
  }, [floor, projectId]);

  useFocusEffect(useCallback(() => { refreshMerged(); }, [refreshMerged]));

  const rooms = mergedFloor?.rooms || [];
  const room = rooms[roomIdx] || rooms[0];
  const allSpots = rooms.flatMap((r) => r.spots || []);
  const pendingCount = allSpots.filter((s) => s._pendingSync).length;

  const createRoom = async () => {
    if (!canEdit || !roomNameInput.trim() || !floor) return;
    setBusy(true);
    try {
      await webApi.post(`/projects/floors/${floor.FloorId}/rooms`, { name: roomNameInput.trim() });
      setRoomNameInput('');
      setAddRoomOpen(false);
      await loadStructure();
    } catch (e) {
      Alert.alert('Could not create room', e.response?.data?.detail || e.message || 'Room creation needs a live connection.');
    }
    setBusy(false);
  };

  const handleAddPoint = (x, y) => {
    if (!canEdit || !room) return;
    setPendingPoint({ x, y });
    setSpotNameInput(`Spot ${(room.spots?.length || 0) + 1}`);
  };

  const confirmAddSpot = async () => {
    if (!canEdit || !spotNameInput.trim() || !pendingPoint || !room) return;
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
    if (!canEdit) return;
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
        <ActivityIndicator color={colors.accent} size="large" />
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
          {canEdit ? (
            <>
              <Text style={styles.cardSub}>Spots belong to a room — create one first. This step needs a live connection.</Text>
              <TextInput style={styles.input} value={roomNameInput} onChangeText={setRoomNameInput} placeholder="e.g. Lobby" placeholderTextColor={colors.placeholder} />
              <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={createRoom} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create room</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.cardSub}>Ask an admin or project manager to set one up.</Text>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <TouchableOpacity
              style={styles.roomSelect}
              onPress={() => setRoomPickerOpen(true)}
              disabled={rooms.length < 2}
            >
              <Text style={styles.cardTitle}>{room.RoomName}{rooms.length > 1 ? '  ▾' : ''}</Text>
            </TouchableOpacity>
            {busy && <ActivityIndicator color={colors.accent} size="small" />}
          </View>
          {canEdit && (
            <TouchableOpacity onPress={() => setAddRoomOpen(true)} style={{ marginBottom: 10 }}>
              <Text style={styles.switchLink}>+ Add another room</Text>
            </TouchableOpacity>
          )}
          {!canEdit && role && (
            <View style={styles.permNotice}>
              <Text style={styles.permNoticeT}>View only — only admins and project managers can add or remove spots.</Text>
            </View>
          )}
          <PlanPicker
            planUrl={floor?.FloorPlanImageUrl}
            rooms={rooms}
            editMode={canEdit}
            onAddPoint={handleAddPoint}
            onDeleteSpot={handleDeleteSpot}
          />
          <Text style={styles.count}>Adding new spots to: {room.RoomName}</Text>

          {rooms.map((r) => (r.spots || []).length > 0 && (
            <View key={r.RoomId} style={styles.spotList}>
              {rooms.length > 1 && <Text style={styles.spotListHeader}>{r.RoomName}</Text>}
              {r.spots.map((s) => (
                <View key={s.SpotId} style={styles.spotRow}>
                  <Text style={styles.spotRowT} numberOfLines={1}>
                    {s.SortOrder}. {s.SpotName}{s._pendingSync ? ' · pending sync' : ''}
                  </Text>
                  {canEdit && (
                    <TouchableOpacity style={styles.spotDeleteBtn} onPress={() => handleDeleteSpot(s)}>
                      <Text style={styles.spotDeleteBtnT}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      <Modal visible={roomPickerOpen} transparent animationType="fade" onRequestClose={() => setRoomPickerOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRoomPickerOpen(false)}>
          <View style={styles.modalCard}>
            <FlatList
              data={rooms}
              keyExtractor={(r) => r.RoomId}
              renderItem={({ item, index }) => (
                <TouchableOpacity style={[styles.modalRow, index === roomIdx && styles.modalRowActive]} onPress={() => { setRoomIdx(index); setRoomPickerOpen(false); }}>
                  <Text style={styles.modalRowT}>{item.RoomName}</Text>
                  <Text style={styles.modalRowSub}>{(item.spots || []).length} spot(s)</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={addRoomOpen} transparent animationType="fade" onRequestClose={() => setAddRoomOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.addCard}>
            <Text style={styles.cardTitle}>New room on {floor?.FloorName}</Text>
            <Text style={styles.cardSub}>This step needs a live connection.</Text>
            <TextInput style={styles.input} value={roomNameInput} onChangeText={setRoomNameInput} autoFocus placeholder="e.g. Hallway" placeholderTextColor={colors.placeholder} />
            <View style={styles.rowGap}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost, { flex: 1 }]} onPress={() => { setAddRoomOpen(false); setRoomNameInput(''); }}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={createRoom} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create room</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!pendingPoint} transparent animationType="fade" onRequestClose={() => setPendingPoint(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.addCard}>
            <Text style={styles.cardTitle}>Name this spot</Text>
            <TextInput style={styles.input} value={spotNameInput} onChangeText={setSpotNameInput} autoFocus placeholder="Spot name" placeholderTextColor={colors.placeholder} />
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
  c: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  projectRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h: { color: colors.text, fontSize: 22, fontWeight: '700', fontFamily: fonts.headingBold, letterSpacing: -0.4 },
  switchLink: { color: colors.accent, fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemiBold },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: 16, fontFamily: fonts.body },
  floorSelect: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.card, padding: 14, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  floorSelectLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body },
  floorSelectValue: { color: colors.text, fontWeight: '700', fontFamily: fonts.bodySemiBold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.card, maxHeight: 320, overflow: 'hidden' },
  modalRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalRowActive: { backgroundColor: colors.accentLight },
  modalRowT: { color: colors.text, fontWeight: '600', fontFamily: fonts.bodySemiBold },
  modalRowSub: { color: colors.textMuted, fontSize: 11, marginTop: 2, fontFamily: fonts.body },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 15, fontFamily: fonts.heading },
  cardSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 12, fontFamily: fonts.body },
  roomSelect: { flexShrink: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowGap: { flexDirection: 'row', gap: 10, marginTop: 4 },
  count: { color: colors.textMuted, fontSize: 12, marginTop: 10, fontFamily: fonts.body },
  permNotice: { backgroundColor: colors.infoBg, borderRadius: radius.button, padding: 10, marginBottom: 10 },
  permNoticeT: { color: colors.info, fontSize: 12, fontFamily: fonts.bodyMedium },
  spotList: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  spotListHeader: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 6, fontFamily: fonts.bodySemiBold },
  spotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  spotRowT: { color: colors.textBody, fontSize: 13, flex: 1, marginRight: 10, fontFamily: fonts.body },
  spotDeleteBtn: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  spotDeleteBtnT: { color: colors.accent, fontSize: 12, fontWeight: '700', fontFamily: fonts.bodySemiBold },
  input: { backgroundColor: colors.surfaceHover, color: colors.text, borderRadius: radius.button, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.body },
  btn: { backgroundColor: colors.accent, padding: 14, borderRadius: radius.button, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnText: { color: '#fff', fontWeight: '700', fontFamily: fonts.bodySemiBold },
  btnGhostText: { color: colors.textBody, fontWeight: '700', fontFamily: fonts.bodySemiBold },
  addCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
});
