import React, { useState, useEffect } from 'react';
import { View, Image, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { API_BASE_HOST } from '../api/client';

// 0 photos = red (pending), 1 = yellow (needs another angle), 2+ = green (done).
function colorForCount(count) {
  if (count >= 2) return '#4fae5e';
  if (count === 1) return '#e3b341';
  return '#D92906';
}

export default function PlanPicker({ planUrl, rooms = [], activeSpotId, counts = {}, onSelectSpot }) {
  const { width: winW } = useWindowDimensions();
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [imgState, setImgState] = useState('loading'); // loading | loaded | error
  const pinSize = winW < 380 ? 24 : 28;

  useEffect(() => { setImgState('loading'); }, [planUrl]);

  if (!planUrl) {
    return <View style={styles.ph}><Text style={styles.phT}>No floor plan for this floor yet.</Text></View>;
  }

  const uri = planUrl.startsWith('http') || planUrl.startsWith('file') ? planUrl : API_BASE_HOST + planUrl;

  return (
    <View>
      <View style={styles.wrap} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Image
          source={{ uri }}
          style={styles.img}
          resizeMode="contain"
          onLoad={() => setImgState('loaded')}
          onError={() => setImgState('error')}
        />
        {imgState !== 'loaded' && (
          <View style={styles.imgOverlay} pointerEvents="none">
            {imgState === 'loading'
              ? <ActivityIndicator color="#D92906" />
              : <Text style={styles.imgOverlayT}>Plan image unavailable — spots below still work</Text>}
          </View>
        )}
        {rooms.flatMap((r) => (r.spots || []).map((s) => {
          const active = s.SpotId === activeSpotId;
          const count = counts[s.SpotId] || 0;
          const size = active ? pinSize + 6 : pinSize;
          return (
            <Pressable
              key={s.SpotId}
              onPress={() => onSelectSpot?.(s)}
              hitSlop={10}
              style={[styles.pin, {
                left: s.CoordinateX * box.w - size / 2, top: s.CoordinateY * box.h - size / 2,
                backgroundColor: colorForCount(count),
                borderColor: active ? '#fff' : 'rgba(255,255,255,0.55)',
                width: size, height: size, borderRadius: size / 2,
              }]}
            >
              <Text style={styles.pinT}>{s.SortOrder}</Text>
            </Pressable>
          );
        }))}
      </View>
      <View style={styles.legend}>
        <LegendItem color="#D92906" label="Pending" />
        <LegendItem color="#e3b341" label="1 photo" />
        <LegendItem color="#4fae5e" label="2+ photos" />
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
  wrap: { width: '100%', aspectRatio: 1, backgroundColor: '#1f222a', borderRadius: 8, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 16 },
  imgOverlayT: { color: '#9aa0aa', textAlign: 'center', fontSize: 12 },
  pin: { position: 'absolute', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pinT: { color: '#fff', fontSize: 11, fontWeight: '700' },
  ph: { height: 180, borderRadius: 8, borderWidth: 1, borderColor: '#2a2e37', alignItems: 'center', justifyContent: 'center', backgroundColor: '#16181d' },
  phT: { color: '#9aa0aa' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendT: { color: '#9aa0aa', fontSize: 12 },
});
