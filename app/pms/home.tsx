import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { PMS_COLLECTIONS, PMS_DB_ID, pmsDatabases, Query } from '@/lib/appwrite';
import { useAuth } from '@/context/AuthContext';
import { PmsBottomNav } from '@/components/PmsBottomNav';

const PMS_WEB_BASE_URL = 'https://projects.nrep.ug';
const NREP_SITE_URL = 'https://nrep.ug/';

type Project = {
  $id: string;
  name: string;
  code?: string;
  status?: string;
  clientName?: string;
  progress?: number;
};

type Task = {
  $id: string;
  title: string;
  projectName?: string;
  priority?: string;
  dueDate?: string;
};

const formatStatusLabel = (status?: string) => {
  if (!status) return '';
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export default function PmsHomeScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<{
    totalProjects: number;
    activeProjects: number;
    weeklyHours?: number;
    myOpenTasks?: number;
    myProjects?: number;
    totalUsers?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageBackground = useThemeColor({}, 'background');
  const primaryTextColor = useThemeColor({}, 'text');

  // Redirect to PMS entry when user logs out, but do it in an effect
  // to avoid navigation state updates during render.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/pms');
    }
  }, [authLoading, user, router]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  useEffect(() => {
    if (!user || authLoading) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const isSupervisor = user.isSupervisor && !user.isAdmin;
        const isAdmin = user.isAdmin;
        const accountId = user.profile?.accountId || user.authUser?.$id;

        // --- Projects ---
        // For now, mirror web behaviour: use same query for all roles
        const projectsRes = await pmsDatabases.listDocuments(
          PMS_DB_ID,
          PMS_COLLECTIONS.PROJECTS,
          [Query.orderDesc('$createdAt'), Query.limit(100)],
        );

        const projDocs = projectsRes.documents as any[];
        const mappedProjects: Project[] = projDocs.map((p) => ({
          $id: p.$id,
          name: p.name,
          code: p.code,
          clientName: p.clientName,
          status: p.status,
          progress: typeof p.progress === 'number' ? p.progress : undefined,
        }));

        let staffProjects: Project[] = mappedProjects;

        // Build basic stats similar to web dashboard
        const allProjects = projDocs;
        const newStats: {
          totalProjects: number;
          activeProjects: number;
          weeklyHours?: number;
          myOpenTasks?: number;
          myProjects?: number;
          totalUsers?: number;
        } = {
          totalProjects: projectsRes.total,
          activeProjects: allProjects.filter((p) => p.status === 'active').length,
        };

        if (isAdmin) {
          const usersRes = await pmsDatabases.listDocuments(
            PMS_DB_ID,
            PMS_COLLECTIONS.USERS,
            [Query.limit(1)],
          );
          newStats.totalUsers = usersRes.total;
        }

        // --- Staff-specific metrics + upcoming tasks (to mirror web staff dashboard) ---
        if (!isAdmin && !isSupervisor && accountId && user.organizationId) {
          try {
            const tasksRes = await pmsDatabases.listDocuments(
              PMS_DB_ID,
              PMS_COLLECTIONS.TASKS,
              [
                Query.contains('assignedTo', accountId),
                Query.notEqual('status', 'done'),
                Query.orderAsc('dueDate'),
                Query.limit(100),
              ],
            );

            const taskDocs = tasksRes.documents as any[];
            const mappedTasks: Task[] = taskDocs.slice(0, 5).map((t) => ({
              $id: t.$id,
              title: t.title,
              projectName: (t as any).projectName,
              priority: t.priority,
              dueDate: t.dueDate,
            }));

            setUpcomingTasks(mappedTasks);
            newStats.myOpenTasks = tasksRes.total;

            // Derive "My Projects" as projects where this user has open tasks
            const staffProjectIds = new Set(
              taskDocs
                .map((t: any) => t.projectId)
                .filter(Boolean),
            );
            staffProjects = mappedProjects.filter((p) => staffProjectIds.has(p.$id));
          } catch {
            setUpcomingTasks([]);
          }

          // Weekly hours via the same dashboard API used on web
          try {
            const url =
              `${PMS_WEB_BASE_URL}/api/timesheets/dashboard` +
              `?accountId=${encodeURIComponent(accountId)}` +
              `&requesterId=${encodeURIComponent(accountId)}` +
              `&organizationId=${encodeURIComponent(user.organizationId)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (res.ok && data?.currentWeekStats) {
              newStats.weeklyHours = data.currentWeekStats.totalHours ?? 0;
            }
          } catch (dashErr) {
            console.error('Failed to load staff timesheet dashboard', dashErr);
          }

          newStats.myProjects = staffProjects.length;
        } else {
          setUpcomingTasks([]);
        }

        setStats(newStats);
        setProjects(isAdmin || isSupervisor ? mappedProjects : staffProjects);
      } catch (err: any) {
        console.error('Failed to load PMS dashboard', err);
        setError(err?.message || 'Failed to load dashboard data from Appwrite.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, authLoading]);

  const isSupervisor = !!user?.isSupervisor && !user?.isAdmin;
  const isAdmin = !!user?.isAdmin;
  const roleLabel = isAdmin ? 'Administrator' : isSupervisor ? 'Supervisor' : 'Staff Member';

  const rawDisplayName =
    user?.profile?.firstName || user?.profile?.username || user?.profile?.email || 'User';
  const displayName = rawDisplayName.replace(/!/g, '');

  const handleOpenNrepSite = async () => {
    try {
      const supported = await Linking.canOpenURL(NREP_SITE_URL);
      if (!supported) return;
      await Linking.openURL(NREP_SITE_URL);
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: pageBackground }]}>
      <ThemedView style={styles.container}>
        <View style={styles.welcomeCard}>
          <Pressable
            style={styles.avatarCircle}
            onPress={() => router.push('/pms/profile')}
          >
            <Text style={styles.avatarInitials}>
              {(displayName?.[0] || 'U').toUpperCase()}
            </Text>
          </Pressable>
          <View style={styles.welcomeRightBlock}>
            <Text style={styles.welcomeGreeting}>
              {getGreeting()},{' '}
              <Text style={styles.welcomeNameInline}>{displayName}!</Text>
            </Text>
            <View style={styles.welcomeChipsRow}>
              <View style={[styles.welcomeChip, styles.welcomeChipPrimary]}>
                <Text style={styles.welcomeChipText}>{roleLabel}</Text>
              </View>
              <View style={styles.welcomeChip}>
                <Text style={styles.welcomeChipTextMuted}>NREP PROJECTS</Text>
              </View>
            </View>
            <Text style={styles.welcomeDate}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleOpenNrepSite}
          hitSlop={8}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.14)' }}
          accessibilityRole="link"
          accessibilityLabel="Visit the NREP website"
          accessibilityHint="Opens the NREP website in your browser"
          style={({ pressed }) => [styles.nrepCtaCard, pressed && { opacity: 0.92 }]}
        >
          <View style={styles.nrepCtaLeft}>
            <View style={styles.nrepCtaIconWrap}>
              <MaterialCommunityIcons name="web" size={18} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nrepCtaTitle}>VISIT THE NREP SITE</Text>
              <Text style={styles.nrepCtaUrl} numberOfLines={1}>
                nrep.ug
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons name="arrow-top-right" size={18} color="#ffffff" />
        </Pressable>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Dashboard metrics */}
          {!loading && !error && stats && (
            isAdmin || isSupervisor ? (
              <View style={styles.statsRow}>
                <View style={[styles.statsCard, styles.statsCardPrimary]}>
                  <Text style={styles.statsLabel}>Total Projects</Text>
                  <Text style={styles.statsValue}>{stats.totalProjects}</Text>
                </View>

                <View style={styles.statsCard}>
                  <Text style={styles.statsLabel}>Active Projects</Text>
                  <Text style={styles.statsValue}>{stats.activeProjects}</Text>
                </View>

                {isAdmin && (
                  <View style={styles.statsCard}>
                    <Text style={styles.statsLabel}>Total Users</Text>
                    <Text style={styles.statsValue}>{stats.totalUsers ?? '-'}</Text>
                  </View>
                )}

                <View style={[styles.statsCard, styles.statsCardStatus]}>
                  <Text style={styles.statsLabel}>System Status</Text>
                  <Text style={styles.statsStatusValue}>Healthy</Text>
                </View>
              </View>
            ) : (
              <View style={styles.statsChipsRow}>
                <View style={[styles.statsChip, styles.statsChipPrimary]}>
                  <Text style={styles.statsChipLabel}>Weekly Hours</Text>
                  <Text style={styles.statsChipValue}>
                    {(stats.weeklyHours ?? 0).toFixed(1)}h
                  </Text>
                  <Text style={styles.statsChipSub}>Current Week</Text>
                </View>
                <View style={styles.statsChip}>
                  <Text style={styles.statsChipLabel}>Open Tasks</Text>
                  <Text style={styles.statsChipValue}>{stats.myOpenTasks ?? 0}</Text>
                </View>
                <View style={styles.statsChip}>
                  <Text style={styles.statsChipLabel}>My Projects</Text>
                  <Text style={styles.statsChipValue}>
                    {stats.myProjects ?? stats.totalProjects}
                  </Text>
                </View>
              </View>
            )
          )}

          {loading && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#0f766e" />
              <Text style={styles.loadingText}>Loading your workspace…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && (
            isAdmin || isSupervisor ? (
              <View>
                {/* Team / Admin Projects list */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: primaryTextColor }]}>
                    {isSupervisor || isAdmin ? 'Team Projects' : 'My Projects'}
                  </Text>
                </View>

                <FlatList
                  data={projects}
                  keyExtractor={(item) => item.$id}
                  scrollEnabled={false}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>
                      No projects yet. Create projects from the web Project Management System.
                    </Text>
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.projectCard}
                      onPress={() => router.push(`/pms/projects/${item.$id}`)}
                    >
                      <View
                        style={[
                          styles.projectAccent,
                          item.status === 'active' && styles.projectAccentActive,
                          item.status === 'at_risk' && styles.projectAccentRisk,
                          item.status === 'on_hold' && styles.projectAccentOnHold,
                          item.status === 'planned' && styles.projectAccentPlanned,
                          item.status === 'completed' && styles.projectAccentCompleted,
                        ]}
                      />

                      <View style={styles.projectHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.projectName} numberOfLines={2}>
                            {item.name}
                          </Text>
                          {item.clientName ? (
                            <Text style={styles.projectMeta} numberOfLines={1}>
                              Lead: {item.clientName}
                            </Text>
                          ) : null}
                        </View>

                        {item.status ? (
                          <View
                            style={[
                              styles.statusPill,
                              item.status === 'active' && styles.statusPillOnTrack,
                              item.status === 'at_risk' && styles.statusPillRisk,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                item.status === 'active' && { color: '#047857' },
                                item.status === 'at_risk' && { color: '#b91c1c' },
                                item.status === 'on_hold' && { color: '#92400e' },
                                item.status === 'planned' && { color: '#1d4ed8' },
                                item.status === 'completed' && { color: '#054653' },
                                item.status === 'cancelled' && { color: '#6b7280' },
                              ]}
                            >
                              {formatStatusLabel(item.status)}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {item.progress !== undefined && (
                        <>
                          <Text style={styles.progressLabel}>Progress</Text>
                          <View style={styles.progressBarTrack}>
                            <View
                              style={[
                                styles.progressBarFill,
                                { width: `${Math.min(Math.max(item.progress, 0), 100)}%` },
                              ]}
                            />
                          </View>
                        </>
                      )}
                    </Pressable>
                  )}
                />
              </View>
            ) : (
              <View>
                {/* Staff: My Active Projects + Activity Schedule + Upcoming Tasks */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: primaryTextColor }]}>
                    My Active Projects
                  </Text>
                  <Pressable onPress={() => router.push('/pms/projects')}>
                    <Text style={styles.viewAllLink}>View All →</Text>
                  </Pressable>
                </View>

                {projects.length === 0 ? (
                  <Text style={styles.emptyText}>No projects found.</Text>
                ) : (
                  projects.map((item) => (
                    <Pressable
                      key={item.$id}
                      style={styles.projectCard}
                      onPress={() => router.push(`/pms/projects/${item.$id}`)}
                    >
                      <View style={styles.projectHeaderRow}>
                        <Text style={styles.projectName}>{item.name}</Text>
                        {item.status && (
                        <View
                          style={[
                            styles.statusPill,
                            item.status === 'active' && styles.statusPillOnTrack,
                            item.status === 'at_risk' && styles.statusPillRisk,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              item.status === 'active' && { color: '#047857' },
                              item.status === 'at_risk' && { color: '#b91c1c' },
                              item.status === 'on_hold' && { color: '#92400e' },
                              item.status === 'planned' && { color: '#1d4ed8' },
                              item.status === 'completed' && { color: '#054653' },
                              item.status === 'cancelled' && { color: '#6b7280' },
                            ]}
                          >
                            {formatStatusLabel(item.status)}
                          </Text>
                        </View>
                        )}
                      </View>
                      {item.clientName && (
                        <Text style={styles.projectMeta}>Lead: {item.clientName}</Text>
                      )}
                      {item.progress !== undefined && (
                        <>
                          <Text style={styles.progressLabel}>Progress</Text>
                          <View style={styles.progressBarTrack}>
                            <View
                              style={[
                                styles.progressBarFill,
                                { width: `${Math.min(Math.max(item.progress, 0), 100)}%` },
                              ]}
                            />
                          </View>
                        </>
                      )}
                    </Pressable>
                  ))
                )}

                {/* Activity Schedule placeholder, like web when empty */}
                <View style={styles.activityCard}>
                  <Text style={[styles.sectionTitle, { color: primaryTextColor }]}>
                    Activity Schedule
                  </Text>
                  <Text style={styles.emptyText}>No upcoming milestones.</Text>
                </View>

                {/* Upcoming Tasks */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, { color: primaryTextColor }]}>
                    Upcoming Tasks
                  </Text>
                </View>
                {upcomingTasks.length === 0 ? (
                  <Text style={styles.emptyText}>No upcoming tasks.</Text>
                ) : (
                  upcomingTasks.map((item) => {
                    const priority = (item.priority || '').toLowerCase();
                    const priorityLabel =
                      priority.charAt(0).toUpperCase() + priority.slice(1) || 'Medium';

                    return (
                      <View key={item.$id} style={styles.taskCard}>
                        <View style={styles.taskAccent} />

                        <View style={styles.taskContent}>
                          <View style={styles.taskHeaderRow}>
                            <Text style={styles.taskTitle} numberOfLines={2}>
                              {item.title}
                            </Text>
                            {priority && (
                              <View
                                style={[
                                  styles.taskPriorityPill,
                                  priority === 'high' && styles.taskPriorityHigh,
                                  priority === 'critical' && styles.taskPriorityCritical,
                                  priority === 'medium' && styles.taskPriorityMedium,
                                  priority === 'low' && styles.taskPriorityLow,
                                ]}
                              >
                                <Text style={styles.taskPriorityPillText}>{priorityLabel}</Text>
                              </View>
                            )}
                          </View>

                          {(item.projectName || item.dueDate) && (
                            <View style={styles.taskMetaRow}>
                              {item.projectName && (
                                <Text style={styles.taskMeta} numberOfLines={1}>
                                  {item.projectName}
                                </Text>
                              )}
                              {item.dueDate && (
                                <Text style={styles.taskMetaDue}>
                                  Due{' '}
                                  {new Date(item.dueDate).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )
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
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14B8A6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roleChipIcon: {
    marginRight: 4,
    color: '#e0f2fe',
  },
  roleChipText: {
    fontSize: 12,
    color: '#e0f2fe',
    fontWeight: '600',
  },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#14B8A6',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  nrepCtaCard: {
    marginTop: -4,
    marginBottom: 2,
    borderRadius: 16,
    backgroundColor: '#054653',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  nrepCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  nrepCtaIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nrepCtaTitle: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  nrepCtaUrl: {
    marginTop: 2,
    color: 'rgba(224, 242, 254, 0.95)',
    fontSize: 12,
    fontWeight: '600',
  },
  welcomeLeft: {
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#14B8A6',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14B8A6',
  },
  welcomeRightBlock: {
    flex: 1,
  },
  welcomeGreeting: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  welcomeNameInline: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  welcomeRole: {
    marginTop: 4,
    color: '#e0f2fe',
    fontSize: 12,
    opacity: 0.9,
  },
  welcomeDate: {
    marginTop: 6,
    color: '#e0f2fe',
    fontSize: 12,
  },
  welcomeRight: {
    marginLeft: 12,
  },
  welcomeChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
    flexWrap: 'wrap',
  },
  welcomeChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(15,118,110,0.2)',
  },
  welcomeChipPrimary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#14B8A6',
  },
  welcomeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#14B8A6',
    textTransform: 'uppercase',
  },
  welcomeChipTextMuted: {
    fontSize: 11,
    fontWeight: '500',
    color: '#e0f2fe',
    textTransform: 'uppercase',
  },
  dateBadge: {
    borderRadius: 12,
    backgroundColor: 'rgba(15,118,110,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  logTimeButton: {
    borderRadius: 999,
    backgroundColor: '#054653',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  statsCard: {
    flexBasis: '48%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    marginBottom: 4,
    gap: 8,
  },
  statsCardPrimary: {
    borderWidth: 1,
    borderColor: '#054653',
  },
  statsCardFull: {
    flexBasis: '100%',
  },
  statsLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  statsValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: '#054653',
  },
  statsSubLabel: {
    marginTop: 2,
    fontSize: 11,
    color: '#9ca3af',
  },
  statsCardStatus: {
    backgroundColor: '#ecfdf3',
  },
  statsStatusValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: '#15803d',
  },
  statsChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  statsChip: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statsChipPrimary: {
    borderColor: '#0f766e',
  },
  statsChipLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  statsChipValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: '#054653',
  },
  statsChipSub: {
    marginTop: 2,
    fontSize: 10,
    color: '#9ca3af',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  loadingText: {
    marginTop: 8,
    color: '#4b5563',
  },
  errorText: {
    color: '#b91c1c',
    textAlign: 'center',
  },
  sectionHeaderRow: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  filterChipLabel: {
    fontSize: 12,
    color: '#374151',
  },
  filterChipLabelActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  projectCard: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  projectAccent: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: 999,
    backgroundColor: '#9ca3af',
    opacity: 0.9,
  },
  projectAccentActive: { backgroundColor: '#14B8A6' },
  projectAccentRisk: { backgroundColor: '#dc2626' },
  projectAccentOnHold: { backgroundColor: '#f59e0b' },
  projectAccentPlanned: { backgroundColor: '#2563eb' },
  projectAccentCompleted: { backgroundColor: '#054653' },
  projectTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeBadge: {
    maxWidth: '70%',
    borderRadius: 6,
    backgroundColor: '#054653',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  projectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  projectMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  progressLabel: {
    marginTop: 10,
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  progressBarTrack: {
    marginTop: 6,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#14B8A6',
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    marginBottom: 10,
  },
  clientIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#14B8A6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  clientTextBlock: {
    flex: 1,
  },
  clientLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  clientName: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '600',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  timelineText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusPillOnTrack: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  statusPillRisk: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#374151',
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  budgetLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  budgetValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#054653',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'left',
    marginTop: 4,
  },
  taskCard: {
    width: '100%',
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  taskAccent: {
    width: 3,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    marginVertical: 8,
    backgroundColor: 'rgba(20, 184, 166, 0.65)',
  },
  taskContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  taskHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    paddingRight: 8,
  },
  taskPriorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f97316',
  },
  taskPriorityPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'capitalize',
  },
  taskPriorityHigh: {
    backgroundColor: '#f59e0b', // match web "warning" for high
  },
  taskPriorityCritical: {
    backgroundColor: '#dc2626', // match web "danger" for critical
  },
  taskPriorityMedium: {
    backgroundColor: '#0ea5e9', // match web "info" for medium
  },
  taskPriorityLow: {
    backgroundColor: '#6b7280', // neutral/secondary for low
  },
  taskMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  taskMeta: {
    fontSize: 12,
    color: '#4b5563',
    flex: 1,
  },
  taskMetaDue: {
    fontSize: 12,
    color: '#0f766e',
    fontWeight: '500',
  },
  activityCard: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewAllLink: {
    fontSize: 12,
    color: '#0f766e',
    fontWeight: '600',
  },
  quickCard: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#054653',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0f2fe',
    marginBottom: 6,
  },
  quickButton: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  quickButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#054653',
  },
});

