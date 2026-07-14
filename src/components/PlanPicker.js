import React, { useState, useRef, useEffect } from 'react';
import { View, Image, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { API_BASE_HOST } from '../api/client';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// 0 photos = red (pending), 1 = yellow (needs another angle), 2+ = green (done).
function colorForCount(count) {
  if (count >= 2) return '#4fae5e';
  if (count === 1) return '#e3b341';
  return '#D92906';
}

// Google-Maps-style single-image viewer: a fixed-size viewport with the
// (possibly zoomed-in) plan scrollable inside it — drag to pan in any
// direction, +/- buttons to zoom. Deliberately no pinch and no mouse wheel,
// only the two buttons drive zoom. Built on plain RN ScrollView/Touchable
// components only (no gesture-handler/reanimated) — a nested pinch+pan
// gesture-handler version of this crashed under Fabric; ScrollView is RN's
// own native, single touch system and doesn't mix with the TouchableOpacity
// pins the way that did.
// editMode swaps normal spot-select taps for add/delete (used by the
// Manage Spots screen only — Capture screen never sets this).
export default function PlanPicker({
  planUrl, rooms = [], activeSpotId, counts = {},
  onSelectSpot, editMode = false, onAddPoint, onDeleteSpot,
}) {
  const { width: winW } = useWindowDimensions();
  const [viewport, setViewport] = useState({ w: 1, h: 1 });
  const [imgState, setImgState] = useState('loading'); // loading | loaded | error
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const hScrollRef = useRef(null);
  const vScrollRef = useRef(null);
  const pinSize = winW < 380 ? 22 : 26;

  const box = { w: viewport.w * zoom, h: viewport.h * zoom };
  const flatSpots = rooms.flatMap((r) => (r.spots || []).map((s) => ({ ...s, RoomId: s.RoomId || r.RoomId })));

  useEffect(() => { setImgState('loading'); }, [planUrl]);

  const zoomTo = (next) => {
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    setZoom(clamped);
    if (clamped === MIN_ZOOM) {
      hScrollRef.current?.scrollTo({ x: 0, animated: true });
      vScrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

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
      <View
        style={styles.viewport}
        onLayout={(e) => setViewport({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <ScrollView
          ref={hScrollRef}
          horizontal
          scrollEnabled={zoom > MIN_ZOOM}
          showsHorizontalScrollIndicator={false}
          bounces={false}
        >
          <ScrollView
            ref={vScrollRef}
            scrollEnabled={zoom > MIN_ZOOM}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Pressable onPress={handleBackgroundPress}>
              <View style={{ width: box.w, height: box.h }}>
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
              </View>
            </Pressable>
          </ScrollView>
        </ScrollView>

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
            style={[styles.zoomBtn, zoom <= MIN_ZOOM && styles.zoomBtnDisabled]}
            disabled={zoom <= MIN_ZOOM}
            onPress={() => zoomTo(zoom - ZOOM_STEP)}
          >
            <Text style={styles.zoomBtnT}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.zoomBtn, zoom >= MAX_ZOOM && styles.zoomBtnDisabled]}
            disabled={zoom >= MAX_ZOOM}
            onPress={() => zoomTo(zoom + ZOOM_STEP)}
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
  viewport: { width: '100%', aspectRatio: 1, backgroundColor: '#1f222a', borderRadius: 8, overflow: 'hidden' },
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
