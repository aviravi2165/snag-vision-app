import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import { colors, fonts, radius } from '../theme';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('yashq@gmail.com');
  const [password, setPassword] = useState('password');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setErr('');
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { email, password });
      await AsyncStorage.multiSet([
        ['sv_token', r.data.token],
        ['sv_role', r.data.user.role],
        ['sv_name', r.data.user.name || ''],
        ['sv_email', r.data.user.email || ''],
      ]);
      navigation.replace('Main');
    } catch (e) {
      setErr(e.response?.status === 401 ? 'Invalid email or password' : 'Could not reach server — check your connection');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.c} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brandWrap}>
        <Text style={styles.brand}>Snag<Text style={{ color: colors.accent }}>Vision</Text></Text>
        <Text style={styles.sub}>Field Capture</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" placeholderTextColor={colors.placeholder} editable={!loading} />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.placeholder} editable={!loading} />
        {!!err && <Text style={styles.err}>{err}</Text>}
        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={login} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkWrap} onPress={() => navigation.replace('Register')} disabled={loading}>
          <Text style={styles.link}>New here? <Text style={{ color: colors.accent, fontFamily: fonts.bodySemiBold }}>Create an account</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' },
  brandWrap: { marginBottom: 32, alignItems: 'center' },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800', fontFamily: fonts.headingBold, letterSpacing: -0.5 },
  sub: { color: colors.textMuted, marginTop: 4, fontFamily: fonts.body },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4, fontFamily: fonts.bodySemiBold },
  input: { backgroundColor: colors.surfaceHover, color: colors.text, borderRadius: radius.button, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.body },
  err: { color: colors.danger, marginBottom: 8, fontSize: 13, fontFamily: fonts.bodyMedium },
  btn: { backgroundColor: colors.accent, padding: 16, borderRadius: radius.button, marginTop: 8 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontFamily: fonts.bodySemiBold },
  linkWrap: { marginTop: 16, alignItems: 'center' },
  link: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body },
});
