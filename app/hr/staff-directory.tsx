import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import { HR_COLLECTIONS, HR_DB_ID, ID, Query, hrAccount, hrDatabases } from '@/lib/appwrite';

export default function HrStaffDirectoryScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const canAddStaff = String(user?.systemRole || '').toLowerCase() === 'senior manager';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'full' | 'associate'>('all');
  const [staff, setStaff] = useState<any[]>([]);
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0); // 0-based
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [viewTarget, setViewTarget] = useState<any | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editRole, setEditRole] = useState('None');
  const [editCategory, setEditCategory] = useState('Associate');
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addStep, setAddStep] = useState(1);
  const [addError, setAddError] = useState<string | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    password: '',
    phoneNumber: '',
    staffCategory: 'Associate',
    staffRole: '',
    systemRole: 'None',
    departmentId: '',
    supervisorId: '',
  });

  const loadStaff = useCallback(async () => {
    if (!user?.$id) return;
    try {
      setError(null);
      setLoading(true);
      const [usersRes, deptRes, roleRes] = await Promise.all([
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [
          Query.orderAsc('name'),
          Query.limit(PAGE_SIZE),
          Query.offset(0),
        ]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.DEPARTMENTS, [Query.orderAsc('name'), Query.limit(300)]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.ROLES, [Query.limit(500)]),
      ]);
      const docs = ((usersRes as any)?.documents ?? []) as any[];
      setTotal((usersRes as any)?.total ?? docs.length);
      setPage(0);
      setDepartments(((deptRes as any)?.documents ?? []) as any[]);
      const filtered = docs.filter((u) => !!u?.name || !!u?.email);
      setStaff(filtered);
      setRoles(((roleRes as any)?.documents ?? []) as any[]);
      setSupervisors(filtered.filter((u) => String(u.staffCategory || '') === 'Full-Staff' && String(u.systemRole || '') !== 'None'));
    } catch (e: any) {
      setError(e?.message || 'Failed to load staff directory.');
    } finally {
      setLoading(false);
    }
  }, [PAGE_SIZE, user?.$id]);

  const hasMore = useMemo(() => {
    if (total === null) return false;
    return staff.length < total;
  }, [staff.length, total]);

  const loadMore = useCallback(async () => {
    if (!user?.$id) return;
    if (loadingMore) return;
    if (total !== null && staff.length >= total) return;
    try {
      setLoadingMore(true);
      setError(null);
      const nextPage = page + 1;
      const usersRes = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [
        Query.orderAsc('name'),
        Query.limit(PAGE_SIZE),
        Query.offset(nextPage * PAGE_SIZE),
      ]);
      const docs = ((usersRes as any)?.documents ?? []) as any[];
      const filtered = docs.filter((u) => !!u?.name || !!u?.email);
      setTotal((usersRes as any)?.total ?? total ?? filtered.length);
      setPage(nextPage);
      setStaff((prev) => [...prev, ...filtered]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load more staff.');
    } finally {
      setLoadingMore(false);
    }
  }, [PAGE_SIZE, loadingMore, page, staff.length, total, user?.$id]);

  useEffect(() => {
    if (!isLoading && user?.$id) loadStaff();
  }, [isLoading, user?.$id, loadStaff]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStaff();
    setRefreshing(false);
  }, [loadStaff]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((u) => {
      const category = String(u?.staffCategory || '').toLowerCase();
      const matchesCategory =
        categoryFilter === 'all'
          ? true
          : categoryFilter === 'full'
            ? category === 'full-staff' || category === 'full staff'
            : category === 'associate' || !category;

      if (!matchesCategory) return false;
      if (!q) return true;

      return [u.name, u.email, u.userId, u.systemRole, u.staffCategory]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [search, staff, categoryFilter]);

  const isSeniorManager = String(user?.systemRole || '').toLowerCase() === 'senior manager';
  const canManageStaff = isSeniorManager || String(user?.systemRole || '').toLowerCase() === 'supervisor';

  const canEditRow = useCallback(
    (row: any) => {
      if (isSeniorManager) return true;
      if (!canManageStaff) return false;
      return String(row?.supervisorId || '') === String(user?.userId || '') || String(row?.userId || '') === String(user?.userId || '');
    },
    [canManageStaff, isSeniorManager, user?.userId]
  );

  const openEdit = (row: any) => {
    setEditTarget(row);
    setEditRole(String(row?.systemRole || 'None'));
    setEditCategory(String(row?.staffCategory || 'Associate'));
  };

  const saveEdit = async () => {
    if (!editTarget?.$id) return;
    try {
      setEditBusy(true);
      await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.USERS, String(editTarget.$id), {
        systemRole: editRole,
        staffCategory: editCategory,
      } as any);
      setEditTarget(null);
      await loadStaff();
    } catch (e: any) {
      Alert.alert('Update failed', e?.message || 'Unable to update staff profile.');
    } finally {
      setEditBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.$id) return;
    try {
      setDeleteBusy(true);
      await hrDatabases.deleteDocument(HR_DB_ID, HR_COLLECTIONS.USERS, String(deleteTarget.$id));
      setDeleteTarget(null);
      await loadStaff();
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Unable to delete staff member.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const filteredRoles = useMemo(
    () => {
      const sample = roles.find((r) => r && typeof r === 'object') as any;
      const candidates = ['type', 'kind', 'roleType', 'category'];
      const kindKey = sample ? (candidates.find((k) => k in sample) || null) : null;
      const positionsOnly = roles.filter((r) => {
        if (!kindKey) return true;
        const k = String((r as any)?.[kindKey] ?? '').trim().toLowerCase();
        // Staff uses "Position" — show positions, and treat missing kind as legacy positions.
        if (!k) return true;
        return k === 'position';
      });
      return positionsOnly.filter(
        (r) => String(r.staffCategory || '') === String(newStaff.staffCategory || 'Associate')
      );
    },
    [roles, newStaff.staffCategory]
  );

  const resetNewStaff = () => {
    setNewStaff({
      name: '',
      email: '',
      password: '',
      phoneNumber: '',
      staffCategory: 'Associate',
      staffRole: '',
      systemRole: 'None',
      departmentId: '',
      supervisorId: '',
    });
    setAddStep(1);
    setAddError(null);
  };

  const validateAddStep = (step: number) => {
    if (step === 1) {
      if (!newStaff.name.trim() || !newStaff.email.trim() || !newStaff.password.trim()) {
        setAddError('Step 1 requires full name, email, and password.');
        return false;
      }
      if (newStaff.password.length < 8) {
        setAddError('Step 1 password must be at least 8 characters.');
        return false;
      }
    }
    setAddError(null);
    return true;
  };

  const createStaff = async () => {
    if (!validateAddStep(1)) {
      return;
    }
    try {
      setAddBusy(true);
      const account = await hrAccount.create(ID.unique(), newStaff.email.trim(), newStaff.password, newStaff.name.trim());
      const userId = String((account as any)?.$id || '');
      const supervisorId = newStaff.systemRole === 'Senior Manager' ? null : (newStaff.supervisorId || null);

      await hrDatabases.createDocument(HR_DB_ID, HR_COLLECTIONS.USERS, ID.unique(), {
        userId,
        name: newStaff.name.trim(),
        email: newStaff.email.trim(),
        staffCategory: newStaff.staffCategory || 'Associate',
        staffRole: newStaff.staffRole || null,
        systemRole: newStaff.staffCategory === 'Full-Staff' ? (newStaff.systemRole || 'None') : 'None',
        departmentId: newStaff.departmentId || null,
        supervisorId,
        phoneNumber: newStaff.phoneNumber || null,
        hireDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);

      setAddOpen(false);
      resetNewStaff();
      await loadStaff();
      Alert.alert('Success', 'Staff member added successfully.');
    } catch (e: any) {
      Alert.alert('Create failed', e?.message || 'Unable to add staff member.');
    } finally {
      setAddBusy(false);
    }
  };

  const getDeptName = (departmentId?: string | null) => {
    if (!departmentId) return 'None';
    const d = departments.find((x) => String(x.$id) === String(departmentId));
    return d?.name || 'Unknown Department';
  };

  if (isLoading || !user) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#054653" />}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="account-group-outline" size={18} color="#054653" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Staff Directory</Text>
              <Text style={styles.subtitle}>Browse staff profiles and roles</Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{rows.length}</Text>
            </View>
          </View>
          {canAddStaff ? (
            <View style={styles.headerActionRow}>
              <Pressable style={styles.addStaffBtn} onPress={() => setAddOpen(true)}>
                <MaterialCommunityIcons name="account-plus-outline" size={16} color="#ffffff" />
                <Text style={styles.addStaffBtnText}>Add Staff</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.searchCard}>
          <MaterialCommunityIcons name="magnify" size={16} color="#6b7280" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, email, role..."
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={16} color="#9ca3af" />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterRow}>
          <FilterChip label="All" active={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
          <FilterChip label="Full Staff" active={categoryFilter === 'full'} onPress={() => setCategoryFilter('full')} />
          <FilterChip
            label="Associates"
            active={categoryFilter === 'associate'}
            onPress={() => setCategoryFilter('associate')}
          />
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#054653" />
            <Text style={styles.stateText}>Loading staff directory...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={loadStaff}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.listCard}>
            {rows.length === 0 ? (
              <Text style={styles.emptyText}>No staff found.</Text>
            ) : (
              rows.map((u) => (
                <View key={String(u.$id || u.userId)} style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{String(u.name || 'U').trim().charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{u.name || 'Unknown user'}</Text>
                    <Text style={styles.meta}>{u.email || 'No email'}</Text>
                    <Text style={styles.meta}>
                      {u.systemRole || 'Staff'}
                      {u.staffCategory ? ` • ${u.staffCategory}` : ''}
                    </Text>
                  </View>
                  <View style={styles.actionRow}>
                    <Pressable style={styles.actionBtn} onPress={() => setViewTarget(u)}>
                      <MaterialCommunityIcons name="eye-outline" size={16} color="#0369a1" />
                    </Pressable>
                    {canEditRow(u) ? (
                      <Pressable style={styles.actionBtn} onPress={() => openEdit(u)}>
                        <MaterialCommunityIcons name="pencil-outline" size={16} color="#1d4ed8" />
                      </Pressable>
                    ) : null}
                    {isSeniorManager ? (
                      <Pressable style={[styles.actionBtn, styles.deleteActionBtn]} onPress={() => setDeleteTarget(u)}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#b91c1c" />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            )}

            {hasMore && !search.trim() && categoryFilter === 'all' ? (
              <Pressable
                style={[styles.retryBtn, { alignSelf: 'center', marginTop: 12 }, loadingMore && { opacity: 0.7 }]}
                onPress={loadMore}
                disabled={loadingMore}
              >
                <Text style={styles.retryText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
      <Modal visible={!!viewTarget} transparent animationType="fade" onRequestClose={() => setViewTarget(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setViewTarget(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Staff Profile</Text>
            <Text style={styles.modalLine}>Name: {viewTarget?.name || '—'}</Text>
            <Text style={styles.modalLine}>Email: {viewTarget?.email || '—'}</Text>
            <Text style={styles.modalLine}>Role: {viewTarget?.systemRole || 'None'}</Text>
            <Text style={styles.modalLine}>Category: {viewTarget?.staffCategory || 'Associate'}</Text>
            <Text style={styles.modalLine}>Department: {getDeptName(viewTarget?.departmentId)}</Text>
            <Pressable style={[styles.primaryBtn, { alignSelf: 'flex-end', marginTop: 12 }]} onPress={() => setViewTarget(null)}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !editBusy && setEditTarget(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Staff</Text>
            <Text style={styles.label}>System Role</Text>
            <View style={styles.pillRow}>
              {['None', 'Supervisor', 'Senior Manager', 'Finance'].map((r) => (
                <Pressable key={r} style={[styles.pill, editRole === r && styles.pillActive]} onPress={() => setEditRole(r)}>
                  <Text style={[styles.pillText, editRole === r && styles.pillTextActive]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Staff Category</Text>
            <View style={styles.pillRow}>
              {['Associate', 'Full-Staff'].map((c) => (
                <Pressable key={c} style={[styles.pill, editCategory === c && styles.pillActive]} onPress={() => setEditCategory(c)}>
                  <Text style={[styles.pillText, editCategory === c && styles.pillTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.outlineBtn} onPress={() => setEditTarget(null)} disabled={editBusy}>
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={saveEdit} disabled={editBusy}>
                {editBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryBtnText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !deleteBusy && setDeleteTarget(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !deleteBusy && setDeleteTarget(null)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete staff member?</Text>
            <Text style={styles.confirmText}>
              Permanently delete {deleteTarget?.name || 'this user'}. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.outlineBtn} onPress={() => setDeleteTarget(null)} disabled={deleteBusy}>
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.deleteBtn} onPress={confirmDelete} disabled={deleteBusy}>
                {deleteBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.deleteBtnText}>Delete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => !addBusy && setAddOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !addBusy && setAddOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add New Staff</Text>
            <Text style={styles.stepPill}>Step {addStep} of 3</Text>
            <Text style={styles.stepHint}>
              {addStep === 1 ? 'Required in this step: Full Name, Email, Password' : addStep === 2 ? 'Required in this step: Staff Category (others optional)' : 'Review and submit'}
            </Text>
            {addError ? <Text style={styles.stepError}>{addError}</Text> : null}

            {addStep === 1 ? (
              <>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput style={styles.input} value={newStaff.name} onChangeText={(v) => setNewStaff((s) => ({ ...s, name: v }))} />
                <Text style={styles.label}>Email *</Text>
                <TextInput
                  style={styles.input}
                  value={newStaff.email}
                  onChangeText={(v) => setNewStaff((s) => ({ ...s, email: v }))}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Text style={styles.label}>Password *</Text>
                <TextInput
                  style={styles.input}
                  value={newStaff.password}
                  onChangeText={(v) => setNewStaff((s) => ({ ...s, password: v }))}
                  secureTextEntry
                />
              </>
            ) : null}

            {addStep === 2 ? (
              <>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={newStaff.phoneNumber}
                  onChangeText={(v) => setNewStaff((s) => ({ ...s, phoneNumber: v }))}
                  placeholder="+256..."
                  placeholderTextColor="#9ca3af"
                />
                <Text style={styles.label}>Staff Category *</Text>
                <View style={styles.pillRow}>
                  {['Associate', 'Full-Staff'].map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.pill, newStaff.staffCategory === c && styles.pillActive]}
                      onPress={() => setNewStaff((s) => ({ ...s, staffCategory: c, systemRole: c === 'Full-Staff' ? s.systemRole : 'None', staffRole: '' }))}
                    >
                      <Text style={[styles.pillText, newStaff.staffCategory === c && styles.pillTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
                {newStaff.staffCategory === 'Full-Staff' ? (
                  <>
                    <Text style={styles.label}>System Role</Text>
                    <View style={styles.pillRow}>
                      {['None', 'Supervisor', 'Senior Manager'].map((r) => (
                        <Pressable
                          key={r}
                          style={[styles.pill, newStaff.systemRole === r && styles.pillActive]}
                          onPress={() => setNewStaff((s) => ({ ...s, systemRole: r, supervisorId: r === 'Senior Manager' ? '' : s.supervisorId }))}
                        >
                          <Text style={[styles.pillText, newStaff.systemRole === r && styles.pillTextActive]}>{r}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <Text style={styles.label}>Position</Text>
                <ScrollView style={styles.selectList} nestedScrollEnabled>
                  <Pressable style={[styles.selectItem, !newStaff.staffRole && styles.selectItemActive]} onPress={() => setNewStaff((s) => ({ ...s, staffRole: '' }))}>
                    <Text style={[styles.selectName, !newStaff.staffRole && styles.selectNameActive]}>None</Text>
                  </Pressable>
                  {filteredRoles.map((r) => (
                    <Pressable
                      key={String(r.$id)}
                      style={[styles.selectItem, newStaff.staffRole === String(r.$id) && styles.selectItemActive]}
                      onPress={() => setNewStaff((s) => ({ ...s, staffRole: String(r.$id) }))}
                    >
                      <Text style={[styles.selectName, newStaff.staffRole === String(r.$id) && styles.selectNameActive]}>{r.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.label}>Department</Text>
                <ScrollView style={styles.selectList} nestedScrollEnabled>
                  <Pressable style={[styles.selectItem, !newStaff.departmentId && styles.selectItemActive]} onPress={() => setNewStaff((s) => ({ ...s, departmentId: '' }))}>
                    <Text style={[styles.selectName, !newStaff.departmentId && styles.selectNameActive]}>None</Text>
                  </Pressable>
                  {departments.map((d) => (
                    <Pressable
                      key={String(d.$id)}
                      style={[styles.selectItem, newStaff.departmentId === String(d.$id) && styles.selectItemActive]}
                      onPress={() => setNewStaff((s) => ({ ...s, departmentId: String(d.$id) }))}
                    >
                      <Text style={[styles.selectName, newStaff.departmentId === String(d.$id) && styles.selectNameActive]}>{d.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {newStaff.systemRole !== 'Senior Manager' ? (
                  <>
                    <Text style={styles.label}>Supervisor</Text>
                    <ScrollView style={styles.selectList} nestedScrollEnabled>
                      <Pressable style={[styles.selectItem, !newStaff.supervisorId && styles.selectItemActive]} onPress={() => setNewStaff((s) => ({ ...s, supervisorId: '' }))}>
                        <Text style={[styles.selectName, !newStaff.supervisorId && styles.selectNameActive]}>None</Text>
                      </Pressable>
                      {supervisors.map((s) => (
                        <Pressable
                          key={String(s.$id)}
                          style={[styles.selectItem, newStaff.supervisorId === String(s.userId) && styles.selectItemActive]}
                          onPress={() => setNewStaff((x) => ({ ...x, supervisorId: String(s.userId) }))}
                        >
                          <Text style={[styles.selectName, newStaff.supervisorId === String(s.userId) && styles.selectNameActive]}>{s.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
              </>
            ) : null}

            {addStep === 3 ? (
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLine}>Name: {newStaff.name || '—'}</Text>
                <Text style={styles.reviewLine}>Email: {newStaff.email || '—'}</Text>
                <Text style={styles.reviewLine}>Category: {newStaff.staffCategory || '—'}</Text>
                <Text style={styles.reviewLine}>System role: {newStaff.staffCategory === 'Full-Staff' ? newStaff.systemRole : 'None'}</Text>
                <Text style={styles.reviewLine}>Department: {departments.find((d) => String(d.$id) === String(newStaff.departmentId))?.name || 'None'}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              {addStep > 1 ? (
                <Pressable style={styles.outlineBtn} onPress={() => setAddStep((s) => Math.max(1, s - 1))} disabled={addBusy}>
                  <Text style={styles.outlineBtnText}>Back</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.outlineBtn} onPress={() => setAddOpen(false)} disabled={addBusy}>
                  <Text style={styles.outlineBtnText}>Cancel</Text>
                </Pressable>
              )}
              {addStep < 3 ? (
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => {
                    if (validateAddStep(addStep)) setAddStep((s) => Math.min(3, s + 1));
                  }}
                  disabled={addBusy}
                >
                  <Text style={styles.primaryBtnText}>Next</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.primaryBtn} onPress={createStaff} disabled={addBusy}>
                  {addBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryBtnText}>Create Staff</Text>}
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
      <HrBottomNav />
    </ThemedView>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { paddingHorizontal: 16, paddingBottom: 132 },
  headerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActionRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    alignItems: 'flex-end',
  },
  addStaffBtn: {
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#054653',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addStaffBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e6f4f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#054653', fontSize: 18, fontWeight: '900' },
  subtitle: { marginTop: 4, color: '#6b7280', fontSize: 12 },
  countPill: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#054653',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    height: 40,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: '#111827', fontSize: 13, paddingVertical: 0 },
  input: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    color: '#111827',
    fontSize: 13,
  },
  stepPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    color: '#1e3a8a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
  },
  stepHint: { color: '#6b7280', fontSize: 11, marginBottom: 6 },
  stepError: { color: '#b91c1c', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  filterChipText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  filterChipTextActive: { color: '#054653' },
  stateCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingVertical: 26,
    alignItems: 'center',
    gap: 8,
  },
  stateText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
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
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#054653',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontWeight: '900' },
  name: { color: '#111827', fontSize: 13, fontWeight: '800' },
  meta: { marginTop: 2, color: '#6b7280', fontSize: 11 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  deleteActionBtn: { borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
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
    padding: 14,
  },
  modalTitle: { color: '#111827', fontWeight: '900', fontSize: 16, marginBottom: 10 },
  modalLine: { color: '#374151', fontSize: 13, marginTop: 4 },
  label: { marginTop: 8, marginBottom: 6, color: '#374151', fontSize: 12, fontWeight: '700' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  pillText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  pillTextActive: { color: '#054653' },
  selectList: {
    maxHeight: 120,
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
  reviewCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 10,
  },
  reviewLine: { color: '#374151', fontSize: 12, marginBottom: 4 },
  modalActions: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  outlineBtn: {
    minWidth: 90,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  outlineBtnText: { color: '#374151', fontSize: 12, fontWeight: '800' },
  primaryBtn: {
    minWidth: 90,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#054653',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  confirmTitle: { color: '#7f1d1d', fontWeight: '900', fontSize: 16 },
  confirmText: { marginTop: 8, color: '#374151', fontSize: 13, lineHeight: 20 },
  deleteBtn: {
    minWidth: 90,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  deleteBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
});

