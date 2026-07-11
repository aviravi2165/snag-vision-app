import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import LoginScreen from './src/screens/LoginScreen';
import ProjectsScreen from './src/screens/ProjectsScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import ManageSpotsScreen from './src/screens/ManageSpotsScreen';
import { watchConnectivityAndAutoSync } from './src/sync/syncEngine';
import { initDb } from './src/db/localStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DashboardScreen from './src/screens/DashboardScreen';
import AppDrawerContent from './src/components/AppDrawerContent';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#0e0f12', card: '#16181d', text: '#fff', border: '#2a2e37', primary: '#D92906' },
};

function MainDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: '#16181d' },
        headerTintColor: '#fff',
        drawerStyle: { backgroundColor: '#16181d' },
        drawerActiveTintColor: '#D92906',
        drawerInactiveTintColor: '#e8eaed',
      }}
    >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Drawer.Screen name="Projects" component={ProjectsScreen} />
      <Drawer.Screen
        name="Capture"
        component={CaptureScreen}
        options={{ title: 'Capture', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen name="ManageSpots" component={ManageSpotsScreen} options={{ title: 'Manage Spots' }} />
    </Drawer.Navigator>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  // null = still checking AsyncStorage — don't flash the Login screen for a
  // worker who's already signed in, and don't block a returning worker who's
  // offline behind a login call that can't possibly succeed.
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    initDb().then(() => setDbReady(true)).catch((e) => console.error('DB init failed', e));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('sv_token').then((token) => setInitialRoute(token ? 'Main' : 'Login'));
  }, []);

  useEffect(() => {
    const unsub = watchConnectivityAndAutoSync();
    return unsub;
  }, []);

  if (!dbReady || !initialRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0e0f12', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#D92906" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={theme}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerStyle: { backgroundColor: '#16181d' }, headerTintColor: '#fff' }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Main" component={MainDrawer} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}