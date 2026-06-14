import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform,
  Alert 
} from 'react-native';
import BarcodeScanner from '../components/BarcodeScanner';
import { 
  getCachedProductBySKU, 
  getCachedLocations, 
  addPendingTransaction 
} from '../utils/database';

export default function CycleCountScreen({ navigation }) {
  const [scannedSKU, setScannedSKU] = useState('');
  const [product, setProduct] = useState(null);
  
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [actualCount, setActualCount] = useState('');
  const [notes, setNotes] = useState('');

  // Load locations from SQLite on startup
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const cached = await getCachedLocations();
        setLocations(cached);
        if (cached.length > 0) {
          setSelectedLocationId(cached[0].id);
        }
      } catch (e) {
        console.error('Failed to load locations from SQLite', e);
      }
    };
    loadLocations();
  }, []);

  const handleBarcodeScanned = async (sku) => {
    try {
      setScannedSKU(sku);
      const matched = await getCachedProductBySKU(sku);
      if (matched) {
        setProduct(matched);
      } else {
        setProduct(null);
        Alert.alert(
          'SKU NOT FOUND',
          `The SKU "${sku}" was not found in the local database cache. Run a sync on the dashboard to pull fresh data.`,
          [{ text: 'OK' }]
        );
      }
    } catch (e) {
      console.error('Error looking up scanned SKU in cache', e);
    }
  };

  const handleConfirmAudit = async () => {
    if (!product) {
      Alert.alert('ERROR', 'PLEASE SCAN OR ENTER A VALID PRODUCT SKU FIRST');
      return;
    }
    if (!selectedLocationId) {
      Alert.alert('ERROR', 'PLEASE SPECIFY THE AUDIT BIN LOCATION');
      return;
    }
    
    const parsedCount = parseInt(actualCount, 10);
    if (isNaN(parsedCount) || parsedCount < 0) {
      Alert.alert('ERROR', 'ACTUAL COUNT VALUE MUST BE A NON-NEGATIVE INTEGER');
      return;
    }

    // Dynamic audit calculation: Adjustment = counted_amount - current_in_memory_stock
    const currentStock = product.current_stock;
    const adjustment = parsedCount - currentStock;

    if (adjustment === 0) {
      Alert.alert(
        'AUDIT MATCH',
        `Physical count matches system representation (${parsedCount} units). No adjustment transaction required.`,
        [
          { 
            text: 'OK', 
            onPress: () => {
              setScannedSKU('');
              setProduct(null);
              setActualCount('');
              setNotes('');
            } 
          }
        ]
      );
      return;
    }

    try {
      const transaction = {
        product_id: product.id,
        location_id: selectedLocationId,
        transaction_type: 'AUDIT',
        quantity_change: adjustment,
        reference_number: `AUDIT-${new Date().toISOString().slice(0,10)}`,
        notes: notes || `Cycle count audit. System was ${currentStock}, counted ${parsedCount}.`,
      };

      await addPendingTransaction(transaction);
      
      const absAdj = Math.abs(adjustment);
      const direction = adjustment > 0 ? 'surplus (+)' : 'deficit (-)';
      
      Alert.alert(
        'AUDIT ADJUSTMENT REGISTERED',
        `Logged AUDIT transaction of ${adjustment > 0 ? '+' : ''}${adjustment} ${product.unit} to resolve physical ${direction}. Added to offline sync queue.`,
        [
          { 
            text: 'OK', 
            onPress: () => {
              // Reset state for next cycle count
              setScannedSKU('');
              setProduct(null);
              setActualCount('');
              setNotes('');
            } 
          }
        ]
      );
    } catch (e) {
      console.error('Failed to queue offline audit transaction', e);
      Alert.alert('ERROR', 'Failed to store transaction locally.');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Camera Scanner Integrated View */}
        <BarcodeScanner onScan={handleBarcodeScanned} placeholderText="Or type SKU manually..." />

        {/* Scan Details & Audit Form */}
        <View style={styles.formContainer}>
          <Text style={styles.sectionHeading}>CYCLE COUNT AUDIT DETAILS</Text>

          {/* Product Scanned State */}
          <View style={styles.productBadge}>
            <Text style={styles.badgeLabel}>AUDITING PRODUCT</Text>
            {product ? (
              <View style={styles.productMeta}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productSku}>SKU: {product.sku} | Unit: {product.unit}</Text>
                <Text style={styles.productStock}>System Stock Level: {product.current_stock} units</Text>
              </View>
            ) : (
              <Text style={styles.noScanText}>NO PRODUCT ACTIVE. SCAN BARCODE OR TYPE INPUT ABOVE.</Text>
            )}
          </View>

          {/* Location Selection Dropdown */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>BIN LOCATION AUDITED</Text>
            <View style={styles.selectWrapper}>
              {locations.length > 0 ? (
                <View style={styles.pickerWrapper}>
                  {locations.map((loc) => (
                    <TouchableOpacity
                      key={loc.id}
                      style={[
                        styles.pickerItem,
                        selectedLocationId === loc.id && styles.pickerItemActive
                      ]}
                      onPress={() => setSelectedLocationId(loc.id)}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        selectedLocationId === loc.id && styles.pickerItemTextActive
                      ]}>
                        {loc.warehouse_id}-{loc.zone}-{loc.aisle}-{loc.bin}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.noLocationsText}>No locations cached. Please sync offline databases.</Text>
              )}
            </View>
          </View>

          {/* Quantity Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ACTUAL PHYSICAL COUNT ON HAND</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={actualCount}
              onChangeText={setActualCount}
              placeholder="Enter exact count on shelf..."
              placeholderTextColor="#888"
            />
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>AUDIT OBSERVATIONS / NOTES</Text>
            <TextInput
              style={styles.textInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Shelf box was damaged, recount verified"
              placeholderTextColor="#888"
            />
          </View>

          {/* Action Trigger */}
          <TouchableOpacity style={styles.submitButton} onPress={handleConfirmAudit}>
            <Text style={styles.submitButtonText}>CONFIRM PHYSICAL AUDIT (COMMIT)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    paddingBottom: 40,
  },
  formContainer: {
    padding: 20,
    gap: 16,
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
  productBadge: {
    borderWidth: 1,
    borderColor: '#0A0A0A',
    padding: 16,
    backgroundColor: '#F4F4F6',
  },
  badgeLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 9,
    fontWeight: 'bold',
    color: '#002FA7',
    marginBottom: 8,
  },
  productMeta: {
    gap: 4,
  },
  productName: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 16,
    fontWeight: '900',
    color: '#0A0A0A',
  },
  productSku: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#555',
  },
  productStock: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#002FA7',
    fontWeight: 'bold',
    marginTop: 4,
  },
  noScanText: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 10,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#0A0A0A',
    fontWeight: 'bold',
  },
  textInput: {
    height: 56,
    borderWidth: 1,
    borderColor: '#0A0A0A',
    paddingHorizontal: 16,
    fontFamily: 'IBM Plex Sans',
    fontSize: 14,
    color: '#0A0A0A',
    backgroundColor: '#FFFFFF',
  },
  selectWrapper: {
    borderWidth: 1,
    borderColor: '#0A0A0A',
    maxHeight: 120,
    overflow: 'scroll',
  },
  pickerWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    gap: 6,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D0D0D2',
    backgroundColor: '#FFFFFF',
  },
  pickerItemActive: {
    backgroundColor: '#002FA7',
    borderColor: '#002FA7',
  },
  pickerItemText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#0A0A0A',
  },
  pickerItemTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  noLocationsText: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 12,
    color: '#FF3B30',
    padding: 12,
  },
  submitButton: {
    height: 64,
    backgroundColor: '#0A0A0A', // Dark slate count lock button
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#0A0A0A',
  },
  submitButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
