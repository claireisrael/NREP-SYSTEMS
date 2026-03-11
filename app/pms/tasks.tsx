import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { PmsBottomNav } from '@/components/PmsBottomNav';
import { PMS_COLLECTIONS, PMS_DB_ID, pmsDatabases, Query } from '@/lib/appwrite';
import { useAuth } from '@/context/AuthContext';

type Task = {
  $id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  estimatedHours?: number;
  projectId: string;
  projectName?: string;
};

type TaskScope = 'mine' | 'all';
type StatusFilter = 'all' | 'todo' | 'in_progress' | 'blocked' | 'done';

const statusLabels: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
};

export default function PmsTasksScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const isSupervisor = !!user?.isSupervisor && !user?.isAdmin;
  const isAdmin = !!user?.isAdmin;
  const canViewAll = isAdmin || isSupervisor;

  const accountId = user?.profile?.accountId || user?.authUser?.$id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<TaskScope>('mine');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const load = async () => {
      try {
        if (!accountId) {
          setTasks([]);
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        const constraints: any[] = [Query.orderAsc('dueDate'), Query.limit(300)];

        // "assignedTo" is an array attribute, so we must use Query.contains
        if (!(isAdmin || isSupervisor) || scope === 'mine') {
          constraints.unshift(Query.contains('assignedTo', accountId));
        }

        const tasksRes = await pmsDatabases.listDocuments(
          PMS_DB_ID,
          PMS_COLLECTIONS.TASKS,
          constraints,
        );

        const taskDocs = tasksRes.documents as any[];
        const projectIds = Array.from(
          new Set(taskDocs.map((t) => t.projectId).filter(Boolean)),
        ) as string[];

        let projectsMap: Record<string, string> = {};
        if (projectIds.length > 0) {
          const projectsRes = await pmsDatabases.listDocuments(
            PMS_DB_ID,
            PMS_COLLECTIONS.PROJECTS,
            [Query.equal('$id', projectIds), Query.limit(projectIds.length)],
          );
          projectsMap = (projectsRes.documents as any[]).reduce(
            (acc, p) => ({ ...acc, [p.$id]: p.name as string }),
            {},
          );
        }

        const mapped: Task[] = taskDocs.map((t) => ({
          $id: t.$id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          estimatedHours: t.estimatedHours,
          projectId: t.projectId,
          projectName: projectsMap[t.projectId] || undefined,
        }));

        setTasks(mapped);
      } catch (err: any) {
        console.error('Failed to load tasks', err);
        setError(err?.message || 'Failed to load tasks.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [accountId, isAdmin, isSupervisor, scope]);

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;

      if (!term) return true;

      const haystack =
        `${t.title || ''} ${t.projectName || ''}`
          .toLowerCase()
          .trim();

      return haystack.includes(term);
    });
  }, [tasks, search, statusFilter]);

  const statusCounts = useMemo(
    () => ({
      todo: filteredTasks.filter((t) => t.status === 'todo').length,
      in_progress: filteredTasks.filter((t) => t.status === 'in_progress').length,
      blocked: filteredTasks.filter((t) => t.status === 'blocked').length,
      done: filteredTasks.filter((t) => t.status === 'done').length,
    }),
    [filteredTasks],
  );

  const renderTask = ({ item }: { item: Task }) => {
    const lowered = (item.status || '').toLowerCase();
    const badgeStyles = [styles.taskStatusBadge];

    if (lowered === 'todo') {
      badgeStyles.push(styles.taskStatusTodo);
    } else if (lowered === 'in_progress') {
      badgeStyles.push(styles.taskStatusInProgress);
    } else if (lowered === 'blocked') {
      badgeStyles.push(styles.taskStatusBlocked);
    } else if (lowered === 'done') {
      badgeStyles.push(styles.taskStatusDone);
    }

    return (
      <Pressable
        style={styles.taskCard}
        onPress={() => router.push(`/pms/projects/${item.projectId}`)}
      >
        <View style={styles.taskHeaderRow}>
          <Text style={styles.taskTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={badgeStyles}>
            <Text style={styles.taskStatusText}>{statusLabels[lowered] || item.status}</Text>
          </View>
        </View>

        {item.projectName && (
          <View style={styles.taskProjectRow}>
            <MaterialCommunityIcons name="briefcase-outline" size={14} color="#6b7280" />
            <Text style={styles.taskProjectText} numberOfLines={1}>
              {item.projectName}
            </Text>
          </View>
        )}

        <View style={styles.taskMetaRow}>
          {item.dueDate && (
            <View style={styles.taskMetaItem}>
              <MaterialCommunityIcons name="calendar-month-outline" size={14} color="#6b7280" />
              <Text style={styles.taskMetaText}>
                {new Date(item.dueDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>
          )}
          {item.priority && (
            <View style={styles.taskMetaItem}>
              <MaterialCommunityIcons name="flag-outline" size={14} color="#6b7280" />
              <Text style={styles.taskMetaText}>{item.priority}</Text>
            </View>
          )}
          {typeof item.estimatedHours === 'number' && item.estimatedHours > 0 && (
            <View style={styles.taskMetaItem}>
              <MaterialCommunityIcons name="clock-outline" size={14} color="#6b7280" />
              <Text style={styles.taskMetaText}>{item.estimatedHours}h</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;

    const hasFilter = search || statusFilter !== 'all';

    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="clipboard-list-outline" size={40} color="#9ca3af" />
        <Text style={styles.emptyTitle}>
          {hasFilter ? 'No tasks found' : 'No tasks yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {hasFilter
            ? 'Try adjusting your search or status filter.'
            : 'Tasks assigned to you will appear here.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <View>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Tasks</Text>
            <Text style={styles.headerSubtitle}>
              {canViewAll && scope === 'all'
                ? 'All project tasks'
                : 'Tasks assigned to you'}
            </Text>
          </View>

          <View style={styles.scopeRow}>
            <Pressable
              onPress={() => setScope('mine')}
              style={[
                styles.scopeChip,
                scope === 'mine' && styles.scopeChipActive,
              ]}
            >
              <Text
                style={[
                  styles.scopeChipLabel,
                  scope === 'mine' && styles.scopeChipLabelActive,
                ]}
              >
                My Tasks
              </Text>
            </Pressable>

            {canViewAll && (
              <Pressable
                onPress={() => setScope('all')}
                style={[
                  styles.scopeChip,
                  scope === 'all' && styles.scopeChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.scopeChipLabel,
                    scope === 'all' && styles.scopeChipLabelActive,
                  ]}
                >
                  All Tasks
                </Text>
              </Pressable>
            )}
          </View>

          {/* Status summary row */}
          <View style={styles.statusSummaryRow}>
            <View style={[styles.statusSummaryCard, styles.statusSummaryTodo]}>
              <Text style={styles.statusSummaryLabel}>To Do</Text>
              <Text style={styles.statusSummaryValue}>{statusCounts.todo}</Text>
            </View>
            <View style={[styles.statusSummaryCard, styles.statusSummaryInProgress]}>
              <Text style={styles.statusSummaryLabel}>In Progress</Text>
              <Text style={styles.statusSummaryValue}>{statusCounts.in_progress}</Text>
            </View>
            <View style={[styles.statusSummaryCard, styles.statusSummaryBlocked]}>
              <Text style={styles.statusSummaryLabel}>Blocked</Text>
              <Text style={styles.statusSummaryValue}>{statusCounts.blocked}</Text>
            </View>
            <View style={[styles.statusSummaryCard, styles.statusSummaryDone]}>
              <Text style={styles.statusSummaryLabel}>Done</Text>
              <Text style={styles.statusSummaryValue}>{statusCounts.done}</Text>
            </View>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchCard}>
              <MaterialCommunityIcons name="magnify" size={20} color="#6b7280" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by title or project"
                placeholderTextColor="#9ca3af"
                style={styles.searchInput}
              />
            </View>

            <View style={styles.statusFiltersRow}>
              {(['all', 'todo', 'in_progress', 'blocked', 'done'] as StatusFilter[]).map(
                (s) => (
                  <Pressable
                    key={s}
                    onPress={() => setStatusFilter(s)}
                    style={[
                      styles.statusChip,
                      statusFilter === s && styles.statusChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipLabel,
                        statusFilter === s && styles.statusChipLabelActive,
                      ]}
                    >
                      {s === 'all'
                        ? 'All'
                        : s === 'todo'
                        ? 'To Do'
                        : s === 'in_progress'
                        ? 'In Progress'
                        : s === 'blocked'
                        ? 'Blocked'
                        : 'Done'}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          </View>

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#0f766e" />
              <Text style={styles.loadingText}>Loading tasks…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!error && (
            <FlatList
              data={filteredTasks}
              keyExtractor={(item) => item.$id}
              renderItem={renderTask}
              ListEmptyComponent={renderEmpty}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

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
    paddingTop: 20,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  headerRow: {
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#6b7280',
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  scopeChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  scopeChipLabel: {
    fontSize: 12,
    color: '#374151',
  },
  scopeChipLabelActive: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  searchRow: {
    marginBottom: 8,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
  },
  statusFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0f766e',
  },
  statusChipLabel: {
    fontSize: 11,
    color: '#4b5563',
  },
  statusChipLabelActive: {
    color: '#0f172a',
    fontWeight: '600',
  },
  statusSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  statusSummaryCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statusSummaryTodo: {
    backgroundColor: '#f1f5f9',
  },
  statusSummaryInProgress: {
    backgroundColor: '#ecfdf5',
  },
  statusSummaryBlocked: {
    backgroundColor: '#fee2e2',
  },
  statusSummaryDone: {
    backgroundColor: '#dcfce7',
  },
  statusSummaryLabel: {
    fontSize: 11,
    color: '#4b5563',
  },
  statusSummaryValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#4b5563',
  },
  errorBox: {
    marginTop: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  taskCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  taskHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  taskTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginRight: 8,
  },
  taskStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#e5e7eb',
  },
  taskStatusTodo: {
    backgroundColor: '#f1f5f9',
  },
  taskStatusInProgress: {
    backgroundColor: '#ecfdf5',
  },
  taskStatusBlocked: {
    backgroundColor: '#fee2e2',
  },
  taskStatusDone: {
    backgroundColor: '#dcfce7',
  },
  taskStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
  taskProjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  taskProjectText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#4b5563',
  },
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  taskMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskMetaText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#6b7280',
  },
  emptyState: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
});

