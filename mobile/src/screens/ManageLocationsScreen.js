import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import api from '../utils/api';
import { getCachedLocations, cacheLocations } from '../utils/database';
import { pullFreshMasterData } from '../utils/syncQueue';

export default function ManageLocationsScreen() {
  const [locations, setLocations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Form / Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [zone, setZone] = useState('');
  const [aisle, setAisle] = useState('');
  const [bin, setBin] = useState('');
  const [capacity, setCapacity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const res = await api.get('/locations');
      if (res.status === 200) {
        setLocations(res.data);
        // Cache locally
        await cacheLocations(res.data);
      }
    } catch (e) {
      console.log('Failed to fetch locations online, loading offline cache', e);
      const cached = await getCachedLocations();
      setLocations(cached);
      Alert.alert('OFFLINE MODE', 'Showing cached location data. Location creation or edits are disabled.');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingLocation(null);
    setWarehouseId('');
    setZone('');
    setAisle('');
    setBin('');
    setCapacity('');
    setModalVisible(true);
  };

  const openEditModal = (loc) => {
    setEditingLocation(loc);
    setWarehouseId(loc.warehouse_id);
    setZone(loc.zone);
    setAisle(loc.aisle);
    setBin(loc.bin);
    setCapacity(loc.capacity?.toString() || '');
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!warehouseId.trim() || !zone.trim() || !aisle.trim() || !bin.trim()) {
      Alert.alert('ERROR', 'WAREHOUSE ID, ZONE, AISLE, AND BIN ARE REQUIRED');
      return;
    }

    const parsedCapacity = capacity.trim() ? parseInt(capacity, 10) : null;
    if (parsedCapacity !== null && (isNaN(parsedCapacity) || parsedCapacity < 0)) {
      Alert.alert('ERROR', 'CAPACITY MUST BE A POSITIVE INTEGER');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        warehouse_id: warehouseId.trim().toUpperCase(),
        zone: zone.trim().toUpperCase(),
        aisle: aisle.trim().toUpperCase(),
        bin: bin.trim().toUpperCase(),
        capacity: parsedCapacity
      };

      if (editingLocation) {
        await api.put(`/locations/${editingLocation.id}`, payload);
        Alert.alert('SUCCESS', 'LOCATION UPDATED SUCCESSFULLY');
      } else {
        await api.post('/locations', payload);
        Alert.alert('SUCCESS', 'LOCATION CREATED SUCCESSFULLY');
      }

      setModalVisible(false);
      // Re-fetch and sync SQLite cache
      await pullFreshMasterData();
      await fetchLocations();
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail || 'Failed to save location details.';
      Alert.alert('API ERROR', msg.toUpperCase());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (loc) => {
    Alert.alert(
      'CONFIRM DELETE',
      `ARE YOU SURE YOU WANT TO DELETE LOCATION: ${loc.warehouse_id}-${loc.zone}-${loc.aisle}-${loc.bin}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'DELETE',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await api.delete(`/locations/${loc.id}`);
              Alert.alert('SUCCESS', 'LOCATION DELETED SUCCESSFULLY');
              await pullFreshMasterData();
              await fetchLocations();
            } catch (e) {
              console.error(e);
              Alert.alert('API ERROR', 'FAILED TO DELETE LOCATION');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const filteredLocations = locations.filter(loc => {
    const fullPath = `${loc.warehouse_id}-${loc.zone}-${loc.aisle}-${loc.bin}`.toLowerCase();
    return fullPath.includes(searchQuery.toLowerCase());
  });

  return (
    <View style={styles.container}>
      {/* Search and Action Bar */}
      <View style={styles.actionBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="SEARCH PATHS (e.g. WH1-A-1-01)..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Text style={styles.addButtonText}>ADD NEW</Text>
        </TouchableOpacity>
      </View>

      {/* Location List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#002FA7" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {filteredLocations.length === 0 ? (
            <Text style={styles.emptyText}>NO MATCHING LOCATIONS FOUND</Text>
          ) : (
            filteredLocations.map((loc) => (
              <View key={loc.id} style={styles.locationCard}>
                <View style={styles.cardInfo}>
                  <Text style={styles.pathText}>
                    {loc.warehouse_id}-{loc.zone}-{loc.aisle}-{loc.bin}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>WH: {loc.warehouse_id}</Text>
                    <Text style={styles.metaText}>ZONE: {loc.zone}</Text>
                    <Text style={styles.metaText}>AISLE: {loc.aisle}</Text>
                    <Text style={styles.metaText}>BIN: {loc.bin}</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <View style={styles.capacityBadge}>
                    <Text style={styles.capacityLabel}>CAPACITY</Text>
                    <Text style={styles.capacityValue}>{loc.capacity || 'N/A'}</Text>
                  </View>

                  <View style={styles.actionRowInline}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(loc)}>
                      <Text style={styles.editBtnText}>EDIT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(loc)}>
                      <Text style={styles.deleteBtnText}>DEL</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add/Edit Location Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingLocation ? 'EDIT BIN DETAILS' : 'CREATE STORAGE BIN'}
            </Text>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>WAREHOUSE ID</Text>
                <TextInput
                  style={styles.textInput}
                  value={warehouseId}
                  onChangeText={setWarehouseId}
                  placeholder="e.g. WH1"
                  placeholderTextColor="#888"
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>ZONE / AREA</Text>
                <TextInput
                  style={styles.textInput}
                  value={zone}
                  onChangeText={setZone}
                  placeholder="e.g. A"
                  placeholderTextColor="#888"
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>AISLE NUMBER</Text>
                <TextInput
                  style={styles.textInput}
                  value={aisle}
                  onChangeText={setAisle}
                  placeholder="e.g. 1"
                  placeholderTextColor="#888"
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>BIN / SHELF POSITION</Text>
                <TextInput
                  style={styles.textInput}
                  value={bin}
                  onChangeText={setBin}
                  placeholder="e.g. 01"
                  placeholderTextColor="#888"
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>MAX STORAGE CAPACITY (OPTIONAL)</Text>
                <TextInput
                  style={styles.textInput}
                  value={capacity}
                  onChangeText={setCapacity}
                  keyboardType="number-pad"
                  placeholder="e.g. 500"
                  placeholderTextColor="#888"
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelModalBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.saveModalBtnText}>SAVE LOCATION</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0A0A0A',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#0A0A0A',
    paddingHorizontal: 12,
    fontFamily: 'IBM Plex Sans',
    fontSize: 12,
    backgroundColor: '#F4F4F6',
  },
  addButton: {
    width: 90,
    backgroundColor: '#002FA7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#002FA7',
  },
  addButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    padding: 16,
    gap: 12,
  },
  emptyText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 40,
  },
  locationCard: {
    borderWidth: 1,
    borderColor: '#0A0A0A',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  cardInfo: {
    flex: 1,
    gap: 6,
  },
  pathText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 10,
    color: '#737373',
  },
  cardActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: 100,
  },
  capacityBadge: {
    borderWidth: 1,
    borderColor: '#D0D0D2',
    backgroundColor: '#F4F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 70,
  },
  capacityLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 7,
    color: '#737373',
    fontWeight: 'bold',
  },
  capacityValue: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    fontWeight: '900',
    color: '#0A0A0A',
  },
  actionRowInline: {
    flexDirection: 'row',
    gap: 6,
  },
  editBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#0A0A0A',
    backgroundColor: '#FFFFFF',
  },
  editBtnText: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  deleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#FF3B30',
    backgroundColor: '#FFFFFF',
  },
  deleteBtnText: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FF3B30',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0A0A0A',
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 20,
    fontWeight: '900',
    color: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#0A0A0A',
    paddingBottom: 8,
  },
  formScroll: {
    gap: 12,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 10,
    color: '#0A0A0A',
    fontWeight: 'bold',
  },
  textInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#0A0A0A',
    paddingHorizontal: 12,
    fontFamily: 'IBM Plex Sans',
    fontSize: 13,
    backgroundColor: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  cancelModalBtn: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelModalBtnText: {
    fontFamily: 'IBM Plex Sans',
    fontWeight: 'bold',
    fontSize: 12,
    color: '#0A0A0A',
  },
  saveModalBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#002FA7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#002FA7',
  },
  saveModalBtnText: {
    fontFamily: 'IBM Plex Sans',
    fontWeight: 'bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
});
