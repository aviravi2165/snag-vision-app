import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ProjectsScreen from './src/screens/ProjectsScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import ManageSpotsScreen from './src/screens/ManageSpotsScreen';
import AccountDetailsScreen from './src/screens/AccountDetailsScreen';
import { watchConnectivityAndAutoSync, onSyncProgress } from './src/sync/syncEngine';
import { initDb } from './src/db/localStore';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isExpiredAt, clearSession } from './src/auth/session';
import { navigationRef, resetToLogin } from './src/navigation/navigationRef';
import DashboardScreen from './src/screens/DashboardScreen';
import AppDrawerContent from './src/components/AppDrawerContent';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { colors, fonts } from './src/theme';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent },
};

function MainDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontFamily: fonts.heading },
        headerTintColor: colors.text,
        drawerStyle: { backgroundColor: colors.surface },
        drawerActiveTintColor: colors.accent,
        drawerInactiveTintColor: colors.textBody,
        drawerLabelStyle: { fontFamily: fonts.bodyMedium },
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
      <Drawer.Screen
        name="AccountDetails"
        component={AccountDetailsScreen}
        options={{ title: 'Account Details', drawerItemStyle: { display: 'none' } }}
      />
    </Drawer.Navigator>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  // null = still checking AsyncStorage — don't flash the Login screen for a
  // worker who's already signed in, and don't block a returning worker who's
  // offline behind a login call that can't possibly succeed.
  const [initialRoute, setInitialRoute] = useState(null);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    initDb().then(() => setDbReady(true)).catch((e) => console.error('DB init failed', e));
  }, []);

  useEffect(() => {
    AsyncStorage.multiGet(['sv_token', 'sv_token_exp']).then((pairs) => {
      const map = Object.fromEntries(pairs);
      const valid = map.sv_token && !isExpiredAt(map.sv_token_exp ? Number(map.sv_token_exp) : null);
      setInitialRoute(valid ? 'Main' : 'Login');
    });
  }, []);

  useEffect(() => {
    const unsub = watchConnectivityAndAutoSync();
    return unsub;
  }, []);

  // Catches the case a network call would never surface: phone sits
  // overnight with the token expiring while fully offline, then reopens the
  // app next morning — nothing else would notice until some request 401s.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const pairs = await AsyncStorage.multiGet(['sv_token', 'sv_token_exp']);
      const map = Object.fromEntries(pairs);
      if (map.sv_token && isExpiredAt(map.sv_token_exp ? Number(map.sv_token_exp) : null)) {
        await clearSession();
        resetToLogin();
      }
    });
    return () => sub.remove();
  }, []);

  // The one place mid-sync auth failures surface — syncEngine only ever
  // notifies, it never imports navigation itself.
  useEffect(() => onSyncProgress((e) => { if (e.type === 'auth-expired') resetToLogin(); }), []);

  if (!dbReady || !initialRoute || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef} theme={theme}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTitleStyle: { fontFamily: fonts.heading }, headerTintColor: colors.text }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Main" component={MainDrawer} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}