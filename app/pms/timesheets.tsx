import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { PmsBottomNav } from '@/components/PmsBottomNav';
import { useAuth } from '@/context/AuthContext';

// Match web PMS origin used for API routes
const PMS_WEB_BASE_URL = 'https://projects.nrep.ug';

type TimesheetDashboardData = {
  statusCounts: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
  recentTimesheets: any[];
  currentWeekStats?: {
    exists: boolean;
    status: string;
    weekStart: string;
    totalHours: number;
    entriesCount: number;
    supervisorApproval?: boolean | null;
  };
};

export default function PmsTimesheetsScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<TimesheetDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      if (!user?.authUser?.$id || !user.organizationId) return;

      setLoading(true);
      setError(null);

      // Web API expects requesterId for authorization checks.
      // Keep accountId too for backwards compatibility with older handlers.
      const url =
        `${PMS_WEB_BASE_URL}/api/timesheets/dashboard` +
        `?accountId=${encodeURIComponent(user.authUser.$id)}` +
        `&requesterId=${encodeURIComponent(user.authUser.$id)}` +
        `&organizationId=${encodeURIComponent(user.organizationId)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load dashboard data');
      }

      setDashboard(data as TimesheetDashboardData);
    } catch (err: any) {
      console.error('Failed to load timesheet dashboard', err);
      setError(err?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [user?.authUser?.$id, user?.organizationId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const getWeekStartISO = () => {
    const today = new Date();
    const day = today.getDay(); // 0=Sun, 1=Mon,...
    const diff = (day + 6) % 7; // days since Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    const year = monday.getFullYear();
    const month = `${monday.getMonth() + 1}`.padStart(2, '0');
    const date = `${monday.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const handleStartTracking = async () => {
    if (!user?.authUser?.$id || !user.organizationId || starting) return;

    try {
      setStarting(true);

      const weekStart = getWeekStartISO();

      const res = await fetch(`${PMS_WEB_BASE_URL}/api/timesheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: user.authUser.$id,
          requesterId: user.authUser.$id,
          organizationId: user.organizationId,
          weekStart,
          entries: [],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to start tracking for this week.');
      }

      // Refresh dashboard so current week stats update
      await loadDashboard();

      // Navigate to detailed "My Timesheets" view for this week
      router.push('/pms/timesheets/my');
    } catch (err: any) {
      console.error('Failed to start tracking', err);
      Alert.alert('Error', err?.message || 'Failed to start tracking for this week.');
    } finally {
      setStarting(false);
    }
  };

  const getStatusBadgeText = (timesheet: any) => {
    const status = timesheet.status;

    if (status === 'rejected') return 'Rejected';
    if (status === 'approved') return 'Approved';

    if (status === 'submitted') {
      if (timesheet.supervisorApproval === false) {
        return 'Pending Supervisor';
      }
      return 'Pending Admin';
    }

    return 'Draft';
  };

  const renderCurrentWeekNotice = () => {
    const stats = dashboard?.currentWeekStats;
    if (!stats) return null;

    if (!stats.exists) {
      return (
        <View style={[styles.noticeCard, styles.noticeInfoCard]}>
          <View style={styles.noticeIconWrapper}>
            <MaterialCommunityIcons name="information" size={18} color="#0f766e" />
          </View>
          <View style={styles.noticeTextBlock}>
            <Text style={styles.noticeTitle}>No timesheet for current week</Text>
            <Text style={styles.noticeSubtitle}>
              Start tracking your time for this week.
            </Text>
          </View>
          <Pressable
            style={styles.noticeButton}
            onPress={handleStartTracking}
            disabled={starting}
          >
            <Text style={styles.noticeButtonText}>
              {starting ? 'Starting…' : 'Start Tracking'}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (stats.exists && stats.status === 'rejected') {
      return (
        <View style={[styles.noticeCard, styles.noticeDangerCard]}>
          <View style={styles.noticeIconWrapper}>
            <MaterialCommunityIcons name="alert-circle" size={18} color="#b91c1c" />
          </View>
          <View style={styles.noticeTextBlock}>
            <Text style={styles.noticeTitle}>Current week timesheet was rejected</Text>
            <Text style={styles.noticeSubtitle}>
              Please review the feedback on the web and resubmit.
            </Text>
          </View>
          <Pressable
            style={styles.noticeButtonOutline}
            onPress={() =>
              Alert.alert('Review on web', 'Please use the web portal to review details.')
            }
          >
            <Text style={styles.noticeButtonOutlineText}>Review</Text>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  const renderStatusCards = () => {
    const counts = dashboard?.statusCounts || {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
    };

    return (
      <View style={styles.statusGrid}>
        <View style={styles.statusCard}>
          <MaterialCommunityIcons
            name="file-document-outline"
            size={28}
            color="#6b7280"
            style={styles.statusIcon}
          />
          <Text style={styles.statusValue}>{counts.draft || 0}</Text>
          <Text style={styles.statusLabel}>Draft</Text>
        </View>
        <View style={styles.statusCard}>
          <MaterialCommunityIcons
            name="clock-outline"
            size={28}
            color="#f59e0b"
            style={styles.statusIcon}
          />
          <Text style={styles.statusValue}>{counts.submitted || 0}</Text>
          <Text style={styles.statusLabel}>Pending Approval</Text>
        </View>
        <View style={styles.statusCard}>
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={28}
            color="#16a34a"
            style={styles.statusIcon}
          />
          <Text style={styles.statusValue}>{counts.approved || 0}</Text>
          <Text style={styles.statusLabel}>Approved</Text>
        </View>
        <View style={styles.statusCard}>
          <MaterialCommunityIcons
            name="close-circle-outline"
            size={28}
            color="#b91c1c"
            style={styles.statusIcon}
          />
          <Text style={styles.statusValue}>{counts.rejected || 0}</Text>
          <Text style={styles.statusLabel}>Rejected</Text>
        </View>
      </View>
    );
  };

  const renderCurrentWeekSummary = () => {
    const stats = dashboard?.currentWeekStats;
    if (!stats || !stats.exists) return null;

    const weekStart = new Date(stats.weekStart);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Current Week Summary</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Week Starting</Text>
            <Text style={styles.summaryValue}>
              {weekStart.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Status</Text>
            <View style={styles.statusBadgePill}>
              <Text style={styles.statusBadgeText}>{getStatusBadgeText(stats)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Hours</Text>
            <Text style={styles.summaryValue}>{stats.totalHours ?? 0}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Entries</Text>
            <Text style={styles.summaryValue}>{stats.entriesCount ?? 0}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderRecentTimesheets = () => {
    const list = dashboard?.recentTimesheets || [];

    return (
      <View style={[styles.card, styles.recentCard]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.recentHeaderLeft}>
            <View style={styles.recentHeaderIcon}>
              <MaterialCommunityIcons name="history" size={18} color="#054653" />
            </View>
            <Text style={styles.cardTitle}>Recent Timesheets</Text>
          </View>
        </View>

        {list.length === 0 ? (
          <Text style={styles.placeholderText}>
            You have no recent timesheets. Create or submit one from the web portal.
          </Text>
        ) : (
          list.slice(0, 5).map((ts: any) => {
            const start = new Date(ts.weekStartDate || ts.weekStart);
            const periodLabel = `${start.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}`;
            const statusText = getStatusBadgeText(ts);
            const statusUpper = String(statusText || '').toLowerCase();
            const statusStyle =
              statusUpper.includes('rejected')
                ? styles.recentStatusReject
                : statusUpper.includes('approved')
                  ? styles.recentStatusApprove
                  : statusUpper.includes('supervisor')
                    ? styles.recentStatusSupervisor
                    : statusUpper.includes('admin')
                      ? styles.recentStatusAdmin
                      : styles.recentStatusDraft;

            return (
              <View key={ts.$id} style={styles.recentRow}>
                <View style={styles.recentAccent} />
                <View style={styles.timesheetLeft}>
                  <Text style={styles.timesheetPeriod}>{periodLabel}</Text>
                  <Text style={styles.timesheetMeta}>
                    {ts.totalHours ?? 0}h · {ts.entriesCount ?? 0} entries
                  </Text>
                </View>
                <View style={[styles.recentStatusPill, statusStyle]}>
                  <Text style={styles.recentStatusText}>{statusText}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    );
  };

  const renderQuickActions = () => {
    if (!user) return null;

    const canViewTeam = user.isAdmin || user.isSupervisor || user.isFinance;

    const handleReports = () => {
      Alert.alert('Use web portal', 'Timesheet reports are available on the web portal.');
    };

    const handleTeam = () => {
      if (!canViewTeam) return;
      Alert.alert(
        'Use web portal',
        'Team-wide timesheet views are available on the web portal.',
      );
    };

    return (
      <View style={styles.quickCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
        </View>
        <View style={styles.quickGrid}>
          <Pressable style={styles.quickButton} onPress={handleReports}>
            <MaterialCommunityIcons
              name="chart-line"
              size={20}
              color="#0f766e"
              style={styles.quickIcon}
            />
            <Text style={styles.quickTitle}>Reports</Text>
            <Text style={styles.quickSubtitle}>Summary of timesheet activity</Text>
          </Pressable>

          {canViewTeam && (
            <Pressable style={styles.quickButton} onPress={handleTeam}>
              <MaterialCommunityIcons
                name="account-group-outline"
                size={20}
                color="#0f766e"
                style={styles.quickIcon}
              />
              <Text style={styles.quickTitle}>All Staff</Text>
              <Text style={styles.quickSubtitle}>Team timesheet overview</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerCard}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons name="clock-time-four-outline" size={20} color="#054653" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Timesheets</Text>
                <Text style={styles.headerSubtitleSmall}>
                  Track your weekly time and submit for approval.
                </Text>
              </View>
              <View style={styles.headerAccentPill}>
                <Text style={styles.headerAccentText}>PMS</Text>
              </View>
            </View>

            {dashboard?.currentWeekStats ? (
              <View style={styles.headerChipsRow}>
                <View style={styles.headerChip}>
                  <Text style={styles.headerChipLabel}>This week</Text>
                  <Text style={styles.headerChipValue}>
                    {(dashboard.currentWeekStats.totalHours ?? 0).toFixed(1)}h
                  </Text>
                </View>
                <View style={styles.headerChip}>
                  <Text style={styles.headerChipLabel}>Status</Text>
                  <Text style={styles.headerChipValue}>{getStatusBadgeText(dashboard.currentWeekStats)}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {renderQuickActions()}

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color="#0f766e" />
              <Text style={styles.loadingText}>Loading timesheet dashboard…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.errorCard}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={18}
                color="#b91c1c"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && dashboard && (
            <>
              {renderCurrentWeekNotice()}
              {renderStatusCards()}
              {renderCurrentWeekSummary()}
              {renderRecentTimesheets()}
            </>
          )}
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
  headerCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#e6f4f2',
    borderWidth: 1,
    borderColor: '#bfe7e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAccentPill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#FFB803',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAccentText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#054653',
    letterSpacing: 0.4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#054653',
  },
  headerSubtitleSmall: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  headerChipsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  headerChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerChipLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  headerChipValue: {
    marginTop: 4,
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '900',
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#6b7280',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  noticeInfoCard: {
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  noticeDangerCard: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  noticeIconWrapper: {
    marginRight: 8,
  },
  noticeTextBlock: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  noticeSubtitle: {
    fontSize: 12,
    color: '#4b5563',
  },
  noticeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0f766e',
  },
  noticeButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  noticeButtonOutline: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#b91c1c',
  },
  noticeButtonOutlineText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b91c1c',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  statusCard: {
    flexGrow: 1,
    minWidth: '47%',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'flex-start',
  },
  statusIcon: {
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusLabel: {
    marginTop: 2,
    fontSize: 11,
    color: '#6b7280',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  recentCard: {
    borderColor: '#dbeafe',
  },
  recentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentHeaderIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: '#e6f4f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfe7e1',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  recentAccent: {
    width: 4,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#054653',
    opacity: 0.9,
  },
  recentStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  recentStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#054653',
    textTransform: 'uppercase',
  },
  recentStatusDraft: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  recentStatusSupervisor: {
    backgroundColor: '#ecfeff',
    borderColor: '#a5f3fc',
  },
  recentStatusAdmin: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  recentStatusApprove: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  recentStatusReject: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1d4ed8',
    textTransform: 'uppercase',
  },
  timesheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  timesheetLeft: {
    flex: 1,
  },
  timesheetPeriod: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  timesheetMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#6b7280',
  },
  statusBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
  },
  statusBadgeSmallText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338ca',
    textTransform: 'uppercase',
  },
  placeholderText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'left',
    marginTop: 4,
  },
  quickCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  quickGrid: {
    flexDirection: 'column',
    gap: 6,
    marginTop: 2,
  },
  quickButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickIcon: {
    marginRight: 8,
  },
  quickTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  quickSubtitle: {
    marginTop: 1,
    fontSize: 10,
    color: '#6b7280',
  },
});

