import React, { useContext } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Components & Contexts
import { AuthProvider, AuthContext } from './src/contexts/AuthContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ReceiveStockScreen from './src/screens/ReceiveStockScreen';
import PickStockScreen from './src/screens/PickStockScreen';
import CycleCountScreen from './src/screens/CycleCountScreen';
import ManageProductsScreen from './src/screens/ManageProductsScreen';
import ManageLocationsScreen from './src/screens/ManageLocationsScreen';
import StockLedgerScreen from './src/screens/StockLedgerScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();


// Tabs navigation configuration for authenticated workers
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#002FA7', // Klein Blue
        tabBarInactiveTintColor: '#888888',
        tabBarStyle: {
          borderTopWidth: 2,
          borderTopColor: '#0A0A0A',
          backgroundColor: '#FFFFFF',
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'JetBrains Mono',
          fontSize: 10,
          fontWeight: 'bold',
        },
        headerStyle: {
          backgroundColor: '#0A0A0A',
          borderBottomWidth: 1,
          borderBottomColor: '#0A0A0A',
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          fontFamily: 'Cabinet Grotesk',
          fontSize: 16,
          fontWeight: '900',
          color: '#FFFFFF',
          letterSpacing: 0.5,
        },
        headerTintColor: '#FFFFFF',
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={HomeScreen} 
        options={{
          tabBarLabel: 'HOME',
          headerTitle: 'OPERATOR TERMINAL',
          tabBarIcon: ({ color, size }) => (
            <View style={[styles.dotIcon, { backgroundColor: color }]} />
          ),
        }}
      />
      <Tab.Screen 
        name="Receive" 
        component={ReceiveStockScreen} 
        options={{
          tabBarLabel: 'RECEIVE',
          headerTitle: 'INCOMING RECEIPT',
          tabBarIcon: ({ color, size }) => (
            <View style={[styles.dotIcon, { backgroundColor: color }]} />
          ),
        }}
      />
      <Tab.Screen 
        name="Pick" 
        component={PickStockScreen} 
        options={{
          tabBarLabel: 'PICK',
          headerTitle: 'OUTBOUND PICKING',
          tabBarIcon: ({ color, size }) => (
            <View style={[styles.dotIcon, { backgroundColor: color }]} />
          ),
        }}
      />
      <Tab.Screen 
        name="Count" 
        component={CycleCountScreen} 
        options={{
          tabBarLabel: 'AUDIT',
          headerTitle: 'CYCLE COUNTING',
          tabBarIcon: ({ color, size }) => (
            <View style={[styles.dotIcon, { backgroundColor: color }]} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Router Controller using Auth Context
function AppNavigation() {
  const { isAuthenticated, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#002FA7" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen 
              name="ManageProducts" 
              component={ManageProductsScreen} 
              options={{ 
                headerShown: true, 
                title: 'PRODUCT MANAGEMENT',
                headerStyle: { backgroundColor: '#0A0A0A' },
                headerTitleStyle: { fontFamily: 'Cabinet Grotesk', fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
                headerTintColor: '#FFFFFF'
              }} 
            />
            <Stack.Screen 
              name="ManageLocations" 
              component={ManageLocationsScreen} 
              options={{ 
                headerShown: true, 
                title: 'LOCATION MANAGEMENT',
                headerStyle: { backgroundColor: '#0A0A0A' },
                headerTitleStyle: { fontFamily: 'Cabinet Grotesk', fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
                headerTintColor: '#FFFFFF'
              }} 
            />
            <Stack.Screen 
              name="StockLedger" 
              component={StockLedgerScreen} 
              options={{ 
                headerShown: true, 
                title: 'STOCK LEDGER HISTORY',
                headerStyle: { backgroundColor: '#0A0A0A' },
                headerTitleStyle: { fontFamily: 'Cabinet Grotesk', fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
                headerTintColor: '#FFFFFF'
              }} 
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <View style={styles.appContainer}>
        <StatusBar style="auto" />
        <AppNavigation />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  dotIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
