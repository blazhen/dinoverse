import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import type { Character } from '@dinoverse/types';

const cast: Character[] = [
  { id: 'trik', name: 'Trik', archetype: 'The spark', personality: 'Fast, curious, mischievous' },
  { id: 'stego', name: 'Stego', archetype: 'The steady one', personality: 'Calm, logical' },
  { id: 'brachiosaurus', name: 'Brachiosaurus', archetype: 'The sage', personality: 'Gentle giant' },
];

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🦕 DinoVerse</Text>
      <Text style={styles.subtitle}>Learn, watch, and play together.</Text>
      {cast.map((c) => (
        <Text key={c.id} style={styles.card}>
          {c.name} — {c.archetype}
        </Text>
      ))}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  title: { fontSize: 36, fontWeight: '900' },
  subtitle: { fontSize: 16, color: '#475569', marginBottom: 16 },
  card: { fontSize: 16, fontWeight: '600', marginVertical: 4 },
});
