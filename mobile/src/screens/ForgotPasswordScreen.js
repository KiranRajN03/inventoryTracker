import React, { useState } from 'react';
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
import api from '../utils/api';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [step, setStep] = useState(1); // 1: Email, 2: Security Q & Reset Password
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequestQuestion = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!email) {
      setErrorMsg('EMAIL ADDRESS IS REQUIRED');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post('/auth/forgot-password', { email });
      if (response.status === 200) {
        setSecurityQuestion(response.data.security_question);
        setStep(2);
      }
    } catch (error) {
      const msg = error.response?.data?.detail || 'FAILED TO RETRIEVE SECURITY QUESTION. CHECK EMAIL.';
      setErrorMsg(msg.toUpperCase());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!securityAnswer || !newPassword || !confirmPassword) {
      setErrorMsg('ALL FIELDS ARE REQUIRED');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('PASSWORDS DO NOT MATCH');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post('/auth/reset-password', {
        email,
        security_answer: securityAnswer,
        new_password: newPassword
      });

      if (response.status === 200) {
        setSuccessMsg('PASSWORD RESET SUCCESSFULLY');
        setTimeout(() => {
          navigation.navigate('Login');
        }, 1500);
      }
    } catch (error) {
      const msg = error.response?.data?.detail || 'PASSWORD RESET FAILED. CHECK YOUR ANSWER.';
      setErrorMsg(msg.toUpperCase());
    } finally {
      setIsSubmitting(false);
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
            <Text style={styles.titleText}>PASSWORD RECOVERY</Text>
            <Text style={styles.subtitleText}>RESET WAREHOUSE CREDENTIALS</Text>
          </View>

          {/* Form */}
          <View style={styles.formWrapper}>
            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
              </View>
            ) : null}

            {successMsg ? (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>✅ {successMsg}</Text>
              </View>
            ) : null}

            {step === 1 ? (
              <>
                {/* Email Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>ENTER YOUR REGISTERED EMAIL</Text>
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

                {/* Submit button */}
                <TouchableOpacity 
                  style={styles.submitButton} 
                  onPress={handleRequestQuestion}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitButtonText}>RETRIEVE SECURITY QUESTION</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Display Security Question */}
                <View style={styles.questionBanner}>
                  <Text style={styles.questionLabel}>SECURITY QUESTION:</Text>
                  <Text style={styles.questionText}>{securityQuestion}</Text>
                </View>

                {/* Security Answer Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>YOUR SECURITY ANSWER</Text>
                  <TextInput
                    style={styles.textInput}
                    value={securityAnswer}
                    onChangeText={setSecurityAnswer}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Type your answer here"
                    placeholderTextColor="#666"
                  />
                </View>

                {/* New Password Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="••••••••••••"
                    placeholderTextColor="#666"
                  />
                </View>

                {/* Confirm Password Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
                  <TextInput
                    style={styles.textInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="••••••••••••"
                    placeholderTextColor="#666"
                  />
                </View>

                {/* Submit button */}
                <TouchableOpacity 
                  style={styles.submitButton} 
                  onPress={handleResetPassword}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.submitButtonText}>CONFIRM RESET PASSWORD</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Back to Login link */}
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.navigate('Login')}
              disabled={isSubmitting}
            >
              <Text style={styles.backButtonText}>← BACK TO SIGN IN</Text>
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
    gap: 16,
  },
  errorBanner: {
    backgroundColor: '#FFF2F2',
    borderWidth: 1,
    borderColor: '#FF3B30',
    padding: 12,
  },
  errorText: {
    fontFamily: 'JetBrains Mono',
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: 'bold',
  },
  successBanner: {
    backgroundColor: '#F2FFF2',
    borderWidth: 1,
    borderColor: '#34C759',
    padding: 12,
  },
  successText: {
    fontFamily: 'JetBrains Mono',
    color: '#34C759',
    fontSize: 11,
    fontWeight: 'bold',
  },
  questionBanner: {
    backgroundColor: '#F4F4F6',
    borderWidth: 1,
    borderColor: '#0A0A0A',
    padding: 16,
    gap: 4,
  },
  questionLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 10,
    color: '#666',
    fontWeight: 'bold',
  },
  questionText: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 16,
    color: '#0A0A0A',
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
  submitButton: {
    height: 64, 
    backgroundColor: '#002FA7', 
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
  backButton: {
    alignItems: 'center',
    marginTop: 10,
  },
  backButtonText: {
    fontFamily: 'JetBrains Mono',
    color: '#002FA7',
    fontSize: 12,
    fontWeight: 'bold',
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
