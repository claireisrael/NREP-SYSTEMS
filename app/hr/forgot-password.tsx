import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function HrForgotPasswordScreen() {
  const router = useRouter();

  // Step: 1 = email, 2 = OTP code, 3 = new password
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState<string[]>(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState(''); // returned by verify-code route
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const otpRefs = useRef<Array<TextInput | null>>([]);

  // Prefer the env var if provided; otherwise fall back to the deployed HR web domain.
  // The HR Next.js app is hosted at `https://hr.nrep.ug`.
  const HR_WEB_BASE_URL =
    (process.env.EXPO_PUBLIC_HR_WEB_BASE_URL as string | undefined) ?? 'https://hr.nrep.ug';

  const apiBase = useMemo(() => {
    if (!HR_WEB_BASE_URL) return null;
    return HR_WEB_BASE_URL.replace(/\/+$/, '');
  }, [HR_WEB_BASE_URL]);

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword)) score += 1;
    if (/[a-z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;
    return score;
  }, [newPassword]);

  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['#dc3545', '#fd7e14', '#ffc107', '#20c997', '#198754'];

  useEffect(() => {
    // Clear messages when changing steps (mirrors web UX)
    setError(null);
    setSuccess(null);
  }, [step]);

  async function postJson<T>(url: string, body: any): Promise<T> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Try to read response body to make debugging easier (but keep it short).
        let text = '';
        try {
          text = await res.text();
        } catch {
          text = '';
        }
        const snippet = text ? text.slice(0, 300) : '';
        throw new Error(`Request failed (${res.status}) ${snippet ? `: ${snippet}` : ''}`.trim());
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  }

  const handleRequestCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!apiBase) {
      setError(
        'HR web base URL is not configured. Please ask your admin to set EXPO_PUBLIC_HR_WEB_BASE_URL.',
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const url = `${apiBase}/api/auth/password-reset/request-code`;
      const data: any = await postJson(url, { email: trimmedEmail });

      if (data?.success) {
        setSuccess(data.message || 'Verification code sent.');
        setStep(2);

        // Focus first OTP input after transition
        setTimeout(() => otpRefs.current[0]?.focus(), 200);
      } else {
        setError(data?.error || 'Something went wrong. Please try again.');
      }
    } catch (e: any) {
      setError(e?.message ? `Network error: ${e.message}` : 'Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digits = String(value).replace(/\D/g, '');
    if (!digits) {
      const next = [...otpCode];
      next[index] = '';
      setOtpCode(next);
      return;
    }

    // Support paste (e.g., user pastes entire OTP into one box)
    const slice = digits.slice(0, 6).split('');
    const next = [...otpCode];
    slice.forEach((d, i) => {
      if (index + i < 6) next[index + i] = d;
    });
    setOtpCode(next);

    const nextIndex = Math.min(index + slice.length, 5);
    otpRefs.current[nextIndex]?.focus();
  };

  const handleVerifyCode = async () => {
    if (!apiBase) {
      setError(
        'HR web base URL is not configured. Please ask your admin to set EXPO_PUBLIC_HR_WEB_BASE_URL.',
      );
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const code = otpCode.join('');
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const url = `${apiBase}/api/auth/password-reset/verify-code`;
      const data: any = await postJson(url, { email: trimmedEmail, code });

      if (data?.success) {
        setResetToken(String(data.resetToken || ''));
        setSuccess(data.message || 'Code verified successfully.');
        setStep(3);
      } else {
        setError(data?.error || 'Invalid code. Please try again.');
      }
    } catch (e: any) {
      setError(e?.message ? `Network error: ${e.message}` : 'Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!apiBase) {
      setError(
        'HR web base URL is not configured. Please ask your admin to set EXPO_PUBLIC_HR_WEB_BASE_URL.',
      );
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (passwordStrength < 3) {
      setError('Please choose a stronger password.');
      return;
    }

    if (!resetToken) {
      setError('Your reset session is missing. Please request a new code.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const url = `${apiBase}/api/auth/password-reset/reset-password`;
      const data: any = await postJson(url, {
        email: trimmedEmail,
        resetToken,
        newPassword,
      });

      if (data?.success) {
        setSuccess(data.message || 'Your password has been reset successfully.');

        // Mirror web redirect: /login?reset=true (we’ll just return to HR login)
        setTimeout(() => {
          router.replace('/hr');
        }, 2000);
      } else {
        setError(data?.error || 'Failed to reset password. Please try again.');
      }
    } catch (e: any) {
      setError(e?.message ? `Network error: ${e.message}` : 'Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!apiBase) {
      setError(
        'HR web base URL is not configured. Please ask your admin to set EXPO_PUBLIC_HR_WEB_BASE_URL.',
      );
      return;
    }

    setError(null);
    setSuccess(null);
    setOtpCode(['', '', '', '', '', '']);
    setIsSubmitting(true);

    try {
      const url = `${apiBase}/api/auth/password-reset/request-code`;
      const data: any = await postJson(url, { email: trimmedEmail });

      if (data?.success) {
        setSuccess('A new code has been sent to your email.');
        setTimeout(() => otpRefs.current[0]?.focus(), 100);
      } else {
        setError(data?.error || 'Failed to resend code. Please try again.');
      }
    } catch (e: any) {
      setError(e?.message ? `Network error: ${e.message}` : 'Failed to resend code. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmitVerify = otpCode.join('').length === 6 && !isSubmitting;
  const canSubmitReset =
    !isSubmitting &&
    !!newPassword &&
    !!confirmPassword &&
    newPassword === confirmPassword &&
    passwordStrength >= 3 &&
    !!resetToken;

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
            <Pressable
              style={styles.backButton}
              onPress={() => router.replace('/hr')}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="chevron-left" size={22} color="#054653" />
              <Text style={styles.backText}>Back to login</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {step === 1 ? 'Reset Password' : step === 2 ? 'Verify Your Identity' : 'Set New Password'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 1
                  ? "Enter your primary or alternative email address and we'll send you a verification code"
                  : step === 2
                    ? `We sent a 6-digit code to ${email || 'your email'}`
                    : 'Choose a strong password for your account'}
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {success ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{success}</Text>
              </View>
            ) : null}

            <View style={styles.stepsRow}>
              {[1, 2, 3].map((s) => (
                <View
                  key={s}
                  style={styles.stepItem}
                >
                  <View
                    style={[
                      styles.stepCircle,
                      s < step ? styles.stepCircleCompleted : null,
                      s === step ? styles.stepCircleActive : null,
                    ]}
                  >
                    {s < step ? (
                      <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                    ) : (
                      <Text
                        style={[
                          styles.stepCircleText,
                          s === step ? styles.stepCircleTextActive : null,
                        ]}
                      >
                        {s}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.stepLabel}>
                    {s === 1 ? 'Email' : s === 2 ? 'Verify' : 'Password'}
                  </Text>
                </View>
              ))}
            </View>

            {step === 1 ? (
              <View style={styles.formBlock}>
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

                <Pressable
                  disabled={isSubmitting}
                  onPress={handleRequestCode}
                  style={({ pressed }) => [styles.signInButton, pressed && !isSubmitting ? { opacity: 0.9 } : null]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.signInText}>Send Verification Code</Text>
                  )}
                </Pressable>

                <View style={styles.linkRow}>
                  <Pressable onPress={() => router.replace('/hr')}>
                    <Text style={styles.footerLink}>Back to Login</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {step === 2 ? (
              <View style={styles.formBlock}>
                <View style={styles.otpWrap}>
                  {otpCode.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={(r) => {
                        otpRefs.current[idx] = r;
                      }}
                      value={digit}
                      onChangeText={(t) => handleOtpChange(idx, t)}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      autoFocus={idx === 0}
                      style={styles.otpInput}
                      // Allow paste of the whole OTP into any box; we’ll slice to 6 digits.
                      maxLength={6}
                    />
                  ))}
                </View>

                <Pressable
                  disabled={!canSubmitVerify}
                  onPress={handleVerifyCode}
                  style={({ pressed }) => [
                    styles.signInButton,
                    !canSubmitVerify ? { opacity: 0.6 } : null,
                    pressed && canSubmitVerify ? { opacity: 0.9 } : null,
                  ]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.signInText}>Verify Code</Text>
                  )}
                </Pressable>

                <View style={styles.authLinks}>
                  <Pressable disabled={isSubmitting} onPress={handleResendCode}>
                    <Text style={styles.linkButtonText}>Didn’t receive the code? Resend Code</Text>
                  </Pressable>

                  <Pressable
                    disabled={isSubmitting}
                    onPress={() => {
                      setStep(1);
                      setOtpCode(['', '', '', '', '', '']);
                      setResetToken('');
                    }}
                  >
                    <Text style={[styles.linkButtonText, { marginTop: 10 }]}>Change email</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {step === 3 ? (
              <View style={styles.formBlock}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.inputRow}>
                    <View style={styles.inputIconBox}>
                      <MaterialCommunityIcons name="lock-outline" size={20} color="#6b7280" />
                    </View>
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      placeholder="Enter new password"
                      placeholderTextColor="#9ca3af"
                      style={styles.input}
                    />
                    <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.eyeButton}>
                      <MaterialCommunityIcons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#6b7280"
                      />
                    </Pressable>
                  </View>

                  {newPassword ? (
                    <View style={styles.passwordStrengthWrap}>
                      <View style={styles.strengthBars}>
                        {[1, 2, 3, 4, 5].map((level) => (
                          <View
                            key={level}
                            style={[
                              styles.strengthBar,
                              {
                                backgroundColor:
                                  passwordStrength >= level
                                    ? strengthColors[passwordStrength - 1] || '#198754'
                                    : '#e0e0e0',
                              },
                            ]}
                          />
                        ))}
                      </View>
                      <Text style={styles.strengthLabel}>
                        {passwordStrength > 0 ? strengthLabels[passwordStrength - 1] : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.inputRow}>
                    <View style={styles.inputIconBox}>
                      <MaterialCommunityIcons name="lock-outline" size={20} color="#6b7280" />
                    </View>
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      placeholder="Confirm new password"
                      placeholderTextColor="#9ca3af"
                      style={styles.input}
                    />
                  </View>

                  {confirmPassword ? (
                    newPassword === confirmPassword ? (
                      <Text style={styles.fieldSuccess}>Passwords match ✓</Text>
                    ) : (
                      <Text style={styles.fieldError}>Passwords do not match</Text>
                    )
                  ) : null}
                </View>

                <Pressable
                  disabled={!canSubmitReset}
                  onPress={handleResetPassword}
                  style={({ pressed }) => [
                    styles.signInButton,
                    !canSubmitReset ? { opacity: 0.6 } : null,
                    pressed && canSubmitReset ? { opacity: 0.9 } : null,
                  ]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.signInText}>Reset Password</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
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
    paddingTop: 28,
    paddingBottom: 32,
    alignItems: 'center',
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
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#054653',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  successBox: {
    backgroundColor: '#ecfeff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  successText: {
    color: '#0f766e',
    fontSize: 13,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepCircleCompleted: {
    backgroundColor: '#054653',
  },
  stepCircleActive: {
    backgroundColor: '#054653',
  },
  stepCircleText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 13,
  },
  stepCircleTextActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
    textAlign: 'center',
  },
  formBlock: {
    gap: 14,
  },
  fieldBlock: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
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
  eyeButton: {
    paddingLeft: 4,
    paddingVertical: 10,
  },
  signInButton: {
    borderRadius: 999,
    backgroundColor: '#054653',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  linkRow: {
    marginTop: 10,
    alignItems: 'center',
  },
  footerLink: {
    fontSize: 13,
    color: '#0ea5e9',
    fontWeight: '600',
  },
  otpWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  otpInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  authLinks: {
    marginTop: 12,
    alignItems: 'center',
    gap: 6,
  },
  linkButtonText: {
    fontSize: 13,
    color: '#0ea5e9',
    fontWeight: '600',
    textAlign: 'center',
  },
  passwordStrengthWrap: {
    marginTop: 10,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  strengthBar: {
    flex: 1,
    height: 8,
    borderRadius: 999,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
  },
  fieldError: {
    marginTop: 8,
    color: '#dc3545',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldSuccess: {
    marginTop: 8,
    color: '#198754',
    fontSize: 12,
    fontWeight: '600',
  },
});

