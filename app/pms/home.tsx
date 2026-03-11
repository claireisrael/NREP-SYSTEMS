import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PMS_COLLECTIONS, PMS_DB_ID, pmsDatabases, Query } from '@/lib/appwrite';
import { useAuth } from '@/context/AuthContext';
import { PmsBottomNav } from '@/components/PmsBottomNav';

const PMS_WEB_BASE_URL = 'https://projects.nrep.ug';

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

type StatusFilter = 'all' | 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';

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
            const url = `${PMS_WEB_BASE_URL}/api/timesheets/dashboard?accountId=${encodeURIComponent(
              accountId,
            )}&organizationId=${encodeURIComponent(user.organizationId)}`;
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

  const displayName =
    user?.profile?.firstName || user?.profile?.username || user?.profile?.email || 'User';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeLeft}>
            <Text style={styles.welcomeLabel}>
              {getGreeting()},{' '}
              <Text style={styles.welcomeNameInline}>{displayName}</Text>!
            </Text>
            <Text style={styles.welcomeRole}>{roleLabel}</Text>
            <Text style={styles.welcomeDate}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
          {!isAdmin && !isSupervisor && (
            <View style={styles.welcomeRight}>
              <Pressable
                style={styles.logTimeButton}
                onPress={() => router.push('/pms/timesheets/my')}
              >
                <Text style={styles.logTimeText}>Log Time</Text>
              </Pressable>
            </View>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Dashboard metric cards */}
          {!loading && !error && stats && (
            <>
              {isAdmin || isSupervisor ? (
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
                <View style={styles.statsRow}>
                  <View style={styles.statsCard}>
                    <Text style={styles.statsLabel}>Weekly Hours</Text>
                    <Text style={styles.statsValue}>
                      {(stats.weeklyHours ?? 0).toFixed(1)}h
                    </Text>
                    <Text style={styles.statsSubLabel}>Current Week</Text>
                  </View>
                  <View style={styles.statsCard}>
                    <Text style={styles.statsLabel}>Open Tasks</Text>
                    <Text style={styles.statsValue}>{stats.myOpenTasks ?? 0}</Text>
                  </View>
                  <View style={styles.statsCard}>
                    <Text style={styles.statsLabel}>My Projects</Text>
                    <Text style={styles.statsValue}>
                      {stats.myProjects ?? stats.totalProjects}
                    </Text>
                  </View>
                </View>
              )}
            </>
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
                  <Text style={styles.sectionTitle}>
                    {isSupervisor || isAdmin ? 'Team Projects' : 'My Projects'}
                  </Text>
                </View>

                <FlatList
                  data={projects}
                  keyExtractor={(item) => item.$id}
                  scrollEnabled
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
                            <Text style={styles.statusPillText}>
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
                  )}
                />
              </View>
            ) : (
              <View>
                {/* Staff: My Active Projects + Activity Schedule + Upcoming Tasks */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>My Active Projects</Text>
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
                            <Text style={styles.statusPillText}>
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
                  <Text style={styles.sectionTitle}>Activity Schedule</Text>
                  <Text style={styles.emptyText}>No upcoming milestones.</Text>
                </View>

                {/* Upcoming Tasks */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Upcoming Tasks</Text>
                </View>
                {upcomingTasks.length === 0 ? (
                  <Text style={styles.emptyText}>No upcoming tasks.</Text>
                ) : (
                  upcomingTasks.map((item) => (
                    <View key={item.$id} style={styles.taskCard}>
                      <View style={styles.taskHeaderRow}>
                        <Text style={styles.taskTitle}>{item.title}</Text>
                        {item.priority && (
                          <Text
                            style={[
                              styles.taskPriority,
                              item.priority === 'high' && styles.taskPriorityHigh,
                              item.priority === 'medium' && styles.taskPriorityMedium,
                            ]}
                          >
                            {item.priority}
                          </Text>
                        )}
                      </View>
                      {item.projectName && (
                        <Text style={styles.taskMeta}>Project: {item.projectName}</Text>
                      )}
                      {item.dueDate && (
                        <Text style={styles.taskMeta}>
                          Due{' '}
                          {new Date(item.dueDate).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      )}
                    </View>
                  ))
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
    backgroundColor: '#f3f4f6',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 16,
    backgroundColor: '#f3f4f6',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
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
    justifyContent: 'space-between',
    backgroundColor: '#14B8A6',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  welcomeLeft: {
    flex: 1,
  },
  welcomeLabel: {
    color: '#e0f2fe',
    fontSize: 16,
  },
  welcomeNameInline: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  welcomeRole: {
    marginTop: 4,
    color: '#e0f2fe',
    fontSize: 12,
    opacity: 0.9,
  },
  welcomeDate: {
    marginTop: 8,
    color: '#e0f2fe',
    fontSize: 12,
    opacity: 0.85,
  },
  welcomeRight: {
    marginLeft: 12,
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
    marginTop: 12,
    marginBottom: 6,
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
  },
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
    backgroundColor: '#e5e7eb',
  },
  statusPillOnTrack: {
    backgroundColor: '#dcfce7',
  },
  statusPillRisk: {
    backgroundColor: '#fee2e2',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#064e3b',
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
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
  },
  taskPriority: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f97316',
    textTransform: 'lowercase',
  },
  taskPriorityHigh: {
    color: '#b91c1c',
  },
  taskPriorityMedium: {
    color: '#ea580c',
  },
  taskMeta: {
    fontSize: 12,
    color: '#4b5563',
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

