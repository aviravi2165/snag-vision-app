import React, { useState, useEffect } from 'react';
import { View, Image, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
import { API_BASE_HOST } from '../api/client';

const ZOOM_LEVELS = [1, 1.5, 2];
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// 0 photos = red (pending), 1 = yellow (needs another angle), 2+ = green (done).
function colorForCount(count) {
  if (count >= 2) return '#4fae5e';
  if (count === 1) return '#e3b341';
  return '#D92906';
}

// Static floor plan — no pinch/pan. An earlier gesture-based (react-native-
// gesture-handler + reanimated worklets) version crashed under Fabric, so
// this sticks to plain RN touch components only (Pressable/TouchableOpacity)
// — a single, well-supported touch system, nothing mixed. "Zoom" just grows
// the container taller via the +/- buttons below (resizeMode="contain" keeps
// the whole plan visible at any zoom level, so there's never anything to pan
// to — no scrolling needed).
// editMode swaps normal spot-select taps for add/delete (used by the
// Manage Spots screen only — Capture screen never sets this).
export default function PlanPicker({
  planUrl, rooms = [], activeSpotId, counts = {},
  onSelectSpot, editMode = false, onAddPoint, onDeleteSpot,
}) {
  const { width: winW } = useWindowDimensions();
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [imgState, setImgState] = useState('loading'); // loading | loaded | error
  const [zoomIdx, setZoomIdx] = useState(0);
  const pinSize = winW < 380 ? 22 : 26;
  const zoom = ZOOM_LEVELS[zoomIdx];

  const flatSpots = rooms.flatMap((r) => (r.spots || []).map((s) => ({ ...s, RoomId: s.RoomId || r.RoomId })));

  useEffect(() => { setImgState('loading'); }, [planUrl]);

  const handleBackgroundPress = (e) => {
    if (!editMode || !onAddPoint) return;
    const { locationX, locationY } = e.nativeEvent;
    const x = clamp(locationX / box.w, 0, 1);
    const y = clamp(locationY / box.h, 0, 1);
    onAddPoint(x, y);
  };

  if (!planUrl) {
    return <View style={styles.ph}><Text style={styles.phT}>No floor plan for this floor yet.</Text></View>;
  }

  const uri = planUrl.startsWith('http') || planUrl.startsWith('file') ? planUrl : API_BASE_HOST + planUrl;

  return (
    <View>
      <Pressable onPress={handleBackgroundPress}>
        <View
          style={[styles.wrap, { aspectRatio: 1 / zoom }]}
          onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          <Image
            source={{ uri }}
            style={styles.img}
            resizeMode="contain"
            onLoad={() => setImgState('loaded')}
            onError={() => setImgState('error')}
          />
          {flatSpots.map((s) => {
            const active = s.SpotId === activeSpotId;
            const count = counts[s.SpotId] || 0;
            const size = active ? pinSize + 6 : pinSize;
            return (
              <TouchableOpacity
                key={s.SpotId}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => (editMode ? onDeleteSpot?.(s) : onSelectSpot?.(s))}
                style={[styles.pin, {
                  left: s.CoordinateX * box.w - size / 2, top: s.CoordinateY * box.h - size / 2,
                  backgroundColor: editMode ? '#6a707b' : colorForCount(count),
                  borderColor: active ? '#fff' : 'rgba(255,255,255,0.55)',
                  width: size, height: size, borderRadius: size / 2,
                }]}
              >
                <Text style={styles.pinT}>{editMode ? '✕' : s.SortOrder}</Text>
              </TouchableOpacity>
            );
          })}
          {imgState !== 'loaded' && (
            <View style={styles.imgOverlay} pointerEvents="none">
              {imgState === 'loading'
                ? <ActivityIndicator color="#D92906" />
                : <Text style={styles.imgOverlayT}>Plan image unavailable — spots below still work</Text>}
            </View>
          )}
          {editMode && (
            <View style={styles.hint} pointerEvents="none">
              <Text style={styles.hintT}>Tap empty space to add a spot · tap a pin to delete it</Text>
            </View>
          )}
        </View>
      </Pressable>

      <View style={styles.footRow}>
        {!editMode && (
          <View style={styles.legend}>
            <LegendItem color="#D92906" label="Pending" />
            <LegendItem color="#e3b341" label="1 photo" />
            <LegendItem color="#4fae5e" label="2+ photos" />
          </View>
        )}
        <View style={styles.zoomRow}>
          <TouchableOpacity
            style={[styles.zoomBtn, zoomIdx === 0 && styles.zoomBtnDisabled]}
            disabled={zoomIdx === 0}
            onPress={() => setZoomIdx((i) => Math.max(i - 1, 0))}
          >
            <Text style={styles.zoomBtnT}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zoomBtn, zoomIdx === ZOOM_LEVELS.length - 1 && styles.zoomBtnDisabled]}
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            onPress={() => setZoomIdx((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1))}
          >
            <Text style={styles.zoomBtnT}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function LegendItem({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendT}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', backgroundColor: '#1f222a', borderRadius: 8, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 16 },
  imgOverlayT: { color: '#9aa0aa', textAlign: 'center', fontSize: 12 },
  pin: { position: 'absolute', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pinT: { color: '#fff', fontSize: 11, fontWeight: '700' },
  ph: { height: 180, borderRadius: 8, borderWidth: 1, borderColor: '#2a2e37', alignItems: 'center', justifyContent: 'center', backgroundColor: '#16181d' },
  phT: { color: '#9aa0aa' },
  hint: { position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(217,41,6,.92)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  hintT: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendT: { color: '#9aa0aa', fontSize: 12 },
  zoomRow: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  zoomBtn: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, borderColor: '#2a2e37', backgroundColor: '#16181d', alignItems: 'center', justifyContent: 'center' },
  zoomBtnDisabled: { opacity: 0.4 },
  zoomBtnT: { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 18 },
});
