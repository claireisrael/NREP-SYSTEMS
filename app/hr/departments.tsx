import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import { HR_COLLECTIONS, HR_DB_ID, ID, hrDatabases, Query } from '@/lib/appwrite';

export default function HrDepartmentsScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isSeniorManager = String(user?.systemRole || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .includes('senior manager');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const DEPT_PAGE_SIZE = 10;
  const [deptTotal, setDeptTotal] = useState<number | null>(null);
  const [deptPage, setDeptPage] = useState(0); // 0-based
  const [deptLoadingMore, setDeptLoadingMore] = useState(false);

  const ROLE_PAGE_SIZE = 10;
  const [rolesTotal, setRolesTotal] = useState<number | null>(null);
  const [rolesPage, setRolesPage] = useState(0); // 0-based
  const [rolesLoadingMore, setRolesLoadingMore] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<{ name: string; managerId: string }>({ name: '', managerId: '' });
  const [saving, setSaving] = useState(false);
  const [headPickerOpen, setHeadPickerOpen] = useState(false);
  const [headSearch, setHeadSearch] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'departments' | 'positions_roles'>('departments');

  useEffect(() => {
    const t = String(tab || '').toLowerCase();
    if (t === 'departments') {
      setActiveTab('departments');
      return;
    }
    if (t === 'roles' || t === 'positions') {
      setActiveTab('positions_roles');
      return;
    }
  }, [tab]);

  // Roles/Positions data (web-style: managed inside this same module)
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [rolesSearch, setRolesSearch] = useState('');
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleEditing, setRoleEditing] = useState<any | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleStaffCategory, setRoleStaffCategory] = useState<'Associate' | 'Full-Staff'>('Associate');
  const [roleDepartmentId, setRoleDepartmentId] = useState('');
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [roleDeleteOpen, setRoleDeleteOpen] = useState(false);
  const [roleDeleteTarget, setRoleDeleteTarget] = useState<any | null>(null);
  const [roleDeleting, setRoleDeleting] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!isLoading && user && !isSeniorManager) {
      router.replace('/hr/home');
    }
  }, [isLoading, user, isSeniorManager, router]);

  const loadDepartmentsPage = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      try {
        if (mode === 'append') {
          setDeptLoadingMore(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.DEPARTMENTS, [
          Query.orderAsc('name'),
          Query.limit(DEPT_PAGE_SIZE),
          Query.offset(nextPage * DEPT_PAGE_SIZE),
        ]);
        const docs = ((res as any)?.documents ?? []) as any[];
        const totalCount = (res as any)?.total ?? docs.length;
        setDeptTotal(totalCount);
        setDeptPage(nextPage);
        setDepartments((prev) => (mode === 'append' ? [...prev, ...docs] : docs));
      } catch (e: any) {
        setError(e?.message || 'Failed to load departments.');
      } finally {
        if (mode === 'append') {
          setDeptLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [DEPT_PAGE_SIZE]
  );

  const loadUsers = useCallback(async () => {
    try {
      const userRes = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [Query.limit(800)]);
      setUsers(((userRes as any)?.documents ?? []) as any[]);
    } catch {
      // ignore; users list is mainly for pickers/labels
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadDepartmentsPage(0, 'replace'), loadUsers()]);
  }, [loadDepartmentsPage, loadUsers]);

  useEffect(() => {
    if (!isLoading && user && isSeniorManager) loadAll();
  }, [isLoading, user, isSeniorManager, loadAll]);

  const loadRoles = useCallback(async () => {
    try {
      setRolesLoading(true);
      setRolesError(null);
      const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.ROLES, [
        Query.orderAsc('name'),
        Query.limit(ROLE_PAGE_SIZE),
        Query.offset(0),
      ]);
      const docs = ((res as any)?.documents ?? []) as any[];
      setRolesTotal((res as any)?.total ?? docs.length);
      setRolesPage(0);
      setRoles(docs);
    } catch (e: any) {
      setRolesError(e?.message || 'Failed to load roles.');
    } finally {
      setRolesLoading(false);
    }
  }, [ROLE_PAGE_SIZE]);

  const loadMoreRoles = useCallback(async () => {
    if (rolesLoadingMore) return;
    if (rolesTotal !== null && roles.length >= rolesTotal) return;
    try {
      setRolesLoadingMore(true);
      setRolesError(null);
      const nextPage = rolesPage + 1;
      const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.ROLES, [
        Query.orderAsc('name'),
        Query.limit(ROLE_PAGE_SIZE),
        Query.offset(nextPage * ROLE_PAGE_SIZE),
      ]);
      const docs = ((res as any)?.documents ?? []) as any[];
      setRolesTotal((res as any)?.total ?? rolesTotal ?? docs.length);
      setRolesPage(nextPage);
      setRoles((prev) => [...prev, ...docs]);
    } catch (e: any) {
      setRolesError(e?.message || 'Failed to load roles.');
    } finally {
      setRolesLoadingMore(false);
    }
  }, [ROLE_PAGE_SIZE, roles.length, rolesLoadingMore, rolesPage, rolesTotal]);

  useEffect(() => {
    if (!isLoading && user && isSeniorManager && activeTab === 'positions_roles') {
      loadRoles();
    }
  }, [activeTab, isLoading, isSeniorManager, loadRoles, user]);

  const departmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments) {
      if (d?.$id && d?.name) map.set(String(d.$id), String(d.name));
    }
    return map;
  }, [departments]);

  const filteredRoles = useMemo(() => {
    const q = rolesSearch.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => {
      const name = String(r?.name || '');
      const desc = String(r?.description || '');
      const staffCategory = String(r?.staffCategory || '');
      const deptName = departmentNameById.get(String(r?.departmentId || '')) || '';
      return [name, desc, staffCategory, deptName].join(' ').toLowerCase().includes(q);
    });
  }, [departmentNameById, roles, rolesSearch]);

  const openRoleCreate = () => {
    setRoleEditing(null);
    setRoleName('');
    setRoleDescription('');
    setRoleStaffCategory('Associate');
    setRoleDepartmentId('');
    setRoleEditorOpen(true);
  };
  const openRoleEdit = (r: any) => {
    setRoleEditing(r);
    setRoleName(String(r?.name || '').trim());
    setRoleDescription(String(r?.description || ''));
    setRoleStaffCategory(String(r?.staffCategory || 'Associate') === 'Full-Staff' ? 'Full-Staff' : 'Associate');
    setRoleDepartmentId(String(r?.departmentId || ''));
    setRoleEditorOpen(true);
  };
  const closeRoleEditor = () => {
    if (roleSaving) return;
    setRoleEditorOpen(false);
    setRoleEditing(null);
    setRoleName('');
    setRoleDescription('');
    setRoleStaffCategory('Associate');
    setRoleDepartmentId('');
    setDeptPickerOpen(false);
    setDeptSearch('');
  };
  const saveRole = async () => {
    const n = roleName.trim();
    if (!n) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    try {
      setRoleSaving(true);
      const payload: any = {
        name: n,
        description: roleDescription,
        staffCategory: roleStaffCategory,
        departmentId: roleDepartmentId ? roleDepartmentId : null,
      };
      if (roleEditing?.$id) {
        payload.updatedAt = new Date().toISOString();
        await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.ROLES, String(roleEditing.$id), payload);
      } else {
        payload.createdAt = new Date().toISOString();
        await hrDatabases.createDocument(HR_DB_ID, HR_COLLECTIONS.ROLES, ID.unique(), payload);
      }
      closeRoleEditor();
      await loadRoles();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Unable to save.');
    } finally {
      setRoleSaving(false);
    }
  };

  const filteredDeptOptions = useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => String(d?.name || '').toLowerCase().includes(q));
  }, [departments, deptSearch]);
  const deleteRole = (r: any) => {
    if (!r?.$id) return;
    setRoleDeleteTarget(r);
    setRoleDeleteOpen(true);
  };

  const closeRoleDelete = () => {
    if (roleDeleting) return;
    setRoleDeleteOpen(false);
    setRoleDeleteTarget(null);
  };

  const confirmRoleDelete = async () => {
    if (!roleDeleteTarget?.$id) return;
    try {
      setRoleDeleting(true);
      await hrDatabases.deleteDocument(HR_DB_ID, HR_COLLECTIONS.ROLES, String(roleDeleteTarget.$id));
      closeRoleDelete();
      await loadRoles();
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Unable to delete.');
    } finally {
      setRoleDeleting(false);
    }
  };

  const managerLabel = useCallback(
    (managerId?: string | null) => {
      const id = String(managerId || '').trim();
      if (!id) return 'Not set';
      const u = users.find((x) => String(x.userId) === id || String(x.$id) === id);
      return u?.name || u?.email || id;
    },
    [users]
  );

  const detectedHeadKey = useMemo(() => {
    // Appwrite schema varies by environment; update the field that actually exists.
    const sample = departments.find((d) => d && typeof d === 'object') as any;
    if (!sample) return 'managerId';
    const candidates = ['managerId', 'departmentHeadUserId', 'departmentHeadId', 'headId'];
    return candidates.find((k) => k in sample) || 'managerId';
  }, [departments]);

  const getDeptHeadId = useCallback(
    (d: any) => {
      if (!d) return '';
      return (
        String(d.managerId || '').trim() ||
        String(d.departmentHeadUserId || '').trim() ||
        String(d.departmentHeadId || '').trim() ||
        String(d.headId || '').trim() ||
        ''
      );
    },
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => {
      const headId = getDeptHeadId(d);
      const hay = [d.name, d.managerName, headId, managerLabel(headId)].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [departments, search, managerLabel, getDeptHeadId]);

  const hasMoreDepartments = useMemo(() => {
    if (deptTotal === null) return false;
    return departments.length < deptTotal;
  }, [departments.length, deptTotal]);

  const hasMoreRoles = useMemo(() => {
    if (rolesTotal === null) return false;
    return roles.length < rolesTotal;
  }, [roles.length, rolesTotal]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    if (activeTab === 'positions_roles') {
      await loadRoles();
    }
    setRefreshing(false);
  }, [activeTab, loadAll, loadRoles]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', managerId: '' });
    setEditorOpen(true);
  };

  const openEdit = (d: any) => {
    setEditing(d);
    setForm({
      name: String(d?.name || '').trim(),
      managerId: getDeptHeadId(d),
    });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditing(null);
    setForm({ name: '', managerId: '' });
    setHeadPickerOpen(false);
    setHeadSearch('');
  };

  const save = async () => {
    const name = form.name.trim();
    const managerId = form.managerId.trim();
    if (!name) {
      Alert.alert('Validation', 'Department name is required.');
      return;
    }
    try {
      setSaving(true);
      const payload: any = { name };
      // Write only the head field that exists in this environment to avoid schema errors.
      payload[detectedHeadKey] = managerId || null;
      if (editing?.$id) {
        await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.DEPARTMENTS, String(editing.$id), payload);
      } else {
        await hrDatabases.createDocument(HR_DB_ID, HR_COLLECTIONS.DEPARTMENTS, ID.unique(), payload);
      }
      closeEditor();
      await loadAll();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Unable to save department.');
    } finally {
      setSaving(false);
    }
  };

  const closeHeadPicker = () => {
    setHeadPickerOpen(false);
    setHeadSearch('');
  };

  const filteredHeadUsers = useMemo(() => {
    const q = headSearch.trim().toLowerCase();
    const base = Array.isArray(users) ? users : [];
    if (!q) return base.slice(0, 120);
    return base
      .filter((u) => {
        const hay = [u?.name, u?.email, u?.userId, u?.$id].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 120);
  }, [users, headSearch]);

  const askDelete = (d: any) => {
    setDeleteTarget(d);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.$id) return;
    try {
      setDeleting(true);
      await hrDatabases.deleteDocument(HR_DB_ID, HR_COLLECTIONS.DEPARTMENTS, String(deleteTarget.$id));
      closeDelete();
      await loadAll();
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Unable to delete this department.');
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading || !user) return null;

  if (!isSeniorManager) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(16, insets.top + 12), paddingBottom: Math.max(140, insets.bottom + 140), flexGrow: 1 },
        ]}
          showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View style={styles.headerIconCircle}>
                <MaterialCommunityIcons name="domain" size={20} color="#054653" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Departments</Text>
                <Text style={styles.subtitle}>Admin access required</Text>
              </View>
            </View>
          </View>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Access required</Text>
            <Text style={styles.emptyText}>Only Senior Managers can manage departments.</Text>
          </View>
        </ScrollView>
        <HrBottomNav />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(16, insets.top + 12),
            paddingBottom: Math.max(140, insets.bottom + 140),
            flexGrow: 1,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#054653" />}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconCircle}>
              <MaterialCommunityIcons
                name={activeTab === 'departments' ? 'domain' : 'tag-multiple-outline'}
                size={20}
                color="#054653"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {activeTab === 'departments' ? 'Departments' : 'Position Management'}
              </Text>
              <Text style={styles.subtitle}>
                {activeTab === 'departments'
                  ? 'Create and manage departments'
                  : 'Create and manage positions'}
              </Text>
            </View>
            {activeTab === 'departments' ? (
              <Pressable style={styles.newButton} onPress={openCreate}>
                <MaterialCommunityIcons name="plus" size={16} color="#ffffff" />
                <Text style={styles.newButtonText}>Add</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.newButton} onPress={openRoleCreate}>
                <MaterialCommunityIcons name="plus" size={16} color="#ffffff" />
                <Text style={styles.newButtonText}>Add Position</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.segmentRow}>
          <Pressable
            style={[styles.segment, activeTab === 'departments' && styles.segmentActive]}
            onPress={() => setActiveTab('departments')}
          >
            <Text style={[styles.segmentText, activeTab === 'departments' && styles.segmentTextActive]}>Departments</Text>
          </Pressable>
          <Pressable
            style={[styles.segment, activeTab === 'positions_roles' && styles.segmentActive]}
            onPress={() => setActiveTab('positions_roles')}
          >
            <Text
              style={[styles.segmentText, activeTab === 'positions_roles' && styles.segmentTextActive]}
            >
              Positions & Roles
            </Text>
          </Pressable>
        </View>

        {activeTab === 'departments' ? (
          <View style={styles.searchCard}>
            <MaterialCommunityIcons name="magnify" size={18} color="#6b7280" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search departments..."
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.searchCard}>
            <MaterialCommunityIcons name="magnify" size={18} color="#6b7280" />
            <TextInput
              value={rolesSearch}
              onChangeText={setRolesSearch}
              placeholder="Search positions..."
              placeholderTextColor="#9ca3af"
              style={styles.searchInput}
            />
            {rolesSearch ? (
              <Pressable onPress={() => setRolesSearch('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
              </Pressable>
            ) : null}
          </View>
        )}

        {activeTab === 'positions_roles' ? (
          <>
            {rolesLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color="#054653" />
              </View>
            ) : rolesError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{rolesError}</Text>
                <Pressable style={styles.retryBtn} onPress={loadRoles}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.listCard}>
                {filteredRoles.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No positions</Text>
                    <Text style={styles.emptyText}>Add a position.</Text>
                  </View>
                ) : (
                  filteredRoles.map((r) => (
                    <View key={String(r.$id)} style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {String(r.name || '—')}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {String(r.description || 'No description')}
                        </Text>
                        <View style={styles.badgeRow}>
                          <View
                            style={[
                              styles.badge,
                              String(r.staffCategory || '').toLowerCase().includes('full')
                                ? styles.badgeFull
                                : styles.badgeAssociate,
                            ]}
                          >
                            <Text style={styles.badgeText}>
                              {String(r.staffCategory || '').toLowerCase().includes('full')
                                ? 'Full-Staff'
                                : 'Associate'}
                            </Text>
                          </View>
                          <View style={[styles.badge, styles.badgeDept]}>
                            <Text style={styles.badgeText} numberOfLines={1}>
                              {r.departmentId
                                ? departmentNameById.get(String(r.departmentId)) || 'Department'
                                : 'All Departments'}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.rowActions}>
                        <Pressable style={styles.actionIcon} onPress={() => openRoleEdit(r)}>
                          <MaterialCommunityIcons name="pencil-outline" size={16} color="#054653" />
                        </Pressable>
                        <Pressable style={styles.actionIcon} onPress={() => deleteRole(r)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color="#b91c1c" />
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}

                {hasMoreRoles ? (
                  <Pressable
                    style={[styles.retryBtn, { marginTop: 12, alignSelf: 'center' }, rolesLoadingMore && { opacity: 0.7 }]}
                    onPress={loadMoreRoles}
                    disabled={rolesLoadingMore}
                  >
                    <Text style={styles.retryText}>{rolesLoadingMore ? 'Loading…' : 'Load more'}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </>
        ) : loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#054653" />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={loadAll}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.listCard}>
            {filtered.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No departments</Text>
                <Text style={styles.emptyText}>Add your first department.</Text>
              </View>
            ) : (
              filtered.map((d) => (
                <View key={String(d.$id)} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {String(d.name || 'Department')}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      Head: {managerLabel(getDeptHeadId(d))}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable style={styles.actionIcon} onPress={() => openEdit(d)}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#054653" />
                    </Pressable>
                    <Pressable style={styles.actionIcon} onPress={() => askDelete(d)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#b91c1c" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            {hasMoreDepartments && !search.trim() ? (
              <Pressable
                style={[styles.retryBtn, { marginTop: 12, alignSelf: 'center' }, deptLoadingMore && { opacity: 0.7 }]}
                onPress={() => loadDepartmentsPage(deptPage + 1, 'append')}
                disabled={deptLoadingMore}
              >
                <Text style={styles.retryText}>{deptLoadingMore ? 'Loading…' : 'Load more'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
      <HrBottomNav />

      <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={closeEditor}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditor} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing ? 'Edit department' : 'New department'}</Text>

            <Text style={styles.modalLabel}>Department name *</Text>
            <TextInput
              value={form.name}
              onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
              placeholder="e.g. Human Resources"
              placeholderTextColor="#9ca3af"
              style={styles.modalInput}
            />

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Department head</Text>
            <View style={styles.headRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headValue} numberOfLines={1}>
                  {form.managerId ? managerLabel(form.managerId) : 'Not set'}
                </Text>
                <Text style={styles.headHint} numberOfLines={1}>
                  {form.managerId ? `userId: ${form.managerId}` : 'Select a staff member to set as department head.'}
                </Text>
              </View>
              {form.managerId ? (
                <Pressable
                  onPress={() => setForm((s) => ({ ...s, managerId: '' }))}
                  style={styles.headMiniBtn}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="close" size={16} color="#b91c1c" />
                </Pressable>
              ) : null}
              <Pressable onPress={() => setHeadPickerOpen(true)} style={styles.headPickBtn}>
                <MaterialCommunityIcons name="account-search-outline" size={16} color="#054653" />
                <Text style={styles.headPickBtnText}>Select</Text>
              </Pressable>
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={closeEditor} disabled={saving} style={[styles.modalBtn, styles.modalBtnOutline, saving && { opacity: 0.6 }]}>
                <Text style={styles.modalBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable onPress={save} disabled={saving} style={[styles.modalBtn, styles.modalBtnPrimary, saving && { opacity: 0.7 }]}>
                <Text style={styles.modalBtnTextPrimary}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={roleEditorOpen} transparent animationType="fade" onRequestClose={closeRoleEditor}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeRoleEditor} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{roleEditing ? 'Edit Position' : 'Add New Position'}</Text>
              <Pressable onPress={closeRoleEditor} hitSlop={10} disabled={roleSaving}>
                <MaterialCommunityIcons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalLabel}>Position Name *</Text>
              <TextInput
                value={roleName}
                onChangeText={setRoleName}
                placeholder="Position name"
                placeholderTextColor="#9ca3af"
                style={styles.modalInput}
              />

              <Text style={[styles.modalLabel, { marginTop: 12 }]}>Description</Text>
              <TextInput
                value={roleDescription}
                onChangeText={setRoleDescription}
                placeholder="Description (optional)"
                placeholderTextColor="#9ca3af"
                style={[styles.modalInput, styles.modalInputMultiline]}
                multiline
              />

              <Text style={[styles.modalLabel, { marginTop: 12 }]}>Staff Category *</Text>
              <View style={styles.pillRow}>
                {(['Associate', 'Full-Staff'] as const).map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.pill, roleStaffCategory === c && styles.pillActive]}
                    onPress={() => setRoleStaffCategory(c)}
                  >
                    <Text style={[styles.pillText, roleStaffCategory === c && styles.pillTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.helpText}>
                Determines which staff category can be assigned this position
              </Text>

              <Text style={[styles.modalLabel, { marginTop: 12 }]}>Department (Optional)</Text>
              <Pressable style={styles.pickerField} onPress={() => setDeptPickerOpen(true)}>
                <View style={styles.pickerIconCircle}>
                  <MaterialCommunityIcons name="domain" size={16} color="#054653" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerValue} numberOfLines={1}>
                    {roleDepartmentId ? departmentNameById.get(String(roleDepartmentId)) || 'Department' : 'All Departments'}
                  </Text>
                  <Text style={styles.pickerHint} numberOfLines={1}>
                    Tap to choose a department (optional)
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#64748b" />
              </Pressable>
              <Text style={styles.helpText}>
                If selected, this position will be specific to the chosen department
              </Text>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable onPress={closeRoleEditor} disabled={roleSaving} style={[styles.modalBtn, styles.modalBtnOutline, roleSaving && { opacity: 0.6 }]}>
                <Text style={styles.modalBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveRole} disabled={roleSaving} style={[styles.modalBtn, styles.modalBtnPrimary, roleSaving && { opacity: 0.7 }]}>
                <Text style={styles.modalBtnTextPrimary}>{roleSaving ? 'Creating…' : 'Create Position'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deptPickerOpen} transparent animationType="fade" onRequestClose={() => setDeptPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={[StyleSheet.absoluteFill, { zIndex: 1 }]} onPress={() => setDeptPickerOpen(false)} />
          <View style={[styles.modalCard, { zIndex: 2 }]} pointerEvents="auto">
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Department</Text>
              <Pressable onPress={() => setDeptPickerOpen(false)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={20} color="#64748b" />
              </Pressable>
            </View>
            <View style={styles.searchRow}>
              <MaterialCommunityIcons name="magnify" size={18} color="#6b7280" />
              <TextInput
                value={deptSearch}
                onChangeText={setDeptSearch}
                placeholder="Search department..."
                placeholderTextColor="#9ca3af"
                style={styles.searchInput}
              />
              {deptSearch ? (
                <Pressable onPress={() => setDeptSearch('')} hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              style={styles.userPickList}
              contentContainerStyle={{ paddingBottom: 10 }}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={[styles.userPickItem, !roleDepartmentId && styles.userPickItemActive]}
                onPress={() => {
                  setRoleDepartmentId('');
                  setDeptPickerOpen(false);
                }}
              >
                <Text style={[styles.userPickText, !roleDepartmentId && styles.userPickTextActive]}>All Departments</Text>
              </Pressable>
              {filteredDeptOptions.map((d) => {
                const id = String(d?.$id || '');
                const active = id && id === String(roleDepartmentId || '');
                return (
                  <Pressable
                    key={id}
                    style={[styles.userPickItem, active && styles.userPickItemActive]}
                    onPress={() => {
                      setRoleDepartmentId(id);
                      setDeptPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.userPickText, active && styles.userPickTextActive]} numberOfLines={1}>
                      {String(d?.name || 'Department')}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={headPickerOpen} transparent animationType="fade" onRequestClose={closeHeadPicker}>
        <View style={styles.modalBackdrop}>
          <Pressable style={[StyleSheet.absoluteFill, { zIndex: 1 }]} onPress={closeHeadPicker} />
          <View style={[styles.modalCard, { zIndex: 2 }]} pointerEvents="auto">
            <Text style={styles.modalTitle}>Select department head</Text>
            <View style={styles.searchRow}>
              <MaterialCommunityIcons name="magnify" size={18} color="#6b7280" />
              <TextInput
                value={headSearch}
                onChangeText={setHeadSearch}
                placeholder="Search name, email, userId..."
                placeholderTextColor="#9ca3af"
                style={styles.searchInput}
                autoCapitalize="none"
              />
              {headSearch ? (
                <Pressable onPress={() => setHeadSearch('')} hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              style={styles.userPickList}
              contentContainerStyle={{ paddingBottom: 10 }}
              keyboardShouldPersistTaps="handled"
            >
              {filteredHeadUsers.length === 0 ? (
                <View style={{ padding: 12 }}>
                  <Text style={styles.headHint}>No matching staff found.</Text>
                </View>
              ) : (
                filteredHeadUsers.map((u) => {
                  const uid = String(u?.userId || u?.$id || '').trim();
                  const active = uid && uid === String(form.managerId || '').trim();
                  return (
                    <Pressable
                      key={String(u.$id || u.userId)}
                      onPress={() => {
                        setForm((s) => ({ ...s, managerId: uid }));
                        closeHeadPicker();
                      }}
                      style={[styles.userPickItem, active && styles.userPickItemActive]}
                    >
                      <Text style={[styles.userPickText, active && styles.userPickTextActive]} numberOfLines={1}>
                        {u.name || u.email || u.userId}
                      </Text>
                      <Text style={styles.userPickMeta} numberOfLines={1}>
                        {u.email ? String(u.email) : ''}
                        {u.userId ? ` • ${String(u.userId)}` : ''}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable onPress={closeHeadPicker} style={[styles.modalBtn, styles.modalBtnOutline]}>
                <Text style={styles.modalBtnTextOutline}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={closeDelete}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDelete} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete department</Text>
            <Text style={styles.modalSub}>
              This will remove <Text style={{ fontWeight: '900' }}>{String(deleteTarget?.name || 'this department')}</Text>.
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={closeDelete} disabled={deleting} style={[styles.modalBtn, styles.modalBtnOutline, deleting && { opacity: 0.6 }]}>
                <Text style={styles.modalBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmDelete} disabled={deleting} style={[styles.modalBtn, styles.modalBtnDanger, deleting && { opacity: 0.7 }]}>
                <Text style={styles.modalBtnTextPrimary}>{deleting ? 'Deleting…' : 'Delete'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={roleDeleteOpen} transparent animationType="fade" onRequestClose={closeRoleDelete}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeRoleDelete} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete position</Text>
            <Text style={styles.modalSub}>
              This will permanently remove{' '}
              <Text style={{ fontWeight: '900' }}>{String(roleDeleteTarget?.name || 'this position')}</Text>.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={closeRoleDelete}
                disabled={roleDeleting}
                style={[styles.modalBtn, styles.modalBtnOutline, roleDeleting && { opacity: 0.6 }]}
              >
                <Text style={styles.modalBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmRoleDelete}
                disabled={roleDeleting}
                style={[styles.modalBtn, styles.modalBtnDanger, roleDeleting && { opacity: 0.7 }]}
              >
                <Text style={styles.modalBtnTextPrimary}>{roleDeleting ? 'Deleting…' : 'Delete'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  headerCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#e6f4f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#054653', fontSize: 20, fontWeight: '900' },
  subtitle: { marginTop: 2, color: '#6b7280', fontSize: 13, fontWeight: '600' },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#054653',
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
  },
  newButtonText: { color: '#ffffff', fontWeight: '900', fontSize: 12 },
  searchCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchCardTall: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: '#111827', fontSize: 13, fontWeight: '600' },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segment: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  segmentActive: { borderColor: '#054653', backgroundColor: '#eef2f2' },
  segmentText: { fontSize: 11, color: '#6b7280', fontWeight: '800' },
  segmentTextActive: { color: '#054653' },
  subSegmentRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  subSegment: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  subSegmentActive: { borderColor: '#054653', backgroundColor: '#eef2f2' },
  subSegmentText: { fontSize: 11, color: '#6b7280', fontWeight: '800' },
  subSegmentTextActive: { color: '#054653' },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { borderColor: '#054653', backgroundColor: '#eef2f2' },
  pillText: { fontSize: 12, color: '#6b7280', fontWeight: '800' },
  pillTextActive: { color: '#054653' },
  helpText: { marginTop: 6, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  selectList: {
    marginTop: 8,
    maxHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  selectItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  selectItemActive: { backgroundColor: '#eef2f2' },
  selectName: { color: '#0f172a', fontWeight: '800', fontSize: 13 },
  selectNameActive: { color: '#054653' },
  listCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  rowTitle: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  rowMeta: { marginTop: 2, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    maxWidth: '100%',
  },
  badgeAssociate: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  badgeFull: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  badgeDept: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  badgeText: { color: '#0f172a', fontSize: 11, fontWeight: '800' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loadingBox: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  errorBox: {
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  errorText: { color: '#991b1b', textAlign: 'center', fontWeight: '700' },
  retryBtn: { borderRadius: 12, backgroundColor: '#054653', paddingHorizontal: 12, paddingVertical: 10 },
  retryText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  emptyCard: {
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  emptyText: { fontSize: 13, color: '#6b7280', textAlign: 'center', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  modalSub: { marginTop: 8, color: '#475569', fontSize: 13, lineHeight: 18 },
  modalLabel: { marginTop: 12, color: '#111827', fontSize: 12, fontWeight: '900' },
  modalInput: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
    minHeight: 44,
  },
  headRow: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerField: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#054653',
    backgroundColor: '#f1fbf9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#e6f4f2',
    borderWidth: 1,
    borderColor: '#bfe7e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerValue: { color: '#0f172a', fontSize: 13, fontWeight: '900' },
  pickerHint: { marginTop: 4, color: '#0e706d', fontSize: 11, fontWeight: '900' },
  headValue: { color: '#111827', fontSize: 13, fontWeight: '900' },
  headHint: { marginTop: 4, color: '#6b7280', fontSize: 11, fontWeight: '700' },
  headPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#f8fafc',
  },
  headPickBtnText: { color: '#054653', fontSize: 12, fontWeight: '900' },
  headMiniBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  userPickMeta: { marginTop: 4, color: '#6b7280', fontSize: 11, fontWeight: '600' },
  userPickList: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    maxHeight: 180,
    overflow: 'hidden',
  },
  userPickItem: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  userPickItemActive: { backgroundColor: '#e6f4f2' },
  userPickText: { color: '#334155', fontSize: 13, fontWeight: '700' },
  userPickTextActive: { color: '#054653', fontWeight: '900' },
  modalActions: { marginTop: 14, flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalBtn: { flex: 1, borderRadius: 12, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalBtnOutline: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  modalBtnPrimary: { backgroundColor: '#054653' },
  modalBtnDanger: { backgroundColor: '#b91c1c' },
  modalBtnTextOutline: { color: '#334155', fontWeight: '900', fontSize: 12 },
  modalBtnTextPrimary: { color: '#ffffff', fontWeight: '900', fontSize: 12 },
});

