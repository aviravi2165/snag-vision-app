import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('field@snagvision.io');
  const [password, setPassword] = useState('Password@123');
  const [err, setErr] = useState('');

  const login = async () => {
    try {
      navigation.replace('Main');
      const r = await api.post('/auth/login', { email, password });
      await AsyncStorage.setItem('sv_token', r.data.token);
    } catch {
      setErr('Invalid credentials');
    }
  };

  return (
    <View style={styles.c}>
      <Text style={styles.brand}>Snag<Text style={{ color: '#D92906' }}>Vision</Text></Text>
      <Text style={styles.sub}>Field Capture</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" placeholder="Email" placeholderTextColor="#888" />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor="#888" />
      {!!err && <Text style={{ color: '#D92906' }}>{err}</Text>}
      <TouchableOpacity style={styles.btn} onPress={login}><Text style={styles.btnText}>Sign In</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#0e0f12', padding: 24, justifyContent: 'center' },
  brand: { color: '#fff', fontSize: 32, fontWeight: '800' },
  sub: { color: '#9aa0aa', marginBottom: 24 },
  input: { backgroundColor: '#1f222a', color: '#fff', borderRadius: 8, padding: 14, marginBottom: 12 },
  btn: { backgroundColor: '#D92906', padding: 16, borderRadius: 10, marginTop: 10 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
});
