import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { API_BASE_HOST } from '../api/client';

// 0 photos = red (pending), 1 = yellow (needs another angle), 2+ = green (done).
function colorForCount(count) {
  if (count >= 2) return '#4fae5e';
  if (count === 1) return '#e3b341';
  return '#D92906';
}

export default function PlanPicker({ planUrl, rooms = [], activeSpotId, counts = {}, onSelectSpot }) {
  const [box, setBox] = useState({ w: 1, h: 1 });

  if (!planUrl) {
    return <View style={styles.ph}><Text style={styles.phT}>No floor plan for this floor yet.</Text></View>;
  }

  const uri = planUrl.startsWith('http') || planUrl.startsWith('file') ? planUrl : API_BASE_HOST + planUrl;

  return (
    <View style={styles.wrap} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Image source={{ uri }} style={styles.img} resizeMode="contain" />
      {rooms.flatMap((r) => (r.spots || []).map((s) => {
        const active = s.SpotId === activeSpotId;
        const count = counts[s.SpotId] || 0;
        return (
          <View key={s.SpotId} onTouchEnd={() => onSelectSpot?.(s)}
            style={[styles.pin, {
              left: s.CoordinateX * box.w - 11, top: s.CoordinateY * box.h - 11,
              backgroundColor: colorForCount(count),
              borderColor: active ? '#fff' : 'rgba(255,255,255,0.55)',
              width: active ? 26 : 22, height: active ? 26 : 22, borderRadius: 13,
            }]}>
            <Text style={styles.pinT}>{s.SortOrder}</Text>
          </View>
        );
      }))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  pin: { position: 'absolute', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pinT: { color: '#fff', fontSize: 10, fontWeight: '700' },
  ph: { height: 180, borderRadius: 8, borderWidth: 1, borderColor: '#2a2e37', alignItems: 'center', justifyContent: 'center', backgroundColor: '#16181d' },
  phT: { color: '#9aa0aa' },
});
