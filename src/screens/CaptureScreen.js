import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import uuid from 'react-native-uuid';
import api from '../api/client';
import * as osc from '../camera/oscClient';
import { insertPhoto, getPhotosForSpot, getPhotoCountsBySpot, getMergedSpotsForFloor } from '../db/localStore';
import { savePhotoLocally } from '../storage/fileStore';
import PlanPicker from '../components/PlanPicker';
import * as ImagePicker from 'expo-image-picker';

import { cacheGet, cacheSet } from '../data/cache';
import { ensureLocalPlanImage } from '../data/planCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, radius } from '../theme';

export default function CaptureScreen({ route, navigation }) {
  const [projectId, setProjectId] = useState(route?.params?.projectId ?? null);
  const [projectName, setProjectName] = useState(route?.params?.projectName ?? '');
  const [floors, setFloors] = useState([]);
  const [floorIdx, setFloorIdx] = useState(0);
  const [floorPickerOpen, setFloorPickerOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [currentSpot, setCurrentSpot] = useState(null);
  const [spotCount, setSpotCount] = useState(0);
  const [spotCounts, setSpotCounts] = useState({});
  const [status, setStatus] = useState('Not connected to camera');

  const refreshSpotCounts = async () => setSpotCounts(await getPhotoCountsBySpot());
  useEffect(() => { refreshSpotCounts(); }, []);

  // React Navigation reuses this screen instance rather than remounting it
  // when navigating here again from Projects with a different project —
  // useState's initial value only applies once, so without this, opening a
  // second project after the first would silently keep showing the first.
  useEffect(() => {
    const incomingId = route?.params?.projectId;
    if (!incomingId || incomingId === projectId) return;
    setProjectId(incomingId);
    setProjectName(route?.params?.projectName ?? '');
    setFloors([]);
    setFloorIdx(0);
    setCurrentSpot(null);
    setSpotCount(0);
  }, [route?.params?.projectId]);

  const captureWithPhoneCamera = async () => {
    if (!currentSpot) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return;

    setCapturing(true);
    setStatus('Saving photo…');
    try {
      const photoId = uuid.v4();
      const { localUri, checksum } = await savePhotoLocally(result.assets[0].uri, photoId);
      await insertPhoto({
        id: photoId,
        projectId,
        roomId: currentSpot.RoomId,
        spotId: currentSpot.SpotId,
        localUri,
        checksum,
      });
      setSpotCount((c) => c + 1);
      await refreshSpotCounts();
      setStatus('Saved to local queue');
    } catch (e) {
      setStatus(`Save failed: ${e.message}`);
      Alert.alert('Save failed', e.message);
    }
    setCapturing(false);
  };

  // When opened directly from the drawer there are no route params — fall back
  // to the project the worker last selected on the Projects screen.
  useEffect(() => {
    if (projectId) return;
    AsyncStorage.getItem('sv_project').then((id) => id && setProjectId(id));
  }, [projectId]);

  useEffect(() => {
    if (projectName || !projectId) return;
    cacheGet('cache:projects').then((cached) => {
      const match = (cached || []).find((p) => p.ProjectId === projectId);
      if (match) setProjectName(match.Name);
    });
  }, [projectId, projectName]);

  useEffect(() => {
    if (!projectId) return;
    const hasFloors = (rawFloors) => (rawFloors || []).length > 0;
    const load = async (rawFloors) => {
      const localized = await Promise.all(rawFloors.map(ensureLocalPlanImage));
      setFloors(localized);
      await cacheSet(`cache:structure:${projectId}`, localized);
    };
    const useCacheOrEmpty = async () => {
      const cached = await cacheGet(`cache:structure:${projectId}`);
      if (hasFloors(cached)) load(cached); else setFloors([]);
    };
    api.get(`/projects/${projectId}/structure`)
      // A live response with floors is always worth showing, even before any
      // spot has been added yet (e.g. right after a floor's plan image was
      // first set up) — only fall back to cache if the server has no floors
      // at all for this project.
      .then((r) => (hasFloors(r.data) ? load(r.data) : useCacheOrEmpty()))
      .catch(useCacheOrEmpty);
  }, [projectId]);

  const floor = floors[floorIdx];
  const [mergedFloor, setMergedFloor] = useState(null);

  // Recomputed on every focus (not just when floor/projectId change) so
  // returning from a sync — or from adding/deleting spots in Manage Spots —
  // always reflects the latest local + server spot list.
  const refreshMergedFloor = useCallback(async () => {
    if (!floor || !projectId) { setMergedFloor(null); return; }
    setMergedFloor(await getMergedSpotsForFloor(floor, projectId));
  }, [floor, projectId]);

  useFocusEffect(useCallback(() => { refreshMergedFloor(); }, [refreshMergedFloor]));

  const connectCamera = async () => {
    setConnecting(true);
    try {
      await osc.pingCamera();
      await osc.prepareImageMode();
      setConnected(true);
      setStatus('Connected');
    } catch (e) {
      setConnected(false);
      setStatus('Could not reach camera — check you joined its WiFi');
      Alert.alert('Camera not found', 'Make sure your phone is connected to the camera\'s WiFi network, then try again.');
    }
    setConnecting(false);
  };

  const selectSpot = async (s) => {
    setCurrentSpot(s);
    const rows = await getPhotosForSpot(s.SpotId);
    setSpotCount(rows.length);
  };

  const capturePhoto = async () => {
    if (!currentSpot) return;
    setCapturing(true);
    setStatus('Capturing…');
    try {
      const fileUrl = await osc.takePicture();
      const photoId = uuid.v4();
      const tempDest = `${photoId}.jpg`;
      setStatus('Transferring photo…');
      const localTempUri = await osc.downloadToLocal(fileUrl, `${require('expo-file-system').cacheDirectory}${tempDest}`);
      const { localUri, checksum } = await savePhotoLocally(localTempUri, photoId);

      await insertPhoto({
        id: photoId,
        projectId,
        roomId: currentSpot.RoomId,
        spotId: currentSpot.SpotId,
        localUri,
        checksum,
      });

      setSpotCount((c) => c + 1);
      await refreshSpotCounts();
      setStatus('Saved to device — will upload when you sync');
    } catch (e) {
      setStatus(`Capture failed: ${e.message}`);
      Alert.alert('Capture failed', e.message);
    }
    setCapturing(false);
  };

  return (
    <ScrollView style={styles.c}>

      <Text style={styles.h}>{projectName || 'Spot Capture'}</Text>

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
                <TouchableOpacity
                  style={[styles.modalRow, index === floorIdx && styles.modalRowActive]}
                  onPress={() => { setFloorIdx(index); setFloorPickerOpen(false); }}
                >
                  <Text style={styles.modalRowT}>{item.FloorName}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.card}>
        <View style={styles.planHead}>
          <Text style={styles.planTitle}>Tap your spot on the plan</Text>
        </View>
        <PlanPicker
          planUrl={floor?.FloorPlanImageUrl}
          rooms={mergedFloor?.rooms || []}
          activeSpotId={currentSpot?.SpotId}
          counts={spotCounts}
          onSelectSpot={selectSpot}
        />
        <Text style={styles.current}>
          Current spot: <Text style={{ color: colors.success }}>{currentSpot?.SpotName || 'none selected'}</Text>
          {currentSpot ? `  ·  ${spotCount} photo(s) saved` : ''}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.row}>Status: <Text style={{ color: colors.accent }}>{status}</Text></Text>
      </View>

      {!connected ? (
        <TouchableOpacity style={styles.btn} onPress={connectCamera} disabled={connecting}>
          {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Connect Camera</Text>}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.btn, (!currentSpot || capturing) && { opacity: 0.5 }]}
          disabled={!currentSpot || capturing}
          onPress={capturePhoto}
        >
          {capturing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>{currentSpot ? 'Capture' : 'Select a spot first'}</Text>}
        </TouchableOpacity>

      )}

      <TouchableOpacity
        style={[styles.btn, styles.btnSecondary, (!currentSpot || capturing) && { opacity: 0.5 }]}
        disabled={!currentSpot || capturing}
        onPress={captureWithPhoneCamera}
      >
        <Text style={styles.btnText}>{currentSpot ? 'Use Mobile Camera (test)' : 'Select a spot first'}</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Photos are saved to this phone only. Nothing uploads until you press Sync from the Projects screen once you're back on office WiFi.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  h: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 12, fontFamily: fonts.headingBold, letterSpacing: -0.4 },
  floorSelect: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.card, padding: 14, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  floorSelectLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body },
  floorSelectValue: { color: colors.text, fontWeight: '700', fontFamily: fonts.bodySemiBold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.card, maxHeight: 320, overflow: 'hidden' },
  modalRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalRowActive: { backgroundColor: colors.accentLight },
  modalRowT: { color: colors.text, fontWeight: '600', fontFamily: fonts.bodySemiBold },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planTitle: { color: colors.text, fontWeight: '700', fontFamily: fonts.heading },
  current: { color: colors.textMuted, marginTop: 10, fontFamily: fonts.body },
  row: { color: colors.textBody, marginBottom: 6, fontFamily: fonts.body },
  btn: { backgroundColor: colors.accent, padding: 16, borderRadius: radius.button, marginBottom: 12 },
  btnSecondary: { backgroundColor: colors.textMuted },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontFamily: fonts.bodySemiBold },
  note: { color: colors.textMuted, fontSize: 12, marginTop: 8, fontFamily: fonts.body },
});