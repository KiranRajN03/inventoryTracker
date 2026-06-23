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
  addPendingTransaction,
  updateCachedProductPrice
} from '../utils/database';
import api from '../utils/api';

export default function PickStockScreen({ navigation }) {
  const [scannedSKU, setScannedSKU] = useState('');
  const [product, setProduct] = useState(null);
  
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('0.00');
  const [reference, setReference] = useState('');
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
        setPrice(matched.price?.toString() || '0.00');
      } else {
        setProduct(null);
        setPrice('0.00');
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

  const handleConfirmPick = async () => {
    if (!product) {
      Alert.alert('ERROR', 'PLEASE SCAN OR ENTER A VALID PRODUCT SKU FIRST');
      return;
    }
    if (!selectedLocationId) {
      Alert.alert('ERROR', 'PLEASE ASSIGN A SOURCE BIN LOCATION');
      return;
    }
    
    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      Alert.alert('ERROR', 'QUANTITY TO PICK MUST BE A POSITIVE INTEGER');
      return;
    }

    // Safety check for picking more than currently cached stock
    if (parsedQty > product.current_stock) {
      Alert.alert(
        'LOW STOCK WARNING',
        `You are picking ${parsedQty} units but only ${product.current_stock} are currently recorded in stock. Do you wish to continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, Force Pick', onPress: () => executePick(parsedQty) }
        ]
      );
    } else {
      await executePick(parsedQty);
    }
  };

  const executePick = async (parsedQty) => {
    const newPriceVal = parseFloat(price) || 0.0;
    try {
      // 1. Update product price in master catalog (online)
      try {
        await api.put(`/products/${product.id}`, {
          sku: product.sku,
          name: product.name,
          description: product.description || '',
          low_stock_threshold: product.low_stock_threshold,
          unit: product.unit,
          price: newPriceVal
        });
      } catch (err) {
        console.log("Failed to update product price online, cache will sync later", err);
      }

      // 2. Update local SQLite cache
      await updateCachedProductPrice(product.id, newPriceVal);

      // 3. Pick stock transaction uses NEGATIVE quantity delta
      const transaction = {
        product_id: product.id,
        location_id: selectedLocationId,
        transaction_type: 'PICK',
        quantity_change: -parsedQty,
        reference_number: reference,
        notes: notes,
      };

      await addPendingTransaction(transaction);
      
      Alert.alert(
        'STOCK LOGGED (PICKED)',
        `Logged pick of ${parsedQty} ${product.unit} for ${product.name}. Added to offline sync queue.`,
        [
          { 
            text: 'OK', 
            onPress: () => {
              // Reset state for next pick
              setScannedSKU('');
              setProduct(null);
              setQuantity('1');
              setPrice('0.00');
              setReference('');
              setNotes('');
            } 
          }
        ]
      );
    } catch (e) {
      console.error('Failed to queue offline pick transaction', e);
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

        {/* Scan Details & Pick Input Form */}
        <View style={styles.formContainer}>
          <Text style={styles.sectionHeading}>PICK DETAILS</Text>

          {/* Product Scanned State */}
          <View style={styles.productBadge}>
            <Text style={styles.badgeLabel}>SCANNED PRODUCT</Text>
            {product ? (
              <View style={styles.productMeta}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productSku}>SKU: {product.sku} | Unit: {product.unit}</Text>
                <Text style={styles.productStock}>Current Stock Representation: {product.current_stock} units</Text>
                <Text style={styles.productPriceText}>Current Unit Price: ${(product.price ?? 0).toFixed(2)} | Current Total Value: ${((product.current_stock ?? 0) * (product.price ?? 0)).toFixed(2)}</Text>
              </View>
            ) : (
              <Text style={styles.noScanText}>NO PRODUCT ACTIVE. SCAN BARCODE OR TYPE INPUT ABOVE.</Text>
            )}
          </View>

          {/* Price Management Section */}
          {product && (
            <View style={styles.priceContainer}>
              <Text style={styles.inputLabel}>UNIT PRICE ($)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor="#888"
              />
              <View style={styles.liveCalculationBox}>
                <Text style={styles.calcText}>
                  Live Value of Stock: ${( (product.current_stock ?? 0) * (parseFloat(price) || 0) ).toFixed(2)}
                </Text>
                <Text style={styles.calcText}>
                  Live Value of Transaction: ${( (parseInt(quantity, 10) || 0) * (parseFloat(price) || 0) ).toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          {/* Location Selection Dropdown */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>SOURCE BIN LOCATION</Text>
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
            <Text style={styles.inputLabel}>QUANTITY TO PICK (-)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="e.g. 5"
              placeholderTextColor="#888"
            />
          </View>

          {/* Reference # */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>REFERENCE (e.g. CUSTOMER ORDER# / SHIPMENT#)</Text>
            <TextInput
              style={styles.textInput}
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. ORD-98231"
              placeholderTextColor="#888"
              autoCapitalize="characters"
            />
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PICK NOTES</Text>
            <TextInput
              style={styles.textInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Aisle 3 shelf container"
              placeholderTextColor="#888"
            />
          </View>

          {/* Action Trigger */}
          <TouchableOpacity style={[styles.submitButton, styles.pickButton]} onPress={handleConfirmPick}>
            <Text style={styles.submitButtonText}>CONFIRM PICK (COMMIT)</Text>
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
    color: '#FF3B30', // Alert Red for picking
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
    backgroundColor: '#FF3B30', // Red for selected source
    borderColor: '#FF3B30',
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
    backgroundColor: '#FF3B30', // Solid alert red for pick action
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  submitButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  productPriceText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#0A0A0A',
    fontWeight: 'bold',
    marginTop: 4,
  },
  priceContainer: {
    gap: 6,
  },
  liveCalculationBox: {
    borderWidth: 1,
    borderColor: '#0A0A0A',
    padding: 12,
    backgroundColor: '#FFFFFF',
    gap: 4,
    marginTop: 4,
  },
  calcText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#0A0A0A',
  },
});
