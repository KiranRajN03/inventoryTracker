import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import api from '../utils/api';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [isPinging, setIsPinging] = useState(false);

  useEffect(() => {
    // Run network check loop
    const checkConnection = async () => {
      if (isPinging) return;
      setIsPinging(true);
      try {
        // Quick HEAD/GET request with tiny timeout to check server connectivity
        await api.get('/auth/me', { timeout: 3000 });
        setIsOnline(true);
      } catch (err) {
        // If error has a response, server is online but user is unauthorized (which is fine!)
        if (err.response) {
          setIsOnline(true);
        } else {
          // Network errors or timeouts mean server is unreachable
          setIsOnline(false);
        }
      } finally {
        setIsPinging(false);
      }
    };

    // Initial check
    checkConnection();

    // Loop check every 8 seconds
    const interval = setInterval(checkConnection, 8000);
    return () => clearInterval(interval);
  }, []);

  if (isOnline) {
    return (
      <View style={[styles.container, styles.online]}>
        <Text style={styles.text}>● CONNECTED (ONLINE)</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.offline]}>
      <Text style={styles.text}>▲ OFFLINE (USING LOCAL SQLITE CACHE)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  online: {
    backgroundColor: '#34C759', // Green
  },
  offline: {
    backgroundColor: '#FFCC00', // Warning Amber
  },
  text: {
    color: '#0A0A0A',
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
