import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import ProjectsScreen from './src/screens/ProjectsScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import { watchConnectivityAndAutoSync } from './src/sync/syncEngine';
import { initDb } from './src/db/localStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator } from 'react-native';

const Stack = createNativeStackNavigator();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#0e0f12', card: '#16181d', text: '#fff', border: '#2a2e37', primary: '#D92906' },
};

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDb().then(() => setDbReady(true)).catch((e) => console.error('DB init failed', e));
  }, []);

  useEffect(() => {
    const unsub = watchConnectivityAndAutoSync();
    return unsub;
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0e0f12', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#D92906" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={theme}>
        <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#16181d' }, headerTintColor: '#fff' }}>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Projects" component={ProjectsScreen} />
          <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: 'Capture' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}