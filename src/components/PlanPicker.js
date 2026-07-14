import React, { useState, useRef, useEffect } from 'react';
import { View, Image, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Pressable, PanResponder, useWindowDimensions } from 'react-native';
import { API_BASE_HOST } from '../api/client';
import { colors, fonts, radius } from '../theme';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// Selected spot always reads as yellow regardless of photo count (it's the
// one you're currently working on); otherwise green once at least one
// photo exists, red until then.
function colorForSpot(count, active) {
  if (active) return colors.warning;
  return count > 0 ? colors.success : colors.accent;
}

// Google-Maps-style single-image viewer: a fixed-size viewport with the
// (possibly zoomed-in) plan pannable inside it — drag in any direction,
// +/- buttons to zoom. Deliberately no pinch and no mouse wheel, only the
// two buttons drive zoom. Panning is driven by RN core's PanResponder
// (not react-native-gesture-handler) — a nested-ScrollView version of this
// only ever scrolled one axis reliably, and a GestureDetector-based pan
// crashed under Fabric when mixed with the TouchableOpacity pins.
// PanResponder shares the same underlying touch-responder system as
// TouchableOpacity/Pressable, so it doesn't have either problem, and it
// supports true diagonal dragging in one gesture.
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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pinSize = winW < 380 ? 6 : 9;

  const box = { w: viewport.w * zoom, h: viewport.h * zoom };
  const maxPan = { x: Math.max(0, box.w - viewport.w), y: Math.max(0, box.h - viewport.h) };
  const flatSpots = rooms.flatMap((r) => (r.spots || []).map((s) => ({ ...s, RoomId: s.RoomId || r.RoomId })));

  useEffect(() => { setImgState('loading'); }, [planUrl]);

  // Re-clamp whenever zoom (or the measured viewport) changes, so zooming
  // out never leaves the content stranded with a gap.
  useEffect(() => {
    setPan((p) => ({ x: clamp(p.x, -maxPan.x, 0), y: clamp(p.y, -maxPan.y, 0) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, viewport.w, viewport.h]);

  const panRef = useRef(pan);
  panRef.current = pan;
  const maxPanRef = useRef(maxPan);
  maxPanRef.current = maxPan;
  const dragStart = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture once real movement happens — lets a plain
      // tap on a pin (or empty space, in edit mode) pass through untouched.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => { dragStart.current = panRef.current; },
      onPanResponderMove: (_e, g) => {
        setPan({
          x: clamp(dragStart.current.x + g.dx, -maxPanRef.current.x, 0),
          y: clamp(dragStart.current.y + g.dy, -maxPanRef.current.y, 0),
        });
      },
    })
  ).current;

  const zoomTo = (next) => setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM));

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
        <View
          {...panResponder.panHandlers}
          style={{ position: 'absolute', left: pan.x, top: pan.y, width: box.w, height: box.h }}
        >
          <Pressable onPress={handleBackgroundPress} style={{ width: box.w, height: box.h }}>
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
              const size = active ? pinSize + 2 : pinSize ;
              return (
                <TouchableOpacity
                  key={s.SpotId}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => (editMode ? onDeleteSpot?.(s) : onSelectSpot?.(s))}
                  style={[styles.pin, {
                    left: s.CoordinateX * box.w - size / 2, top: s.CoordinateY * box.h - size / 2,
                    backgroundColor: editMode ? colors.textMuted : colorForSpot(count, active),
                    borderColor: active ? '#fff' : 'rgba(10, 6, 6, 0.7)',
                    width: size, height: size, borderRadius: size / 2,
                  }]}
                >
                  {editMode && <Text style={styles.pinT}>✕</Text>}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </View>

        {imgState !== 'loaded' && (
          <View style={styles.imgOverlay} pointerEvents="none">
            {imgState === 'loading'
              ? <ActivityIndicator color={colors.accent} />
              : <Text style={styles.imgOverlayT}>Plan image unavailable — spots below still work</Text>}
          </View>
        )}
        <View style={styles.countBadge} pointerEvents="none">
          <Text style={styles.countBadgeT}>{flatSpots.length} spot{flatSpots.length === 1 ? '' : 's'}</Text>
        </View>
        {editMode && (
          <View style={styles.hint} pointerEvents="none">
            <Text style={styles.hintT}>Tap empty space to add a spot · tap a pin to delete it</Text>
          </View>
        )}
      </View>

      <View style={styles.footRow}>
        {!editMode && (
          <View style={styles.legend}>
            <LegendItem color={colors.accent} label="Not captured" />
            <LegendItem color={colors.success} label="Captured" />
            <LegendItem color={colors.warning} label="Selected" />
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
  viewport: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceHover, borderRadius: radius.button, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 16 },
  imgOverlayT: { color: colors.textMuted, textAlign: 'center', fontSize: 12, fontFamily: fonts.body },
  pin: { position: 'absolute', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pinT: { color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: fonts.bodySemiBold },
  ph: { height: 180, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  phT: { color: colors.textMuted, fontFamily: fonts.body },
  countBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(17,17,17,.72)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  countBadgeT: { color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: fonts.bodySemiBold },
  hint: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(211,47,47,.92)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  hintT: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center', fontFamily: fonts.bodySemiBold },
  footRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, rowGap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1, gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendT: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body },
  zoomRow: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  zoomBtn: { width: 30, height: 30, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  zoomBtnDisabled: { opacity: 0.4 },
  zoomBtnT: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 18, fontFamily: fonts.bodySemiBold },
});
