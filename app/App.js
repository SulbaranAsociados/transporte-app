import React from 'react';
import { StyleSheet, View, SafeAreaView } from 'react-native';
import CarruselMultimedia from './src/components/CarruselMultimedia';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <CarruselMultimedia />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
