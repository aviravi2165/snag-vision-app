import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { CommonActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppDrawerContent(props) {
  const insets = useSafeAreaInsets();

  const logout = () => {
    Alert.alert('Sign out', 'You’ll need to sign in again to sync or load projects.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(['sv_token', 'sv_project']);
          // Reset the ROOT stack (Login/Main), not just the drawer, so the
          // back button can never return to an authenticated screen.
          props.navigation.getParent()?.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] })
          );
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#16181d' }}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.brand}>Snag<Text style={{ color: '#D92906' }}>Vision</Text></Text>
          <Text style={styles.sub}>Field Capture</Text>
        </View>
        <View style={styles.items}>
          <DrawerItemList {...props} />
        </View>
      </DrawerContentScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#2a2e37', marginBottom: 8 },
  brand: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: '#9aa0aa', fontSize: 12, marginTop: 2 },
  items: { paddingHorizontal: 8 },
  footer: { borderTopWidth: 1, borderTopColor: '#2a2e37', paddingHorizontal: 16, paddingTop: 12 },
  logoutBtn: { paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D92906', alignItems: 'center' },
  logoutText: { color: '#D92906', fontWeight: '700' },
});
