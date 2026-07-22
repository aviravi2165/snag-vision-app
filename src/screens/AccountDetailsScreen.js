import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, radius } from '../theme';

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

  useEffect(() => {
    AsyncStorage.multiGet(['sv_name', 'sv_email', 'sv_role']).then((pairs) => {
      const map = Object.fromEntries(pairs);
      setAccount({ name: map.sv_name || '', email: map.sv_email || '', role: map.sv_role || '' });
    });
  }, []);

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
});
