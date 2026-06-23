import React, { useContext, useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView 
} from 'react-native';
import { AuthContext } from '../contexts/AuthContext';
import OfflineIndicator from '../components/OfflineIndicator';
import { getUnsyncedTransactions } from '../utils/database';
import { runFullSync } from '../utils/syncQueue';

export default function HomeScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('');

  // Fetch pending count from database
  const refreshUnsyncedCount = async () => {
    try {
      const pending = await getUnsyncedTransactions();
      setUnsyncedCount(pending.length);
    } catch (e) {
      console.log('Error refreshing pending queue tallies', e);
    }
  };

  useEffect(() => {
    refreshUnsyncedCount();
    
    // Periodically update the unsynced count display
    const focusListener = navigation.addListener('focus', refreshUnsyncedCount);
    const interval = setInterval(refreshUnsyncedCount, 5000);
    
    return () => {
      focusListener();
      clearInterval(interval);
    };
  }, [navigation]);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatusText('SYNCHRONIZING PENDING DATA...');
    
    const result = await runFullSync();
    
    if (result.success) {
      setSyncStatusText(`SUCCESS: SYNCED ${result.syncedCount} RECORDS.`);
      await refreshUnsyncedCount();
    } else {
      setSyncStatusText(`SYNC ERROR: ${result.error || 'SERVER UNREACHABLE'}`);
    }

    setTimeout(() => {
      setSyncStatusText('');
      setIsSyncing(false);
    }, 4000);
  };

  return (
    <View style={styles.container}>
      {/* Network Alert Banner */}
      <OfflineIndicator />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Worker Account Banner */}
        <View style={styles.workerProfileWrapper}>
          <Text style={styles.roleLabelText}>OPERATOR SESSION ACTIVE</Text>
          <Text style={styles.nameValueText}>{user?.name?.toUpperCase() || 'FLOOR WORKER'}</Text>
          <Text style={styles.emailValueText}>{user?.email?.toLowerCase()}</Text>
        </View>

        {/* Sync Status / Offline Ledger Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.statusTitle}>LOCAL OFFLINE QUEUE</Text>
              <Text style={styles.statusSub}>Transactions compiled offline waiting for sync</Text>
            </View>
            <Text style={[styles.statusTally, unsyncedCount > 0 ? styles.tallyWarning : styles.tallyReady]}>
              {unsyncedCount}
            </Text>
          </View>

          {syncStatusText ? (
            <Text style={styles.syncStatusMsgText}>{syncStatusText}</Text>
          ) : null}

          <TouchableOpacity 
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]} 
            onPress={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.syncButtonText}>SYNC LOCAL QUEUE & PULL DATA</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Action Shortcuts Grid */}
        <Text style={styles.sectionHeading}>WAREHOUSE FLOOR OPERATIONS</Text>
        
        <View style={styles.gridContainer}>
          {/* RECEIVE STOCK BUTTON */}
          <TouchableOpacity 
            style={styles.gridCard} 
            onPress={() => navigation.navigate('Receive')}
          >
            <Text style={styles.cardEmoji}>📥</Text>
            <Text style={styles.cardTitle}>RECEIVE STOCK</Text>
            <Text style={styles.cardDesc}>Scan supplier barcodes and record incoming SKUs</Text>
          </TouchableOpacity>

          {/* PICK STOCK BUTTON */}
          <TouchableOpacity 
            style={styles.gridCard} 
            onPress={() => navigation.navigate('Pick')}
          >
            <Text style={styles.cardEmoji}>📤</Text>
            <Text style={styles.cardTitle}>PICK STOCK</Text>
            <Text style={styles.cardDesc}>Pick items and reduce inventory levels for orders</Text>
          </TouchableOpacity>

          {/* CYCLE COUNT BUTTON */}
          <TouchableOpacity 
            style={styles.gridCard} 
            onPress={() => navigation.navigate('Count')}
          >
            <Text style={styles.cardEmoji}>⚖️</Text>
            <Text style={styles.cardTitle}>CYCLE COUNT</Text>
            <Text style={styles.cardDesc}>Reconcile bin balances and run physical audits</Text>
          </TouchableOpacity>
        </View>

        {/* Admin only Management tools */}
        {user?.role === 'admin' && (
          <>
            <Text style={styles.sectionHeading}>ADMINISTRATIVE MANAGEMENT</Text>
            
            <View style={styles.gridContainer}>
              {/* MANAGE PRODUCTS */}
              <TouchableOpacity 
                style={styles.gridCard} 
                onPress={() => navigation.navigate('ManageProducts')}
              >
                <Text style={styles.cardEmoji}>📦</Text>
                <Text style={styles.cardTitle}>MANAGE PRODUCTS</Text>
                <Text style={styles.cardDesc}>Add, edit, or delete items from the SKU catalog</Text>
              </TouchableOpacity>

              {/* MANAGE LOCATIONS */}
              <TouchableOpacity 
                style={styles.gridCard} 
                onPress={() => navigation.navigate('ManageLocations')}
              >
                <Text style={styles.cardEmoji}>📍</Text>
                <Text style={styles.cardTitle}>MANAGE LOCATIONS</Text>
                <Text style={styles.cardDesc}>Add, edit, or delete warehouse storage bins</Text>
              </TouchableOpacity>

              {/* STOCK LEDGER */}
              <TouchableOpacity 
                style={styles.gridCard} 
                onPress={() => navigation.navigate('StockLedger')}
              >
                <Text style={styles.cardEmoji}>📜</Text>
                <Text style={styles.cardTitle}>STOCK LEDGER HISTORY</Text>
                <Text style={styles.cardDesc}>Inspect chronological transaction timelines</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutButtonText}>LOGOUT FROM TERMINAL</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    padding: 20,
    gap: 24,
  },
  workerProfileWrapper: {
    backgroundColor: '#0A0A0A',
    padding: 20,
    borderWidth: 1,
    borderColor: '#0A0A0A',
  },
  roleLabelText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 9,
    fontWeight: 'bold',
    color: '#002FA7', // Blue
    letterSpacing: 1,
  },
  nameValueText: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  emailValueText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  statusCard: {
    borderWidth: 1,
    borderColor: '#0A0A0A',
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusTitle: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  statusSub: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 11,
    color: '#555',
    marginTop: 2,
  },
  statusTally: {
    fontFamily: 'JetBrains Mono',
    fontSize: 24,
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 44,
    textAlign: 'center',
  },
  tallyWarning: {
    backgroundColor: '#FFF2F2',
    color: '#FF3B30',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  tallyReady: {
    backgroundColor: '#F4F4F6',
    color: '#555',
    borderWidth: 1,
    borderColor: '#D0D0D2',
  },
  syncStatusMsgText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#002FA7',
    textAlign: 'center',
    backgroundColor: '#F2F5FF',
    paddingVertical: 6,
  },
  syncButton: {
    height: 56, // Glove friendly
    backgroundColor: '#002FA7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#002FA7',
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  sectionHeading: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 16,
    fontWeight: '900',
    color: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#0A0A0A',
    paddingBottom: 6,
    letterSpacing: -0.2,
  },
  gridContainer: {
    flexDirection: 'column',
    gap: 16,
  },
  gridCard: {
    borderWidth: 1,
    borderColor: '#D0D0D2',
    padding: 16,
    flexDirection: 'column',
    backgroundColor: '#F4F4F6',
    borderRadius: 0,
  },
  cardEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  cardTitle: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 15,
    fontWeight: '900',
    color: '#0A0A0A',
  },
  cardDesc: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 11,
    color: '#555',
    marginTop: 2,
  },
  logoutButton: {
    height: 56,
    borderWidth: 1,
    borderColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  logoutButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
