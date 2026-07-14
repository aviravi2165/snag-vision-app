import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { CommonActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../theme';

export default function AppDrawerContent(props) {
  const insets = useSafeAreaInsets();

  const logout = () => {
    Alert.alert('Sign out', 'You’ll need to sign in again to sync or load projects.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(['sv_token', 'sv_project', 'sv_role']);
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
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.brand}>Snag<Text style={{ color: colors.accent }}>Vision</Text></Text>
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
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 8 },
  brand: { color: colors.text, fontSize: 22, fontWeight: '800', fontFamily: fonts.headingBold, letterSpacing: -0.4 },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily: fonts.body },
  items: { paddingHorizontal: 8 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingTop: 12 },
  logoutBtn: { paddingVertical: 12, borderRadius: radius.button, borderWidth: 1, borderColor: colors.accent, alignItems: 'center' },
  logoutText: { color: colors.accent, fontWeight: '700', fontFamily: fonts.bodySemiBold },
});
