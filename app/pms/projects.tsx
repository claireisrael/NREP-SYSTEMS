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
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { PmsBottomNav } from '@/components/PmsBottomNav';
import { PMS_COLLECTIONS, PMS_DB_ID, pmsDatabases, Query } from '@/lib/appwrite';
import { useAuth } from '@/context/AuthContext';

type Project = {
  $id: string;
  name: string;
  code?: string;
  clientName?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  progress?: number;
  budgetAmount?: number;
  budgetCurrency?: string;
};

type StatusFilter = 'all' | 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';

const formatStatusLabel = (status?: string) => {
  if (!status) return '';
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export default function PmsProjectsScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProjects([]);
      setError('Please sign in to view projects.');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await pmsDatabases.listDocuments(
          PMS_DB_ID,
          PMS_COLLECTIONS.PROJECTS,
          [Query.orderDesc('$createdAt'), Query.limit(200)],
        );

        const docs = res.documents as any[];
        const mapped: Project[] = docs.map((p) => ({
          $id: p.$id,
          name: p.name,
          code: p.code,
          clientName: p.clientName,
          status: p.status,
          startDate: (p as any).startDate,
          endDate: (p as any).endDate,
          progress: typeof p.progress === 'number' ? p.progress : undefined,
          budgetAmount:
            typeof (p as any).budgetAmount === 'number' ? (p as any).budgetAmount : undefined,
          budgetCurrency: (p as any).budgetCurrency,
        }));

        setProjects(mapped);
      } catch (err: any) {
        console.error('Failed to load projects list', err);
        setError(err?.message || 'Failed to load projects.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, authLoading]);

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();

    return projects.filter((p) => {
      if (statusFilter !== 'all') {
        if (!p.status) return false;
        if (p.status !== statusFilter) return false;
      }

      if (!term) return true;

      const haystack =
        `${p.name || ''} ${p.clientName || ''}`
          .toLowerCase()
          .trim();

      return haystack.includes(term);
    });
  }, [projects, search, statusFilter]);

  const renderProject = ({ item }: { item: Project }) => {
    const status = item.status;
    const start = item.startDate ? new Date(item.startDate) : null;
    const end = item.endDate ? new Date(item.endDate) : null;

    const lowered = (status || '').toLowerCase();
    const statusStyles = [styles.statusPill];

    if (lowered === 'active' || lowered === 'in_progress' || lowered === 'planned') {
      statusStyles.push(styles.statusPillActive);
    } else if (lowered === 'completed' || lowered === 'done' || lowered === 'cancelled') {
      statusStyles.push(styles.statusPillCompleted);
    } else if (lowered === 'on_hold') {
      statusStyles.push(styles.statusPillOnHold);
    } else if (lowered === 'at_risk' || lowered === 'blocked') {
      statusStyles.push(styles.statusPillRisk);
    }

    let dateLabel: string | null = null;
    if (start && end) {
      dateLabel = `${start.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })} - ${end.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })}`;
    } else if (start) {
      dateLabel = start.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } else if (end) {
      dateLabel = end.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }

    const showBudget = typeof item.budgetAmount === 'number' && item.budgetAmount > 0;
    const budgetCurrency = item.budgetCurrency || 'USD';
    const budgetValue =
      showBudget
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: budgetCurrency,
            maximumFractionDigits: 0,
          }).format(item.budgetAmount || 0)
        : null;

    return (
      <Pressable
        onPress={() => router.push(`/pms/projects/${item.$id}`)}
        style={styles.projectCard}
      >
        <View style={styles.projectTopRow}>
          {item.code && (
            <View style={styles.codeBadge}>
              <Text style={styles.codeBadgeText} numberOfLines={1}>
                {item.code}
              </Text>
            </View>
          )}
          {status && (
            <View style={statusStyles}>
              <Text style={styles.statusPillText}>{formatStatusLabel(status)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.projectName} numberOfLines={2}>
          {item.name}
        </Text>

        {item.clientName && (
          <View style={styles.clientCard}>
            <View style={styles.clientIcon}>
              <MaterialCommunityIcons name="briefcase-outline" size={16} color="#ffffff" />
            </View>
            <View style={styles.clientTextBlock}>
              <Text style={styles.clientLabel}>Client</Text>
              <Text style={styles.clientName} numberOfLines={1}>
                {item.clientName}
              </Text>
            </View>
          </View>
        )}

        {dateLabel && (
          <View style={styles.timelineRow}>
            <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#6b7280" />
            <Text style={styles.timelineText}>{dateLabel}</Text>
          </View>
        )}

        {showBudget && budgetValue && (
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Budget</Text>
            <Text style={styles.budgetValue}>{budgetValue}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="folder-outline" size={40} color="#9ca3af" />
        <Text style={styles.emptyTitle}>No projects found</Text>
        <Text style={styles.emptySubtitle}>Try adjusting your filters or search term.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <View>
          <View style={styles.headerCard}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons name="folder-multiple-outline" size={20} color="#054653" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Projects</Text>
                <Text style={styles.headerSubtitle}>
                  Browse all projects you can access.
                </Text>
              </View>
              <View style={styles.headerCountPill}>
                <Text style={styles.headerCountText}>{filteredProjects.length}</Text>
              </View>
            </View>
          </View>

          <View style={styles.searchCard}>
            <MaterialCommunityIcons name="magnify" size={20} color="#6b7280" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search projects"
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
            />
          </View>

          <View style={styles.filtersRow}>
            {(['all', 'planned', 'active', 'on_hold', 'completed', 'cancelled'] as StatusFilter[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setStatusFilter(f)}
                style={[
                  styles.filterChip,
                  statusFilter === f && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipLabel,
                    statusFilter === f && styles.filterChipLabelActive,
                  ]}
                >
                  {f === 'all'
                    ? 'All'
                    : f === 'planned'
                    ? 'Planned'
                    : f === 'active'
                    ? 'Active'
                    : f === 'on_hold'
                    ? 'On Hold'
                    : f === 'completed'
                    ? 'Completed'
                    : 'Cancelled'}
                </Text>
              </Pressable>
            ))}
          </View>

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#0f766e" />
              <Text style={styles.loadingText}>Loading projects…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!error && (
            <FlatList
              contentContainerStyle={styles.listContent}
              data={filteredProjects}
              keyExtractor={(item) => item.$id}
              renderItem={renderProject}
              ListEmptyComponent={renderEmpty}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#054653',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  headerCountPill: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#054653',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerCountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterChipActive: {
    backgroundColor: '#054653',
    borderColor: '#054653',
  },
  filterChipLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
  },
  filterChipLabelActive: {
    color: '#ffffff',
    fontWeight: '900',
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
  projectCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
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
  statusPillActive: {
    backgroundColor: '#dcfce7',
  },
  statusPillCompleted: {
    backgroundColor: '#e5e7eb',
  },
  statusPillOnHold: {
    backgroundColor: '#fef9c3',
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
  emptyState: {
    marginTop: 32,
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

