import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useHrAuth } from '@/context/HrAuthContext';
import { HrLogoSpinner } from '@/components/HrLogoSpinner';

export default function HrLoginScreen() {
  const router = useRouter();
  const { user, isLoading, isLocked, getRemainingLockoutTime, login } = useHrAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBackHome = () => {
    router.replace('/');
  };

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/hr/home');
    }
  }, [isLoading, user, router]);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('Please enter both email and password.');
      return;
    }

    if (isLocked) {
      const remaining = getRemainingLockoutTime();
      setError(
        `Account is locked due to too many failed attempts. Try again in ${remaining} minutes.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await login(trimmedEmail, trimmedPassword, rememberMe);
      router.replace('/hr/home');
    } catch (err: any) {
      console.error('HR login failed', err);
      setError(err?.message || 'Sign in failed. Please check your credentials and try again.');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.content, { justifyContent: 'center' }]}>
          <HrLogoSpinner size={62} />
        </View>
      </SafeAreaView>
    );
  }

  if (user) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.topBar}>
            <Pressable style={styles.backButton} onPress={handleBackHome}>
              <Text style={styles.backText}>Back to home</Text>
            </Pressable>
          </View>
          <View style={styles.logoWrapper}>
            <Image
              source={require('@/assets/images/nrep-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <ThemedText type="subtitle" style={styles.logoTagline}>
              NREP HR Staff Portal
            </ThemedText>
          </View>

          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Sign In</Text>
              <Text style={styles.subtitle}>Enter your credentials to access your account</Text>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Email Address</Text>
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
                  placeholder="you@example.com"
                  placeholderTextColor="#9ca3af"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
                <Pressable
                  onPress={() => {
                    router.push('/hr/forgot-password');
                  }}
                >
                  <Text style={styles.forgotPassword}>Forgot password?</Text>
                </Pressable>
              </View>
              <View style={styles.inputRow}>
                <View style={styles.inputIconBox}>
                  <MaterialCommunityIcons name="lock-outline" size={20} color="#6b7280" />
                </View>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9ca3af"
                  style={styles.input}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                >
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6b7280"
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.rememberRow}>
              <Pressable
                style={styles.checkbox}
                onPress={() => setRememberMe((prev) => !prev)}
              >
                {rememberMe && <View style={styles.checkboxInner} />}
              </Pressable>
              <Text style={styles.rememberText}>Remember me</Text>
            </View>

            <Pressable
              disabled={submitting}
              style={({ pressed }) => [
                styles.signInButton,
                pressed && !submitting && styles.signInButtonPressed,
              ]}
              onPress={handleSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.signInText}>Sign In</Text>
              )}
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Don&apos;t have an account?</Text>
              <Pressable
                onPress={() => {
                  router.push('/hr/register');
                }}
              >
                <Text style={styles.footerLink}>Register here</Text>
              </Pressable>
            </View>
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
    paddingTop: 32,
    paddingBottom: 32,
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
    width: 96,
    height: 96,
  },
  logoTagline: {
    marginTop: 8,
    fontSize: 14,
    color: '#4b5563',
  },
  card: {
    width: '100%',
    maxWidth: 420,
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
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#054653',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
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
  fieldBlock: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
  },
  forgotPassword: {
    fontSize: 12,
    color: '#0ea5e9',
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
  eyeButton: {
    paddingLeft: 4,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#ffffff',
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#054653',
  },
  rememberText: {
    fontSize: 13,
    color: '#4b5563',
  },
  signInButton: {
    borderRadius: 999,
    backgroundColor: '#054653',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonPressed: {
    opacity: 0.9,
  },
  signInText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    gap: 4,
  },
  footerText: {
    fontSize: 13,
    color: '#6b7280',
  },
  footerLink: {
    fontSize: 13,
    color: '#0ea5e9',
    fontWeight: '500',
  },
});

