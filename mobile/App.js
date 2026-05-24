// Placeholder App.js for React Native Mobile App
// This demonstrates the structure for the Expo mobile app

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Placeholder screens
const LoginScreen = () => null;
const HomeScreen = () => null;
const ReceiveStockScreen = () => null;
const PickStockScreen = () => null;
const CycleCountScreen = () => null;

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Receive" component={ReceiveStockScreen} />
      <Tab.Screen name="Pick" component={PickStockScreen} />
      <Tab.Screen name="Count" component={CycleCountScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <Stack.Screen 
            name="Main" 
            component={MainTabs} 
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
