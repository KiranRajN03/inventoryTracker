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
import { getCachedProducts, cacheProducts } from '../utils/database';
import { pullFreshMasterData } from '../utils/syncQueue';

export default function ManageProductsScreen() {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Form / Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [threshold, setThreshold] = useState('10');
  const [unit, setUnit] = useState('units');
  const [price, setPrice] = useState('0.00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/products');
      if (res.status === 200) {
        setProducts(res.data);
        // Cache locally
        await cacheProducts(res.data);
      }
    } catch (e) {
      console.log('Failed to fetch products online, loading offline cache', e);
      const cached = await getCachedProducts();
      setProducts(cached);
      Alert.alert('OFFLINE MODE', 'Showing cached product data. Product creation or edits are disabled.');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setSku('');
    setName('');
    setDescription('');
    setThreshold('10');
    setUnit('units');
    setPrice('0.00');
    setModalVisible(true);
  };

  const openEditModal = (p) => {
    setEditingProduct(p);
    setSku(p.sku);
    setName(p.name);
    setDescription(p.description || '');
    setThreshold(p.low_stock_threshold?.toString() || '10');
    setUnit(p.unit || 'units');
    setPrice(p.price?.toString() || '0.00');
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!sku.trim() || !name.trim() || !unit.trim()) {
      Alert.alert('ERROR', 'SKU, NAME, AND UNIT ARE REQUIRED FIELDS');
      return;
    }

    const parsedThreshold = parseInt(threshold, 10);
    if (isNaN(parsedThreshold) || parsedThreshold < 0) {
      Alert.alert('ERROR', 'LOW STOCK THRESHOLD MUST BE A NON-NEGATIVE INTEGER');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        sku: sku.trim(),
        name: name.trim(),
        description: description.trim() || null,
        low_stock_threshold: parsedThreshold,
        unit: unit.trim(),
        price: parseFloat(price) || 0.0
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        Alert.alert('SUCCESS', 'PRODUCT UPDATED SUCCESSFULLY');
      } else {
        await api.post('/products', payload);
        Alert.alert('SUCCESS', 'PRODUCT CREATED SUCCESSFULLY');
      }

      setModalVisible(false);
      // Re-fetch and sync SQLite cache
      await pullFreshMasterData();
      await fetchProducts();
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail || 'Failed to save product details.';
      Alert.alert('API ERROR', msg.toUpperCase());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (p) => {
    Alert.alert(
      'CONFIRM DELETE',
      `ARE YOU SURE YOU WANT TO DELETE SKU: ${p.sku}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'DELETE',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await api.delete(`/products/${p.id}`);
              Alert.alert('SUCCESS', 'PRODUCT DELETED SUCCESSFULLY');
              await pullFreshMasterData();
              await fetchProducts();
            } catch (e) {
              console.error(e);
              Alert.alert('API ERROR', 'FAILED TO DELETE PRODUCT');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const filteredProducts = products.filter(p =>
    p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Search and Action Bar */}
      <View style={styles.actionBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="SEARCH PRODUCTS BY SKU OR NAME..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Text style={styles.addButtonText}>ADD NEW</Text>
        </TouchableOpacity>
      </View>

      {/* Product List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#002FA7" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {filteredProducts.length === 0 ? (
            <Text style={styles.emptyText}>NO MATCHING PRODUCTS FOUND</Text>
          ) : (
            filteredProducts.map((p) => {
              const isLowStock = p.current_stock < p.low_stock_threshold;
              return (
                <View key={p.id} style={styles.productCard}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.skuText}>{p.sku}</Text>
                    <Text style={styles.nameText}>{p.name}</Text>
                    {p.description ? (
                      <Text style={styles.descText}>{p.description}</Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>PRICE: ${(p.price || 0).toFixed(2)}</Text>
                      <Text style={styles.metaText}>THRESHOLD: {p.low_stock_threshold}</Text>
                      <Text style={styles.metaText}>UNIT: {p.unit}</Text>
                    </View>
                  </View>

                  <View style={styles.cardActions}>
                    <View style={[styles.stockBadge, isLowStock ? styles.stockAlert : styles.stockOk]}>
                      <Text style={[styles.stockLabel, isLowStock ? styles.labelAlert : styles.labelOk]}>
                        STOCK
                      </Text>
                      <Text style={[styles.stockValue, isLowStock ? styles.valueAlert : styles.valueOk]}>
                        {p.current_stock ?? 0}
                      </Text>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(p)}>
                        <Text style={styles.editBtnText}>EDIT</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(p)}>
                        <Text style={styles.deleteBtnText}>DEL</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add/Edit Product Modal */}
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
              {editingProduct ? 'EDIT PRODUCT SKU' : 'CREATE NEW PRODUCT'}
            </Text>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PRODUCT SKU (UNIQUE)</Text>
                <TextInput
                  style={[styles.textInput, editingProduct && styles.disabledInput]}
                  value={sku}
                  onChangeText={setSku}
                  placeholder="e.g. SKU-100-AB"
                  placeholderTextColor="#888"
                  autoCapitalize="characters"
                  editable={!editingProduct}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>PRODUCT NAME</Text>
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Hex Bolt M8"
                  placeholderTextColor="#888"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>DESCRIPTION / DETAILS</Text>
                <TextInput
                  style={styles.textInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Zinc coated hardware"
                  placeholderTextColor="#888"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>LOW STOCK THRESHOLD</Text>
                <TextInput
                  style={styles.textInput}
                  value={threshold}
                  onChangeText={setThreshold}
                  keyboardType="number-pad"
                  placeholder="e.g. 10"
                  placeholderTextColor="#888"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>UNIT OF MEASURE</Text>
                <TextInput
                  style={styles.textInput}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="e.g. units, kg, boxes"
                  placeholderTextColor="#888"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>UNIT PRICE ($)</Text>
                <TextInput
                  style={styles.textInput}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="e.g. 19.99"
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
                  <Text style={styles.saveModalBtnText}>SAVE DETAILS</Text>
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
  productCard: {
    borderWidth: 1,
    borderColor: '#0A0A0A',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  cardInfo: {
    flex: 1,
    gap: 4,
    paddingRight: 8,
  },
  skuText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  nameText: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 16,
    fontWeight: '900',
    color: '#0A0A0A',
  },
  descText: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 11,
    color: '#555',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
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
  stockBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 70,
  },
  stockOk: {
    backgroundColor: '#F4F4F6',
    borderColor: '#D0D0D2',
  },
  stockAlert: {
    backgroundColor: '#FFF2F2',
    borderColor: '#FF3B30',
  },
  stockLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 8,
    fontWeight: 'bold',
  },
  labelOk: {
    color: '#737373',
  },
  labelAlert: {
    color: '#FF3B30',
  },
  stockValue: {
    fontFamily: 'JetBrains Mono',
    fontSize: 16,
    fontWeight: '900',
  },
  valueOk: {
    color: '#0A0A0A',
  },
  valueAlert: {
    color: '#FF3B30',
  },
  actionRow: {
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
  disabledInput: {
    backgroundColor: '#E5E5E5',
    color: '#737373',
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
