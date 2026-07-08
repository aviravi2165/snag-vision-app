import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import SyncStatusBar from '../components/SyncStatusBar';
import { cacheGet, cacheSet } from '../data/cache';



const MOCK_PROJECTS = [
  { ProjectId: 'proj-1', Name: 'Courtyard by Marriott — Bharuch', Folder: 'IEVO', City: 'Bharuch', FloorCount: 1 },
  { ProjectId: 'proj-2', Name: 'WhyJack', Folder: 'IEVO', City: 'Pune', FloorCount: 2 },
];

export default function ProjectsScreen({ navigation }) {
  const [projects, setProjects] = useState(MOCK_PROJECTS ?? []);

  useEffect(() => {
    api.get('/projects')
      .then(async (r) => { setProjects(r.data); await cacheSet('cache:projects', r.data); })
      .catch(async () => setProjects((await cacheGet('cache:projects')) || MOCK_PROJECTS));
  }, []);

  const open = async (p) => {
    await AsyncStorage.setItem('sv_project', p.ProjectId);
    navigation.navigate('Capture', { projectId: p.ProjectId, projectName: p.Name });
  };

  return (
    <>
      <SyncStatusBar />
      <View style={styles.c}>
      
        <Text style={styles.h}>Select Project</Text>
        <FlatList
          data={projects}
          keyExtractor={(p) => p.ProjectId}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => open(item)}>
              <Text style={styles.name}>{item.Name}</Text>
              <Text style={styles.meta}>{item.Folder} · {item.City} · {item.FloorCount} floors</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.meta}>No projects.</Text>}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#0e0f12', padding: 16 },
  h: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  card: { backgroundColor: '#16181d', borderRadius: 10, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#2a2e37' },
  name: { color: '#fff', fontSize: 16, fontWeight: '700' },
  meta: { color: '#9aa0aa', marginTop: 4 },
});