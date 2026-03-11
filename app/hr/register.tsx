import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';

type Step = 1 | 2 | 3;

export default function HrRegisterScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [staffCategory, setStaffCategory] = useState<'Associate' | 'Full-Staff'>('Associate');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goBackToLogin = () => {
    router.replace('/hr');
  };

  const handleEmailContinue = () => {
    if (!email.trim()) {
      setError('Please enter your staff email address.');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleOtpContinue = () => {
    if (otp.trim().length < 4) {
      setError('Please enter the code sent to your email.');
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleCreateAccount = () => {
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setSubmitting(true);

    // FRONTEND ONLY: simulate a short success and send user back to login.
    setTimeout(() => {
      setSubmitting(false);
      router.replace('/hr');
    }, 900);
  };

  const renderStepContent = () => {
    if (step === 1) {
      return (
        <View style={styles.stepBody}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Staff Email Address</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputIconBox}>
                <MaterialCommunityIcons name="email-outline" size={20} color="#6b7280" />
              </View>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="you@nrep.ug"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>
            <Text style={styles.helperText}>
              Use your official NREP email to register for the HR portal.
            </Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={handleEmailContinue}>
            <Text style={styles.primaryButtonText}>Send verification code</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.stepBody}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Verification Code</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputIconBox}>
                <MaterialCommunityIcons name="shield-check-outline" size={20} color="#6b7280" />
              </View>
              <TextInput
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="Enter code"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>
            <Text style={styles.helperText}>
              Enter the 4–6 digit code sent to <Text style={styles.helperHighlight}>{email}</Text>.
            </Text>
          </View>

          <View style={styles.inlineRow}>
            <Text style={styles.helperText}>Didn&apos;t receive the code?</Text>
            <Pressable
              onPress={() => {
                // FRONTEND ONLY: we will wire actual resend later.
              }}
            >
              <Text style={styles.linkText}>Resend code</Text>
            </Pressable>
          </View>

          <Pressable style={styles.primaryButton} onPress={handleOtpContinue}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      );
    }

    // step 3
    return (
      <View style={styles.stepBody}>
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputIconBox}>
              <MaterialCommunityIcons name="account-outline" size={20} color="#6b7280" />
            </View>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Derrick Mayiku"
              placeholderTextColor="#9ca3af"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputIconBox}>
              <MaterialCommunityIcons name="phone-outline" size={20} color="#6b7280" />
            </View>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+256 7XX XXX XXX"
              placeholderTextColor="#9ca3af"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Staff Category</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[
                styles.chip,
                staffCategory === 'Associate' && styles.chipActive,
              ]}
              onPress={() => setStaffCategory('Associate')}
            >
              <Text
                style={[
                  styles.chipText,
                  staffCategory === 'Associate' && styles.chipTextActive,
                ]}
              >
                Associate
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.chip,
                staffCategory === 'Full-Staff' && styles.chipActive,
              ]}
              onPress={() => setStaffCategory('Full-Staff')}
            >
              <Text
                style={[
                  styles.chipText,
                  staffCategory === 'Full-Staff' && styles.chipTextActive,
                ]}
              >
                Full Staff
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputIconBox}>
              <MaterialCommunityIcons name="lock-outline" size={20} color="#6b7280" />
            </View>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Create a strong password"
              placeholderTextColor="#9ca3af"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputIconBox}>
              <MaterialCommunityIcons name="lock-check-outline" size={20} color="#6b7280" />
            </View>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="Re-enter password"
              placeholderTextColor="#9ca3af"
              style={styles.input}
            />
          </View>
        </View>

        <Pressable
          disabled={submitting}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !submitting && styles.primaryButtonPressed,
          ]}
          onPress={handleCreateAccount}
        >
          <Text style={styles.primaryButtonText}>
            {submitting ? 'Creating account…' : 'Create account'}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.topBar}>
            <Pressable style={styles.backButton} onPress={goBackToLogin}>
              <MaterialCommunityIcons name="chevron-left" size={22} color="#054653" />
              <Text style={styles.backText}>Back to login</Text>
            </Pressable>
          </View>

          <View style={styles.logoWrapper}>
            <Image
              source={require('@/assets/images/nrep-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <ThemedText type="subtitle" style={styles.logoTagline}>
              Create your NREP HR account
            </ThemedText>
          </View>

          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>A simple 3-step registration</Text>
            </View>

            <View style={styles.stepperRow}>
              <View style={[styles.stepPill, step >= 1 && styles.stepPillActive]}>
                <Text style={[styles.stepPillText, step >= 1 && styles.stepPillTextActive]}>
                  1. Email
                </Text>
              </View>
              <View style={[styles.stepPill, step >= 2 && styles.stepPillActive]}>
                <Text style={[styles.stepPillText, step >= 2 && styles.stepPillTextActive]}>
                  2. Code
                </Text>
              </View>
              <View style={[styles.stepPill, step >= 3 && styles.stepPillActive]}>
                <Text style={[styles.stepPillText, step >= 3 && styles.stepPillTextActive]}>
                  3. Details
                </Text>
              </View>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {renderStepContent()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    alignSelf: 'stretch',
    marginBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontSize: 13,
    color: '#054653',
    fontWeight: '500',
  },
  logoWrapper: {
    marginBottom: 24,
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
  },
  logoTagline: {
    marginTop: 8,
    fontSize: 14,
    color: '#4b5563',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#054653',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  stepPill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  stepPillActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0ea5e9',
  },
  stepPillText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  stepPillTextActive: {
    color: '#0f172a',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  stepBody: {
    marginTop: 4,
    gap: 16,
  },
  fieldBlock: {
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
  },
  inputIconBox: {
    paddingRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  helperText: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },
  helperHighlight: {
    color: '#054653',
    fontWeight: '600',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: {
    fontSize: 12,
    color: '#0ea5e9',
    fontWeight: '500',
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#054653',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0ea5e9',
  },
  chipText: {
    fontSize: 12,
    color: '#4b5563',
  },
  chipTextActive: {
    color: '#0f172a',
    fontWeight: '600',
  },
});

