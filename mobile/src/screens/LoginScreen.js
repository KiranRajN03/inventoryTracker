import React, { useState, useContext } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import { AuthContext } from '../contexts/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('EMAIL AND PASSWORD FIELDS ARE REQUIRED');
      return;
    }

    setIsSubmitting(true);
    const result = await login(email, password);
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMsg(result.error.toUpperCase());
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.innerContainer}>
          {/* Header Branding */}
          <View style={styles.headerWrapper}>
            <Text style={styles.titleText}>INVENTORY CONTROL</Text>
            <Text style={styles.subtitleText}>WAREHOUSE FLOOR ACCESS</Text>
          </View>

          {/* Form */}
          <View style={styles.formWrapper}>
            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
              </View>
            ) : null}

            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="e.g. worker@inventory.com"
                placeholderTextColor="#666"
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="••••••••••••"
                placeholderTextColor="#666"
              />
            </View>
 
            {/* Forgot Password Link */}
            <TouchableOpacity 
              style={styles.forgotPasswordButton}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotPasswordText}>FORGOT PASSWORD?</Text>
            </TouchableOpacity>

            {/* Sign In Trigger button */}
            <TouchableOpacity 
              style={styles.submitButton} 
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>SIGN IN TO SYSTEM</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Swiss aesthetic footer */}
          <View style={styles.footerWrapper}>
            <Text style={styles.footerText}>SWISS CONTROL SYSTEMS v1.0.0</Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  innerContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  headerWrapper: {
    marginTop: 64,
  },
  titleText: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 28,
    fontWeight: '900',
    color: '#0A0A0A',
    letterSpacing: -1,
    textAlign: 'left',
  },
  subtitleText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    color: '#002FA7',
    fontWeight: 'bold',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  formWrapper: {
    flex: 1,
    justifyContent: 'center',
    marginVertical: 40,
    gap: 20,
  },
  errorBanner: {
    backgroundColor: '#FFF2F2',
    borderWidth: 1,
    borderColor: '#FF3B30',
    padding: 12,
    marginBottom: 8,
  },
  errorText: {
    fontFamily: 'JetBrains Mono',
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: 'bold',
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
    fontSize: 15,
    color: '#0A0A0A',
    backgroundColor: '#F4F4F6',
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 4,
  },
  forgotPasswordText: {
    fontFamily: 'JetBrains Mono',
    color: '#002FA7',
    fontSize: 11,
    fontWeight: 'bold',
  },
  submitButton: {
    height: 64, // Glove friendly
    backgroundColor: '#002FA7', // Klein Blue
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#002FA7',
  },
  submitButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  footerWrapper: {
    alignItems: 'center',
    marginBottom: 10,
  },
  footerText: {
    fontFamily: 'JetBrains Mono',
    color: '#888',
    fontSize: 10,
  },
});
