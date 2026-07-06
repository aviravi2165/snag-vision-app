import React, { useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { API_BASE_HOST } from '../api/client';

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

export default function PlanPicker({ planUrl, rooms = [], activeSpotId, addMode, onSelectSpot, onAddPoint }) {
  const [box, setBox] = useState({ w: 1, h: 1 });
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE); })
    .onEnd(() => { savedScale.value = scale.value; });
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });
  const tap = Gesture.Tap().maxDuration(250).onEnd((e) => {
    if (!addMode || !onAddPoint) return;
    const x = clamp((e.x - translateX.value) / (box.w * scale.value), 0, 1);
    const y = clamp((e.y - translateY.value) / (box.h * scale.value), 0, 1);
    runOnJS(onAddPoint)(x, y);
  });
  const composed = Gesture.Simultaneous(pinch, pan, tap);

  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));
  const pinStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 / scale.value }] }));

  const resetView = () => {
    scale.value = withTiming(1); savedScale.value = 1;
    translateX.value = withTiming(0); savedTranslateX.value = 0;
    translateY.value = withTiming(0); savedTranslateY.value = 0;
  };

  // Every hook above runs unconditionally on every render — this branch now
  // only decides what to render, not which hooks execute, fixing the
  // "change in order of Hooks" crash.
  if (!planUrl) {
    return <View style={styles.ph}><Text style={styles.phT}>No floor plan for this floor yet.</Text></View>;
  }

  const uri = planUrl.startsWith('http') || planUrl.startsWith('file') ? planUrl : API_BASE_HOST + planUrl;

  return (
    <View>
      <GestureDetector gesture={composed}>
        <View style={styles.wrap} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          <Animated.View style={[styles.layer, layerStyle]}>
            <Image source={{ uri }} style={styles.img} resizeMode="contain" />
            {rooms.flatMap((r) => (r.spots || []).map((s) => {
              const active = s.SpotId === activeSpotId;
              return (
                <Animated.View key={s.SpotId} onTouchEnd={() => !addMode && onSelectSpot?.(s)}
                  style={[styles.pin, pinStyle, {
                    left: s.CoordinateX * box.w - 11, top: s.CoordinateY * box.h - 11,
                    backgroundColor: active ? '#4fae5e' : (r.ColorHex || '#D92906'),
                    width: active ? 26 : 22, height: active ? 26 : 22, borderRadius: 13,
                  }]}>
                  <Text style={styles.pinT}>{s.SortOrder}</Text>
                </Animated.View>
              );
            }))}
          </Animated.View>
          {addMode && <View style={styles.hint}><Text style={styles.hintT}>Tap the plan where you are standing</Text></View>}
        </View>
      </GestureDetector>
      <Text onPress={resetView} style={styles.resetLink}>Reset zoom</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' },
  layer: { width: '100%', height: '100%', position: 'absolute' },
  img: { width: '100%', height: '100%' },
  pin: { position: 'absolute', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pinT: { color: '#fff', fontSize: 10, fontWeight: '700' },
  ph: { height: 180, borderRadius: 8, borderWidth: 1, borderColor: '#2a2e37', alignItems: 'center', justifyContent: 'center', backgroundColor: '#16181d' },
  phT: { color: '#9aa0aa' },
  hint: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(217,41,6,.92)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  hintT: { color: '#fff', fontSize: 11, fontWeight: '600' },
  resetLink: { color: '#D92906', textAlign: 'right', marginTop: 6, fontSize: 12, fontWeight: '600' },
});