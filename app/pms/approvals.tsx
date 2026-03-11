import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PmsBottomNav } from '@/components/PmsBottomNav';
import { useAuth } from '@/context/AuthContext';

const PMS_WEB_BASE_URL = 'https://projects.nrep.ug';

export default function PmsApprovalsScreen() {
  const { user } = useAuth();

  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'submitted' | 'approved' | 'rejected' | ''>(
    'submitted',
  );
  const [searchQuery, setSearchQuery] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedTimesheet, setSelectedTimesheet] = useState<any | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approvalComments, setApprovalComments] = useState('');
  const [rejectionComments, setRejectionComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSeeApprovals = user?.isAdmin || user?.isSupervisor || user?.isFinance;

  useEffect(() => {
    if (!user?.organizationId || !user?.authUser?.$id || !canSeeApprovals) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          organizationId: user.organizationId,
          requesterId: user.authUser.$id,
          page: String(page),
          limit: '20',
        });

        if (statusFilter) {
          params.append('status', statusFilter);
        }

        const url = `${PMS_WEB_BASE_URL}/api/timesheets/approvals?${params.toString()}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data?.error ||
              'Failed to load timesheets. Only admins, managers and supervisors can view approvals.',
          );
        }

        setTimesheets(data.timesheets || []);
        if (data.totalPages) {
          setTotalPages(data.totalPages);
        } else {
          setTotalPages(1);
        }
      } catch (err: any) {
        console.error('Failed to load approvals', err);
        setError(err?.message || 'Failed to load timesheets for approval.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.organizationId, user?.authUser?.$id, statusFilter, page, canSeeApprovals]);

  const filteredTimesheets = useMemo(() => {
    if (!searchQuery) return timesheets;
    const query = searchQuery.toLowerCase();
    return timesheets.filter((ts) => {
      const userName = `${ts.user?.firstName || ''} ${ts.user?.lastName || ''}`.toLowerCase();
      const username = (ts.user?.username || '').toLowerCase();
      const projects =
        ts.summary?.projects?.map((p: any) => p.name?.toLowerCase() || '').join(' ') || '';
      return (
        userName.includes(query) ||
        username.includes(query) ||
        projects.includes(query) ||
        (ts.weekStart || '').toLowerCase().includes(query)
      );
    });
  }, [timesheets, searchQuery]);

  const getStatusPill = (ts: any) => {
    const status = ts.status;
    const stage = ts.approvalStage; // supervisor, admin, completed, rejected, unknown

    let label = 'Draft';
    let bg = '#e5e7eb';
    let color = '#111827';

    if (status === 'rejected') {
      label = 'Rejected';
      bg = '#fee2e2';
      color = '#b91c1c';
    } else if (status === 'approved') {
      label = 'Approved';
      bg = '#dcfce7';
      color = '#166534';
    } else if (status === 'submitted') {
      if (stage === 'supervisor') {
        label = 'Pending Supervisor';
        bg = '#e0f2fe';
        color = '#0369a1';
      } else if (stage === 'admin') {
        label = 'Pending Admin';
        bg = '#fef9c3';
        color = '#854d0e';
      } else {
        label = 'Submitted';
        bg = '#e5e7eb';
        color = '#111827';
      }
    }

    return (
      <View style={[styles.statusPill, { backgroundColor: bg }]}>
        <Text style={[styles.statusPillText, { color }]}>{label}</Text>
      </View>
    );
  };

  const weekLabel = (ts: any) => {
    if (!ts.weekStart) return '-';
    const d = new Date(ts.weekStart);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleOpenApprove = (ts: any) => {
    setSelectedTimesheet(ts);
    setApprovalComments('');
    setShowApproveModal(true);
  };

  const handleOpenReject = (ts: any) => {
    setSelectedTimesheet(ts);
    setRejectionComments('');
    setShowRejectModal(true);
  };

  const submitAction = async (action: 'approve' | 'reject') => {
    if (!selectedTimesheet || !user?.authUser?.$id) return;

    const comments = action === 'approve' ? approvalComments : rejectionComments;
    if (!comments.trim()) {
      Alert.alert('Comments required', 'Please provide comments before proceeding.');
      return;
    }

    try {
      setSubmitting(true);

      const url = `${PMS_WEB_BASE_URL}/api/timesheets`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timesheetId: selectedTimesheet.$id,
          action,
          managerId: user.authUser.$id,
          approvalComments: action === 'approve' ? comments : undefined,
          rejectionComments: action === 'reject' ? comments : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || `Failed to ${action} timesheet`);
      }

      Alert.alert(
        'Success',
        action === 'approve'
          ? 'Timesheet approved successfully.'
          : 'Timesheet rejected with feedback.',
      );

      // Refresh list
      const updated = timesheets.map((t) =>
        t.$id === selectedTimesheet.$id ? { ...t, status: data.timesheet?.status || t.status } : t,
      );
      setTimesheets(updated);
      setShowApproveModal(false);
      setShowRejectModal(false);
      setSelectedTimesheet(null);
    } catch (err: any) {
      console.error('Failed to submit action', err);
      Alert.alert('Error', err?.message || 'Failed to update timesheet.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>Timesheet Approvals</Text>
              <Text style={styles.headerSubtitleSmall}>
                Review and approve team member timesheets.
              </Text>
            </View>
          </View>

          {!canSeeApprovals && (
            <View style={styles.errorCard}>
              <MaterialCommunityIcons
                name="shield-alert-outline"
                size={18}
                color="#b91c1c"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.errorText}>
                Only administrators, project managers, and supervisors can access approvals.
              </Text>
            </View>
          )}

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color="#0f766e" />
              <Text style={styles.loadingText}>Loading timesheets…</Text>
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

          {!loading && !error && canSeeApprovals && (
            <>
              {/* Filters */}
              <View style={styles.filtersCard}>
                <View style={styles.searchRow}>
                  <MaterialCommunityIcons
                    name="magnify"
                    size={18}
                    color="#9ca3af"
                    style={styles.searchIcon}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or project"
                    placeholderTextColor="#9ca3af"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterChipsRow}
                >
                  {[
                    { key: 'submitted', label: 'Pending' },
                    { key: 'approved', label: 'Approved' },
                    { key: 'rejected', label: 'Rejected' },
                    { key: '', label: 'All' },
                  ].map((opt) => {
                    const active = statusFilter === opt.key;
                    return (
                      <Pressable
                        key={opt.key || 'all'}
                        style={[
                          styles.filterChip,
                          active && styles.filterChipActive,
                        ]}
                        onPress={() => {
                          setStatusFilter(opt.key as any);
                          setPage(1);
                        }}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            active && styles.filterChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* List */}
              {filteredTimesheets.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name="inbox-outline"
                    size={40}
                    color="#d1d5db"
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.emptyTitle}>No Timesheets Found</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery
                      ? 'No timesheets match your search.'
                      : statusFilter === 'submitted'
                      ? 'No timesheets pending approval.'
                      : 'No timesheets match the selected filter.'}
                  </Text>
                </View>
              ) : (
                filteredTimesheets.map((ts) => {
                  const canApprove = ts.canApprove && ts.status === 'submitted';
                  const start = weekLabel(ts);
                  const totalHours = ts.summary?.totalHours ?? 0;
                  const billableHours = ts.summary?.billableHours ?? 0;
                  const nonBillableHours = ts.summary?.nonBillableHours ?? 0;
                  const projects = ts.summary?.projects || [];

                  return (
                    <View key={ts.$id} style={styles.card}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.employeeBlock}>
                          <Text style={styles.employeeName}>
                            {ts.user?.firstName} {ts.user?.lastName}
                          </Text>
                          <Text style={styles.employeeMeta}>
                            @{ts.user?.username}{' '}
                            {ts.user?.title ? `· ${ts.user.title}` : ''}
                          </Text>
                        </View>
                        {getStatusPill(ts)}
                      </View>

                      <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                          <Text style={styles.summaryLabel}>Week</Text>
                          <Text style={styles.summaryValue}>{start}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                          <Text style={styles.summaryLabel}>Total Hours</Text>
                          <Text style={styles.summaryValue}>{totalHours}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                          <Text style={styles.summaryLabel}>Billable</Text>
                          <Text style={styles.summaryValue}>{billableHours}</Text>
                          {nonBillableHours > 0 && (
                            <Text style={styles.summarySmall}>
                              {nonBillableHours} non-billable
                            </Text>
                          )}
                        </View>
                      </View>

                      {projects.length > 0 && (
                        <View style={styles.projectsRow}>
                          {projects.slice(0, 3).map((p: any, idx: number) => (
                            <View key={idx} style={styles.projectChip}>
                              <Text style={styles.projectChipText}>
                                {p.code || p.name}
                              </Text>
                            </View>
                          ))}
                          {projects.length > 3 && (
                            <View style={styles.projectChipMore}>
                              <Text style={styles.projectChipMoreText}>
                                +{projects.length - 3} more
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      <View style={styles.cardFooterRow}>
                        <Text style={styles.submittedText}>
                          Submitted:{' '}
                          {ts.submittedAt
                            ? new Date(ts.submittedAt).toLocaleDateString()
                            : '-'}
                        </Text>

                        {canApprove && (
                          <View style={styles.actionsRow}>
                            <Pressable
                              style={styles.rejectButton}
                              onPress={() => handleOpenReject(ts)}
                              disabled={submitting}
                            >
                              <Text style={styles.rejectButtonText}>Reject</Text>
                            </Pressable>
                            <Pressable
                              style={styles.approveButton}
                              onPress={() => handleOpenApprove(ts)}
                              disabled={submitting}
                            >
                              <Text style={styles.approveButtonText}>Approve</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}

              {totalPages > 1 && (
                <View style={styles.paginationRow}>
                  <Pressable
                    style={[
                      styles.pageButton,
                      page <= 1 && styles.pageButtonDisabled,
                    ]}
                    onPress={() => page > 1 && setPage(page - 1)}
                    disabled={page <= 1}
                  >
                    <Text
                      style={[
                        styles.pageButtonText,
                        page <= 1 && styles.pageButtonTextDisabled,
                      ]}
                    >
                      Previous
                    </Text>
                  </Pressable>
                  <Text style={styles.pageLabel}>
                    Page {page} of {totalPages}
                  </Text>
                  <Pressable
                    style={[
                      styles.pageButton,
                      page >= totalPages && styles.pageButtonDisabled,
                    ]}
                    onPress={() => page < totalPages && setPage(page + 1)}
                    disabled={page >= totalPages}
                  >
                    <Text
                      style={[
                        styles.pageButtonText,
                        page >= totalPages && styles.pageButtonTextDisabled,
                      ]}
                    >
                      Next
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Approve modal */}
        <Modal
          transparent
          visible={showApproveModal}
          animationType="fade"
          onRequestClose={() => !submitting && setShowApproveModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Approve Timesheet</Text>
              <Text style={styles.modalSubtitle}>
                Add a short approval comment for this timesheet.
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Approval comments"
                placeholderTextColor="#9ca3af"
                value={approvalComments}
                onChangeText={setApprovalComments}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.modalButtonsRow}>
                <Pressable
                  style={styles.modalCancelButton}
                  disabled={submitting}
                  onPress={() => setShowApproveModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.modalPrimaryButton}
                  disabled={submitting}
                  onPress={() => submitAction('approve')}
                >
                  <Text style={styles.modalPrimaryText}>
                    {submitting ? 'Approving…' : 'Approve'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Reject modal */}
        <Modal
          transparent
          visible={showRejectModal}
          animationType="fade"
          onRequestClose={() => !submitting && setShowRejectModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Reject Timesheet</Text>
              <Text style={styles.modalSubtitle}>
                Provide feedback so the staff member can correct and resubmit.
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Rejection comments"
                placeholderTextColor="#9ca3af"
                value={rejectionComments}
                onChangeText={setRejectionComments}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.modalButtonsRow}>
                <Pressable
                  style={styles.modalCancelButton}
                  disabled={submitting}
                  onPress={() => setShowRejectModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.modalDangerButton}
                  disabled={submitting}
                  onPress={() => submitAction('reject')}
                >
                  <Text style={styles.modalDangerText}>
                    {submitting ? 'Rejecting…' : 'Reject'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

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
    marginBottom: 12,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitleSmall: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
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
  filtersCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  filterChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  filterChipText: {
    fontSize: 12,
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  employeeBlock: {
    flex: 1,
    marginRight: 8,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  employeeMeta: {
    fontSize: 11,
    color: '#6b7280',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
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
  summarySmall: {
    fontSize: 10,
    color: '#6b7280',
  },
  projectsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  projectChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  projectChipText: {
    fontSize: 11,
    color: '#111827',
  },
  projectChipMore: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  projectChipMoreText: {
    fontSize: 11,
    color: '#1d4ed8',
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  submittedText: {
    fontSize: 11,
    color: '#6b7280',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  approveButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#16a34a',
  },
  approveButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  rejectButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },
  rejectButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b91c1c',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  pageButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  pageButtonDisabled: {
    backgroundColor: '#f9fafb',
  },
  pageButtonText: {
    fontSize: 12,
    color: '#111827',
  },
  pageButtonTextDisabled: {
    color: '#9ca3af',
  },
  pageLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 10,
  },
  modalInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 80,
    fontSize: 13,
    color: '#111827',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  modalCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  modalCancelText: {
    fontSize: 12,
    color: '#374151',
  },
  modalPrimaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#16a34a',
  },
  modalPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalDangerButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#b91c1c',
  },
  modalDangerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});

