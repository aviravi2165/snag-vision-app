import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import uuid from 'react-native-uuid';
import api from '../api/client';
import * as osc from '../camera/oscClient';
import { insertPhoto, getPhotosForSpot } from '../db/localStore';
import { savePhotoLocally } from '../storage/fileStore';
import PlanPicker from '../components/PlanPicker';
import { MOCK_STRUCTURE } from '../data/mockStructure';
import * as ImagePicker from 'expo-image-picker';

import { cacheGet, cacheSet } from '../data/cache';
import { ensureLocalPlanImage } from '../data/planCache';

export default function CaptureScreen({ route }) {
  const { projectId } = route.params;
  const [floors, setFloors] = useState([]);
  const [floorIdx, setFloorIdx] = useState(0);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [currentSpot, setCurrentSpot] = useState(null);
  const [spotCount, setSpotCount] = useState(0);
  const [addMode, setAddMode] = useState(false);
  const [status, setStatus] = useState('Not connected to camera');



  // const handlePhoneCapture = async (dataUrl) => {
  //   if (!currentSpot) return;
  //   const photoId = uuid.v4();
  //   const { localUri, checksum } = await savePhotoLocally(dataUrl, photoId);
  //   await insertPhoto({ id: photoId, projectId, roomId: currentSpot.RoomId, spotId: currentSpot.SpotId, localUri, checksum });
  //   setSpotCount((c) => c + 1);
  //   setStatus('Saved to local queue');
  // };

  // NOTE: this must run BEFORE joining the camera's WiFi — once the phone
  // joins the camera's AP it has no internet, so the floor/room/spot
  // structure has to already be cached locally by this point.
  // useEffect(() => {
  //   api.get(`/projects/${projectId}/structure`).then((r) => setFloors(r.data)).catch(() => { });
  // }, []);

  const captureWithPhoneCamera = async () => {
    // if (!currentSpot) return;
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
        roomId:  'jksdn' ?? currentSpot.RoomId,
        spotId: 'kjsndv' ?? currentSpot.SpotId,
        localUri,
        checksum,
      });
      setSpotCount((c) => c + 1);
      setStatus('Saved to local queue');
    } catch (e) {
      setStatus(`Save failed: ${e.message}`);
      Alert.alert('Save failed', e.message);
    }
    setCapturing(false);
  };

  // useEffect(() => {
  //   api.get(`/projects/${projectId}/structure`)
  //     .then((r) => setFloors(MOCK_STRUCTURE ?? r.data))
  //     .catch(() => setFloors(MOCK_STRUCTURE));
  // }, []);

  useEffect(() => {
    const load = async (rawFloors) => {
      const localized = await Promise.all(rawFloors.map(ensureLocalPlanImage));
      setFloors(localized);
      await cacheSet(`cache:structure:${projectId}`, localized);
    };
    api.get(`/projects/${projectId}/structure`)
      .then((r) => load(r.data))
      .catch(async () => {
        const cached = await cacheGet(`cache:structure:${projectId}`);
        load(cached || MOCK_STRUCTURE);
      });
  }, []);

  const floor = floors[floorIdx];

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

  const addSpotAt = async (x, y) => {
    if (!floor?.rooms?.length) { Alert.alert('Add a room first in Master Setup'); return; }
    const room = floor.rooms[0];
    const name = `Spot ${(room.spots?.length || 0) + 1}`;
    const r = await api.post(`/rooms/${room.RoomId}/spots`, { spotName: name, coordinateX: x, coordinateY: y });
    const fresh = await api.get(`/projects/${projectId}/structure`);
    setFloors(fresh.data);
    setAddMode(false);
    selectSpot(r.data);
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
      setStatus('Saved to device — will upload when you sync');
    } catch (e) {
      setStatus(`Capture failed: ${e.message}`);
      Alert.alert('Capture failed', e.message);
    }
    setCapturing(false);
  };

  return (
    <ScrollView style={styles.c}>
      <Text style={styles.h}>Spot Capture</Text>

      {floors.length > 1 && (
        <View style={styles.floorRow}>
          {floors.map((f, i) => (
            <TouchableOpacity key={f.FloorId} onPress={() => setFloorIdx(i)}
              style={[styles.chip, i === floorIdx && styles.chipActive]}>
              <Text style={styles.chipT}>{f.FloorName}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* <PhoneCameraCapture ref={cameraRef} onCapture={handlePhoneCapture} />  */}

      <View style={styles.card}>
        <View style={styles.planHead}>
          <Text style={styles.planTitle}>Tap your spot on the plan</Text>
          <TouchableOpacity onPress={() => setAddMode((v) => !v)} style={[styles.smallBtn, addMode && styles.smallBtnOn]}>
            <Text style={styles.smallBtnT}>{addMode ? 'Cancel' : '+ New Spot'}</Text>
          </TouchableOpacity>
        </View>
        <PlanPicker
          planUrl={floor?.FloorPlanImageUrl}
          rooms={floor?.rooms || []}
          activeSpotId={currentSpot?.SpotId}
          addMode={addMode}
          onSelectSpot={selectSpot}
          onAddPoint={addSpotAt}
        />
        <Text style={styles.current}>
          Current spot: <Text style={{ color: '#4fae5e' }}>{currentSpot?.SpotName || 'none selected'}</Text>
          {currentSpot ? `  ·  ${spotCount} photo(s) saved` : ''}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.row}>Status: <Text style={{ color: '#D92906' }}>{status}</Text></Text>
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
        style={[styles.btn, { backgroundColor: '#2a2e37' }, (!currentSpot || capturing) && { opacity: 0.5 }]}
        // disabled={!currentSpot || capturing}
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
  c: { flex: 1, backgroundColor: '#0e0f12', padding: 16 },
  h: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  floorRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#16181d', borderRadius: 16, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#2a2e37' },
  chipActive: { backgroundColor: '#D92906', borderColor: '#D92906' },
  chipT: { color: '#e8eaed', fontSize: 12 },
  card: { backgroundColor: '#16181d', borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#2a2e37', marginBottom: 16 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planTitle: { color: '#fff', fontWeight: '700' },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#D92906' },
  smallBtnOn: { backgroundColor: '#D92906' },
  smallBtnT: { color: '#fff', fontSize: 12 },
  current: { color: '#9aa0aa', marginTop: 10 },
  row: { color: '#e8eaed', marginBottom: 6 },
  btn: { backgroundColor: '#D92906', padding: 16, borderRadius: 10, marginBottom: 12 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  note: { color: '#9aa0aa', fontSize: 12, marginTop: 8 },
});