import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorageStats, clearSyncedPhotoFiles } from '../db/localStore';
import { colors, fonts, radius } from '../theme';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Plain-language summary of what each role can actually do in this app —
// kept in sync with the backend's real enforcement, not aspirational:
// spot/room create+delete is gated to admin/project_manager
// (require_mobile_role in routers/mobile.py); photo capture/upload has no
// role restriction at all, any signed-in account can do that.
const ROLE_INFO = {
  admin: {
    label: 'Admin',
    summary: 'Full access. You can capture photos, and add or remove spots and rooms across every project.',
  },
  project_manager: {
    label: 'Project Manager',
    summary: 'You can capture photos, and add or remove spots and rooms — the same day-to-day control as an Admin.',
  },
  site_supervisor: {
    label: 'Site Supervisor',
    summary: 'You can capture photos and view spots and rooms. Adding or removing spots and rooms needs an Admin or Project Manager.',
  },
};

export default function AccountDetailsScreen() {
  const [account, setAccount] = useState({ name: '', email: '', role: '' });
  const [storage, setStorage] = useState(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['sv_name', 'sv_email', 'sv_role']).then((pairs) => {
      const map = Object.fromEntries(pairs);
      setAccount({ name: map.sv_name || '', email: map.sv_email || '', role: map.sv_role || '' });
    });
  }, []);

  const refreshStorage = useCallback(() => { getStorageStats().then(setStorage); }, []);
  useEffect(() => { refreshStorage(); }, [refreshStorage]);

  const clearSynced = () => {
    if (!storage?.doneCount) return;
    Alert.alert(
      'Clear synced photos?',
      `${storage.doneCount} photo(s) already uploaded (${formatBytes(storage.doneBytes)}) will be removed from this phone. They stay on the server — this only frees up space here.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            await clearSyncedPhotoFiles();
            await refreshStorage();
            setClearing(false);
          },
        },
      ]
    );
  };

  const roleInfo = ROLE_INFO[account.role] || {
    label: account.role || 'Unknown',
    summary: 'Ask an admin what this role can do.',
  };

  return (
    <ScrollView style={styles.c}>
      <Text style={styles.h}>Account Details</Text>

      <View style={styles.card}>
        <Field label="Name" value={account.name || '—'} />
        <Field label="Email" value={account.email || '—'} />
        <Field label="Role" value={roleInfo.label} last />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What you can do</Text>
        <Text style={styles.summary}>{roleInfo.summary}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Storage</Text>
        {storage ? (
          <>
            <Text style={styles.summary}>
              {storage.totalCount} photo(s) on this device — {formatBytes(storage.totalBytes)}
            </Text>
            <Text style={[styles.summary, { marginTop: 4 }]}>
              {storage.doneCount > 0
                ? `${storage.doneCount} already synced (${formatBytes(storage.doneBytes)}) can be cleared`
                : 'Nothing synced yet to clear'}
            </Text>
            <TouchableOpacity
              style={[styles.clearBtn, (!storage.doneCount || clearing) && { opacity: 0.5 }]}
              onPress={clearSynced}
              disabled={!storage.doneCount || clearing}
            >
              {clearing ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={styles.clearBtnT}>Clear synced photos</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={colors.accent} size="small" />
        )}
      </View>
    </ScrollView>
  );
}

function Field({ label, value, last }) {
  return (
    <View style={[styles.field, !last && styles.fieldBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  h: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 16, fontFamily: fonts.headingBold, letterSpacing: -0.4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  field: { paddingVertical: 12 },
  fieldBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body, marginBottom: 4 },
  fieldValue: { color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: fonts.bodySemiBold },
  sectionTitle: { color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 8, fontFamily: fonts.heading },
  summary: { color: colors.textBody, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  clearBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: radius.button, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  clearBtnT: { color: colors.accent, fontWeight: '700', fontFamily: fonts.bodySemiBold },
});
