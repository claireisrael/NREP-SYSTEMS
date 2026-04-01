import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PmsBottomNav } from '@/components/PmsBottomNav';
import { useAuth } from '@/context/AuthContext';
import { useThemeMode } from '@/context/ThemeModeContext';

export default function PmsProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();

  // If there is no authenticated user, redirect out of this screen via effect
  // to avoid navigation updates during render.
  useEffect(() => {
    if (!user) {
      router.replace('/pms');
    }
  }, [user, router]);

  const profile = user?.profile;
  const authUser = user?.authUser;

  if (!user || !profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <ThemedText type="title">Profile</ThemedText>
            <ThemedText type="default" style={styles.subtitle}>
              Profile details are not available.
            </ThemedText>
          </View>
          <PmsBottomNav />
        </ThemedView>
      </SafeAreaView>
    );
  }

  const firstName = profile.firstName || '';
  const lastName = profile.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim() || profile.email || authUser?.email;
  const initials =
    (firstName?.[0] || '').toUpperCase() + (lastName?.[0] || (profile.email?.[0] || '')).toUpperCase();

  const username =
    profile.username ||
    authUser?.name ||
    (profile.email ? profile.email.split('@')[0] : authUser?.email?.split('@')[0] || '');

  const email = profile.email || authUser?.email || '';
  const title = profile.title || 'Not specified';
  const department = profile.department || 'General';
  const status = (profile.status || 'active').toLowerCase();
  const userType =
    profile.userType || (user.isClient ? 'client' : user.isStaff || user.isAdmin ? 'staff' : 'user');

  const roles: string[] = Array.isArray(profile.role) ? profile.role : user.labels || [];
  const isSupervisor = user.isSupervisor;
  const isAdmin = user.isAdmin;

  const supervisorName = profile.supervisorName;
  const supervisorId = profile.supervisorId;

  const handleLogout = async () => {
    if (signingOut) return;
    try {
      setSigningOut(true);
      await logout();
      // Navigation reset is handled in app/pms/_layout.tsx when session ends.
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header card */}
          <View style={styles.headerCard}>
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>{initials || '?'}</Text>
              </View>
            </View>

            <View style={styles.headerTextBlock}>
              <Text style={styles.nameText} numberOfLines={1}>
                {fullName}
              </Text>
              {username ? (
                <Text style={styles.usernameText} numberOfLines={1}>
                  @{username}
                </Text>
              ) : null}

              <View style={styles.badgesRow}>
                <View style={[styles.badgePill, styles.statusBadge]}>
                  <Text style={styles.badgeText}>
                    {status === 'active'
                      ? 'Active'
                      : status === 'inactive'
                      ? 'Inactive'
                      : status === 'invited'
                      ? 'Invited'
                      : status === 'suspended'
                      ? 'Suspended'
                      : status}
                  </Text>
                </View>
                <View style={[styles.badgePill, styles.typeBadge]}>
                  <Text style={styles.badgeText}>{userType}</Text>
                </View>
                {isAdmin && (
                  <View style={[styles.badgePill, styles.adminBadge]}>
                    <Text style={styles.badgeText}>Admin</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Contact info card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Contact Info</Text>
            </View>

            <View style={styles.infoRow}>
              <MaterialCommunityIcons
                name="email-outline"
                size={18}
                color="#0f766e"
                style={styles.infoIcon}
              />
              <View style={styles.infoTextBlock}>
                <Text style={styles.infoLabel}>Email Address</Text>
                <Text style={styles.infoValue}>{email || 'Not provided'}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <MaterialCommunityIcons
                name="briefcase-outline"
                size={18}
                color="#0f766e"
                style={styles.infoIcon}
              />
              <View style={styles.infoTextBlock}>
                <Text style={styles.infoLabel}>Job Title</Text>
                <Text style={styles.infoValue}>{title}</Text>
              </View>
            </View>

            {user.isStaff && (
              <View style={styles.infoRow}>
                <MaterialCommunityIcons
                  name="office-building-outline"
                  size={18}
                  color="#0f766e"
                  style={styles.infoIcon}
                />
                <View style={styles.infoTextBlock}>
                  <Text style={styles.infoLabel}>Department</Text>
                  <Text style={styles.infoValue}>{department}</Text>
                </View>
              </View>
            )}

            <View style={styles.infoRow}>
              <MaterialCommunityIcons
                name="domain"
                size={18}
                color="#0f766e"
                style={styles.infoIcon}
              />
              <View style={styles.infoTextBlock}>
                <Text style={styles.infoLabel}>Organization</Text>
                <Text style={styles.infoValue}>
                  {user.organizationName || user.organization?.name || 'NREP'}
                </Text>
              </View>
            </View>
          </View>

          {/* System privileges card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>System Privileges</Text>
            </View>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons
                  name="shield-check-outline"
                  size={20}
                  color="#0f766e"
                />
                <Text style={styles.sectionHeaderText}>Role Access</Text>
              </View>
              <View style={styles.chipsRow}>
                {roles.length > 0 ? (
                  roles.map((r) => (
                    <View key={r} style={styles.roleChip}>
                      <Text style={styles.roleChipText}>{r}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.placeholderText}>No specific roles assigned.</Text>
                )}
              </View>
            </View>

          {/* Appearance / Theme card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Appearance</Text>
            </View>

            <View style={styles.infoRow}>
              <MaterialCommunityIcons
                name="theme-light-dark"
                size={18}
                color="#0f766e"
                style={styles.infoIcon}
              />
              <View style={styles.infoTextBlock}>
                <Text style={styles.infoLabel}>Theme</Text>
                <View style={styles.themeModeRow}>
                  {(['system', 'light', 'dark'] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      style={[
                        styles.themeModeChip,
                        themeMode === mode && styles.themeModeChipActive,
                      ]}
                      onPress={() => setThemeMode(mode)}
                    >
                      <Text
                        style={[
                          styles.themeModeChipText,
                          themeMode === mode && styles.themeModeChipTextActive,
                        ]}
                      >
                        {mode === 'system'
                          ? 'System'
                          : mode === 'light'
                          ? 'Light'
                          : 'Dark'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>

            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons
                  name="account-check-outline"
                  size={20}
                  color={isSupervisor ? '#16a34a' : '#6b7280'}
                />
                <Text style={styles.sectionHeaderText}>Supervisor Status</Text>
              </View>
              <Text style={styles.infoValue}>
                {isSupervisor ? 'Is a Supervisor' : 'Not a Supervisor'}
              </Text>
            </View>

            {supervisorId && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons
                    name="account-tie-outline"
                    size={20}
                    color="#0f766e"
                  />
                  <Text style={styles.sectionHeaderText}>Reports To</Text>
                </View>
                <Text style={styles.infoValue}>
                  {supervisorName || 'Supervisor Assigned'} ({supervisorId})
                </Text>
              </View>
            )}
          </View>

          {/* Logout button */}
          <View style={styles.footerActions}>
            <Pressable style={styles.logoutButton} onPress={handleLogout} disabled={signingOut}>
              <MaterialCommunityIcons
                name="logout"
                size={18}
                color="#b91c1c"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.logoutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
            </Pressable>
          </View>
        </ScrollView>

        <PmsBottomNav />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  avatarWrapper: {
    marginRight: 14,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: '#14B8A6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerTextBlock: {
    flex: 1,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  usernameText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadge: {
    backgroundColor: '#ecfdf5',
  },
  typeBadge: {
    backgroundColor: '#e0f2fe',
  },
  adminBadge: {
    backgroundColor: '#fee2e2',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'capitalize',
  },
  themeModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  themeModeChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  themeModeChipActive: {
    borderColor: '#14B8A6',
    backgroundColor: '#ecfdf3',
  },
  themeModeChipText: {
    fontSize: 11,
    color: '#4b5563',
    fontWeight: '500',
  },
  themeModeChipTextActive: {
    color: '#054653',
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  infoIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  infoTextBlock: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 13,
    color: '#111827',
  },
  sectionBlock: {
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  roleChipText: {
    fontSize: 11,
    color: '#111827',
    textTransform: 'capitalize',
  },
  placeholderText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  footerActions: {
    marginBottom: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
  },
});

