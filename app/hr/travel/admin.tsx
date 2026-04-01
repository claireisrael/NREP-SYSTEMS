import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import {
  activateTravelApprover,
  createTravelApprover,
  deactivateTravelApprover,
  deleteTravelApprover,
  getAllTravelApprovers,
  getEligibleTravelApprovers,
  listDepartments,
  updateTravelApprover,
} from '@/lib/hr/travelRequests';

export default function TravelAdminScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [level, setLevel] = useState<'L1' | 'L2'>('L1');
  const [saving, setSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hasAdminAccess = user?.systemRole === 'Senior Manager';

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!isLoading && user && !hasAdminAccess) {
      router.replace('/hr/travel');
    }
  }, [isLoading, user, hasAdminAccess, router]);

  const loadApprovers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [approverDocs, departmentDocs, users] = await Promise.all([
        getAllTravelApprovers(),
        listDepartments(),
        getEligibleTravelApprovers(),
      ]);
      setApprovers(approverDocs);
      setDepartments(departmentDocs);
      setEligibleUsers(users);
    } catch (e: any) {
      setError(e?.message || 'Failed to load travel approvers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user && hasAdminAccess) {
      loadApprovers();
    }
  }, [isLoading, user, hasAdminAccess, loadApprovers]);

  const metrics = useMemo(() => {
    const l1 = approvers.filter((a) => String(a.level || '').toUpperCase() === 'L1').length;
    const l2 = approvers.filter((a) => String(a.level || '').toUpperCase() === 'L2').length;
    const active = approvers.filter((a) => a.isActive !== false).length;
    return { l1, l2, active, total: approvers.length };
  }, [approvers]);

  const filteredApprovers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return approvers;
    return approvers.filter((a) =>
      [a.approverName, a.approverEmail, a.level]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [approvers, search]);

  const selectedUser = useMemo(
    () => eligibleUsers.find((u) => String(u.userId) === String(selectedUserId)),
    [eligibleUsers, selectedUserId]
  );

  const openCreate = () => {
    setEditing(null);
    setSelectedUserId('');
    setLevel('L1');
    setEditorOpen(true);
  };

  const openEdit = (a: any) => {
    setEditing(a);
    setSelectedUserId(String(a.userId || ''));
    setLevel(String(a.level || 'L1').toUpperCase() === 'L2' ? 'L2' : 'L1');
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditing(null);
    setSelectedUserId('');
    setLevel('L1');
  };

  const getDepartmentName = (departmentId?: string | null) => {
    if (!departmentId) return 'No Department';
    const d = departments.find((x) => String(x.$id) === String(departmentId));
    return d?.name || 'Unknown Department';
  };

  const saveApprover = async () => {
    if (!selectedUser && !editing) {
      Alert.alert('Validation', 'Select a staff member.');
      return;
    }
    try {
      setSaving(true);
      if (editing) {
        await updateTravelApprover(String(editing.$id), {
          level,
        });
      } else {
        const duplicate = approvers.find(
          (a) =>
            String(a.userId) === String(selectedUser?.userId) &&
            String(a.level).toUpperCase() === String(level).toUpperCase() &&
            a.isActive !== false
        );
        if (duplicate) {
          throw new Error(`${duplicate.approverName} is already an active ${level} approver.`);
        }
        await createTravelApprover({
          userId: String(selectedUser!.userId),
          level,
        });
      }
      closeEditor();
      await loadApprovers();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Could not save approver.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (a: any) => {
    const activate = a?.isActive === false;
    Alert.alert(
      activate ? 'Activate approver' : 'Deactivate approver',
      `Are you sure you want to ${activate ? 'activate' : 'deactivate'} ${a?.approverName || 'this approver'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: activate ? 'Activate' : 'Deactivate',
          style: activate ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (activate) await activateTravelApprover(String(a.$id));
              else await deactivateTravelApprover(String(a.$id));
              await loadApprovers();
            } catch (e: any) {
              Alert.alert('Action failed', e?.message || 'Unable to change approver status.');
            }
          },
        },
      ]
    );
  };

  const removeApprover = (a: any) => {
    setDeleteTarget(a);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.$id) return;
    try {
      setDeleting(true);
      await deleteTravelApprover(String(deleteTarget.$id));
      closeDeleteModal();
      await loadApprovers();
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Unable to delete approver.');
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading || !user) return null;
  if (!hasAdminAccess) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.replace('/hr/travel' as any)}>
            <MaterialCommunityIcons name="arrow-left" size={16} color="#054653" />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.headerCard}>
          <Text style={styles.title}>Travel Request Administration</Text>
          <Text style={styles.subtitle}>Manage travel approvers (Senior Manager)</Text>
        </View>

        <View style={styles.topBar}>
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={16} color="#6b7280" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search approvers..."
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
            />
          </View>
          <Pressable style={styles.newBtn} onPress={openCreate}>
            <MaterialCommunityIcons name="account-plus-outline" size={16} color="#ffffff" />
            <Text style={styles.newBtnText}>New Approver</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <Stat title="L1 Approvers" value={metrics.l1} />
          <Stat title="L2 Approvers" value={metrics.l2} />
          <Stat title="Active" value={metrics.active} />
          <Stat title="Total" value={metrics.total} />
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#054653" />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={loadApprovers} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.listCard}>
            {filteredApprovers.length === 0 ? (
              <Text style={styles.emptyText}>No travel approvers found.</Text>
            ) : (
              filteredApprovers.map((a) => (
                <View key={String(a.$id)} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{a.approverName || a.name || 'Approver'}</Text>
                    <Text style={styles.rowMeta}>
                      {a.approverEmail || a.email || 'No email'} {a.userId ? `• ${a.userId}` : ''} {'\n'}
                      {getDepartmentName(a.departmentId)}
                    </Text>
                  </View>
                  <View style={styles.tags}>
                    <View style={styles.levelTag}>
                      <Text style={styles.levelTagText}>{String(a.level || 'N/A')}</Text>
                    </View>
                    <View style={[styles.statusTag, a.isActive === false ? styles.statusOff : styles.statusOn]}>
                      <Text style={[styles.statusTagText, a.isActive === false ? styles.statusOffText : styles.statusOnText]}>
                        {a.isActive === false ? 'Inactive' : 'Active'}
                      </Text>
                    </View>
                    <Pressable style={styles.iconBtn} onPress={() => openEdit(a)}>
                      <MaterialCommunityIcons name="pencil-outline" size={14} color="#1d4ed8" />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => toggleStatus(a)}>
                      <MaterialCommunityIcons
                              name={a.isActive === false ? 'play-circle-outline' : 'pause-circle-outline'}
                        size={14}
                        color={a.isActive === false ? '#047857' : '#a16207'}
                      />
                    </Pressable>
                    <Pressable
                      style={[styles.iconBtn, styles.deleteIconBtn]}
                      onPress={() => removeApprover(a)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={14} color="#b91c1c" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={closeEditor}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditor} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Approver' : 'Add New Travel Approver'}</Text>

            <Text style={styles.label}>Staff Member *</Text>
            <ScrollView style={styles.selectList} nestedScrollEnabled>
              {eligibleUsers.map((u) => (
                <Pressable
                  key={String(u.userId)}
                  onPress={() => setSelectedUserId(String(u.userId))}
                  disabled={!!editing}
                  style={[
                    styles.selectItem,
                    selectedUserId === String(u.userId) && styles.selectItemActive,
                    editing && selectedUserId !== String(u.userId) && { opacity: 0.45 },
                  ]}
                >
                  <Text style={[styles.selectName, selectedUserId === String(u.userId) && styles.selectNameActive]}>
                    {u.name} ({u.systemRole || 'Staff'})
                  </Text>
                  <Text style={styles.selectMeta}>{u.email}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>Approval Level *</Text>
            <View style={styles.levelRow}>
              <Pressable onPress={() => setLevel('L1')} style={[styles.levelBtn, level === 'L1' && styles.levelBtnActive]}>
                <Text style={[styles.levelBtnText, level === 'L1' && styles.levelBtnTextActive]}>L1</Text>
              </Pressable>
              <Pressable onPress={() => setLevel('L2')} style={[styles.levelBtn, level === 'L2' && styles.levelBtnActive]}>
                <Text style={[styles.levelBtnText, level === 'L2' && styles.levelBtnTextActive]}>L2</Text>
              </Pressable>
            </View>

            {(selectedUser || editing) ? (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryText}>
                  {(selectedUser?.name || editing?.approverName || 'User')} will be an {level} approver.
                </Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable style={[styles.actionBtn, styles.actionBtnOutline]} onPress={closeEditor} disabled={saving}>
                <Text style={styles.actionBtnOutlineText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={saveApprover} disabled={saving}>
                {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.actionBtnPrimaryText}>{editing ? 'Update' : 'Add'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteModalOpen} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDeleteModal} />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#b91c1c" />
            </View>
            <Text style={styles.confirmTitle}>Delete travel approver?</Text>
            <Text style={styles.confirmText}>
              {`You are about to permanently delete ${deleteTarget?.approverName || 'this approver'}${
                deleteTarget?.level ? ` (${deleteTarget.level})` : ''
              }.`}
            </Text>
            <Text style={styles.confirmHint}>This action cannot be undone.</Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnOutline]}
                onPress={closeDeleteModal}
                disabled={deleting}
              >
                <Text style={styles.actionBtnOutlineText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.deleteBtnText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <HrBottomNav />
    </ThemedView>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { paddingHorizontal: 16, paddingBottom: 132 },
  headerRow: { marginBottom: 10 },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    height: 34,
  },
  backText: { color: '#054653', fontWeight: '700', fontSize: 12 },
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 14,
    marginBottom: 10,
  },
  title: { color: '#054653', fontSize: 18, fontWeight: '900' },
  subtitle: { marginTop: 4, color: '#6b7280', fontSize: 12 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    height: 40,
  },
  searchInput: { flex: 1, color: '#111827', fontSize: 13, paddingVertical: 0 },
  newBtn: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#054653',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  statCard: {
    minWidth: 74,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statValue: { color: '#054653', fontSize: 18, fontWeight: '900' },
  statTitle: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '700' },
  stateCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingVertical: 24,
    alignItems: 'center',
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  retryBtn: {
    borderRadius: 999,
    backgroundColor: '#054653',
    height: 32,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyText: { color: '#6b7280', fontSize: 12, paddingVertical: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  rowTitle: { color: '#111827', fontSize: 13, fontWeight: '700' },
  rowMeta: { marginTop: 2, color: '#6b7280', fontSize: 11 },
  tags: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIconBtn: {
    borderColor: '#fecaca',
    backgroundColor: '#fff5f5',
  },
  levelTag: {
    borderRadius: 999,
    paddingHorizontal: 9,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  levelTagText: { color: '#3730a3', fontSize: 10, fontWeight: '800' },
  statusTag: {
    borderRadius: 999,
    paddingHorizontal: 9,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOn: { backgroundColor: '#ecfdf5' },
  statusOff: { backgroundColor: '#fef2f2' },
  statusTagText: { fontSize: 10, fontWeight: '800' },
  statusOnText: { color: '#047857' },
  statusOffText: { color: '#b91c1c' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 14,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#ffffff',
    padding: 16,
  },
  confirmIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  confirmTitle: { color: '#7f1d1d', fontWeight: '900', fontSize: 16 },
  confirmText: { marginTop: 8, color: '#374151', fontSize: 13, lineHeight: 20 },
  confirmHint: { marginTop: 6, color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  modalTitle: { color: '#111827', fontWeight: '900', fontSize: 16, marginBottom: 10 },
  label: { color: '#374151', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 6 },
  selectList: {
    maxHeight: 180,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 6,
  },
  selectItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  selectItemActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  selectName: { color: '#111827', fontWeight: '700', fontSize: 12 },
  selectNameActive: { color: '#054653' },
  selectMeta: { marginTop: 2, color: '#6b7280', fontSize: 11 },
  levelRow: { flexDirection: 'row', gap: 8 },
  levelBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBtnActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  levelBtnText: { color: '#6b7280', fontWeight: '800', fontSize: 12 },
  levelBtnTextActive: { color: '#054653' },
  summaryCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    padding: 10,
  },
  summaryText: { color: '#1e3a8a', fontSize: 12, fontWeight: '600' },
  modalActions: { marginTop: 12, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionBtn: {
    minWidth: 96,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnOutline: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#ffffff' },
  actionBtnPrimary: { backgroundColor: '#054653' },
  actionBtnOutlineText: { color: '#374151', fontWeight: '800', fontSize: 12 },
  actionBtnPrimaryText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  deleteBtn: { backgroundColor: '#b91c1c' },
  deleteBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
});
