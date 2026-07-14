import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import { colors, fonts, radius } from '../theme';

// Field-relevant roles only — "client" is a web-viewer role with no reason
// to have a field-capture account. Matches models.database.UserRole.
const ROLES = [
  { value: 'site_supervisor', label: 'Site Supervisor' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'admin', label: 'Admin' },
];

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('site_supervisor');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const register = async () => {
    setErr('');
    if (!name.trim() || !email.trim() || !password) {
      setErr('Fill in your name, email, and password');
      return;
    }
    setLoading(true);
    try {
      const r = await api.post('/auth/register', { name: name.trim(), email: email.trim(), password, role });
      await AsyncStorage.multiSet([
        ['sv_token', r.data.token],
        ['sv_role', r.data.user.role],
      ]);
      navigation.replace('Main');
    } catch (e) {
      setErr(e.response?.status === 400 ? 'That email is already registered' : 'Could not reach server — check your connection');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.c} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <Text style={styles.brand}>Snag<Text style={{ color: colors.accent }}>Vision</Text></Text>
          <Text style={styles.sub}>Create an account</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Jane Doe" placeholderTextColor={colors.placeholder} editable={!loading} />
          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" placeholderTextColor={colors.placeholder} editable={!loading} />
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.placeholder} editable={!loading} />
          <Text style={styles.label}>Role</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.roleChip, role === r.value && styles.roleChipActive]}
                onPress={() => setRole(r.value)}
                disabled={loading}
              >
                <Text style={[styles.roleChipT, role === r.value && styles.roleChipTActive]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!!err && <Text style={styles.err}>{err}</Text>}
          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={register} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkWrap} onPress={() => navigation.replace('Login')} disabled={loading}>
            <Text style={styles.link}>Already have an account? <Text style={{ color: colors.accent, fontFamily: fonts.bodySemiBold }}>Sign in</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  brandWrap: { marginBottom: 24, alignItems: 'center' },
  brand: { color: colors.text, fontSize: 30, fontWeight: '800', fontFamily: fonts.headingBold, letterSpacing: -0.5 },
  sub: { color: colors.textMuted, marginTop: 4, fontFamily: fonts.body },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4, fontFamily: fonts.bodySemiBold },
  input: { backgroundColor: colors.surfaceHover, color: colors.text, borderRadius: radius.button, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.body },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHover },
  roleChipActive: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  roleChipT: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.bodyMedium },
  roleChipTActive: { color: colors.accentDark, fontFamily: fonts.bodySemiBold },
  err: { color: colors.danger, marginBottom: 8, fontSize: 13, fontFamily: fonts.bodyMedium },
  btn: { backgroundColor: colors.accent, padding: 16, borderRadius: radius.button, marginTop: 8 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontFamily: fonts.bodySemiBold },
  linkWrap: { marginTop: 16, alignItems: 'center' },
  link: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body },
});
