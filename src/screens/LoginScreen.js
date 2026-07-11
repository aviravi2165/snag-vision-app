import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('field@snagvision.io');
  const [password, setPassword] = useState('Password@123');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setErr('');
    setLoading(true);
    try {
      const r = await api.post('/auth/login', { email, password });
      await AsyncStorage.setItem('sv_token', r.data.token);
      navigation.replace('Main');
    } catch (e) {
      setErr(e.response?.status === 401 ? 'Invalid email or password' : 'Could not reach server — check your connection');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.c} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brandWrap}>
        <Text style={styles.brand}>Snag<Text style={{ color: '#D92906' }}>Vision</Text></Text>
        <Text style={styles.sub}>Field Capture</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" placeholderTextColor="#5a5f6a" editable={!loading} />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor="#5a5f6a" editable={!loading} />
        {!!err && <Text style={styles.err}>{err}</Text>}
        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={login} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#0e0f12', padding: 24, justifyContent: 'center' },
  brandWrap: { marginBottom: 32, alignItems: 'center' },
  brand: { color: '#fff', fontSize: 34, fontWeight: '800' },
  sub: { color: '#9aa0aa', marginTop: 4 },
  card: { backgroundColor: '#16181d', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#2a2e37' },
  label: { color: '#9aa0aa', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: '#1f222a', color: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#2a2e37' },
  err: { color: '#D92906', marginBottom: 8, fontSize: 13 },
  btn: { backgroundColor: '#D92906', padding: 16, borderRadius: 10, marginTop: 8 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
});
