import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { HR_COLLECTIONS, HR_DB_ID, ID, hrDatabases, Query } from '@/lib/appwrite';

type TabKey = 'types' | 'categories' | 'approvers';

export default function HrRequestsAdminScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasAdminAccess = String(user?.systemRole || '').toLowerCase() === 'senior manager';

  const [tab, setTab] = useState<TabKey>('types');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [types, setTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [approvers, setApprovers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKind, setEditorKind] = useState<TabKey>('types');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [resolvedCollections, setResolvedCollections] = useState<{ typesId: string; categoriesId: string; approversId: string }>({
    typesId: '',
    categoriesId: '',
    approversId: '',
  });
  const fallbackRequestTypes = [
    { typeCode: 'EQUIPMENT', typeName: 'Equipment' },
    { typeCode: 'IT_SUPPORT', typeName: 'IT Support' },
    { typeCode: 'FACILITY', typeName: 'Facility' },
    { typeCode: 'HR_SERVICES', typeName: 'HR Services' },
    { typeCode: 'ADMINISTRATIVE', typeName: 'Administrative' },
    { typeCode: 'PROCUREMENT', typeName: 'Procurement' },
    { typeCode: 'MAINTENANCE', typeName: 'Maintenance' },
    { typeCode: 'TRAINING', typeName: 'Training' },
    { typeCode: 'DOCUMENT_REQUEST', typeName: 'Document Request' },
    { typeCode: 'CHANGE_REQUEST', typeName: 'Change Request' },
  ];
  const activeRequestTypes = useMemo(() => {
    const source = (types.length ? types : fallbackRequestTypes).filter((t: any) => t?.isActive !== false);
    return source.sort((a: any, b: any) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0));
  }, [types]);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!isLoading && user && !hasAdminAccess) {
      router.replace('/hr/requests');
    }
  }, [isLoading, user, hasAdminAccess, router]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const ids = await resolveGeneralRequestAdminCollectionIds();
      setResolvedCollections(ids);
      const [typeDocs, catDocs, apprDocs, deptDocs, userDocs] = await Promise.all([
        ids.typesId
          ? hrDatabases.listDocuments(HR_DB_ID, ids.typesId as any, [Query.limit(300), Query.orderAsc('typeName')])
          : Promise.resolve({ documents: [] } as any),
        ids.categoriesId
          ? hrDatabases.listDocuments(HR_DB_ID, ids.categoriesId as any, [Query.limit(500), Query.orderAsc('categoryName')])
          : Promise.resolve({ documents: [] } as any),
        ids.approversId
          ? hrDatabases.listDocuments(HR_DB_ID, ids.approversId as any, [Query.limit(500), Query.orderAsc('approverName')])
          : Promise.resolve({ documents: [] } as any),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.DEPARTMENTS, [Query.limit(300), Query.orderAsc('name')]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [Query.limit(500)]),
      ]);
      setTypes(((typeDocs as any)?.documents ?? []) as any[]);
      setCategories(((catDocs as any)?.documents ?? []) as any[]);
      setApprovers(((apprDocs as any)?.documents ?? []) as any[]);
      setDepartments(((deptDocs as any)?.documents ?? []) as any[]);
      setUsers(((userDocs as any)?.documents ?? []) as any[]);
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user && hasAdminAccess) loadAll();
  }, [isLoading, user, hasAdminAccess, loadAll]);

  const metrics = useMemo(
    () => ({
      types: types.length,
      categories: categories.length,
      approvers: approvers.length,
      activeApprovers: approvers.filter((a) => a.isActive !== false).length,
    }),
    [types, categories, approvers]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = tab === 'types' ? types : tab === 'categories' ? categories : approvers;
    if (!q) return base;
    return base.filter((x: any) =>
      Object.values(x)
        .filter((v) => typeof v === 'string')
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [tab, types, categories, approvers, search]);

  const hasTypesCollection = !!resolvedCollections.typesId;
  const hasCategoriesCollection = !!resolvedCollections.categoriesId;
  const hasApproversCollection = !!resolvedCollections.approversId;

  const getDeptName = (departmentId?: string | null) => {
    if (!departmentId) return 'No Department';
    const d = departments.find((x) => String(x.$id) === String(departmentId));
    return d?.name || 'Unknown Department';
  };

  const openNew = () => {
    if (tab === 'types' && !hasTypesCollection) {
      Alert.alert(
        'Request Types not configured',
        'Set EXPO_PUBLIC_GENERAL_REQUEST_TYPES_COLLECTION_ID in mobile/.env, then restart the app.'
      );
      return;
    }
    if (tab === 'categories' && !hasCategoriesCollection) {
      Alert.alert(
        'Categories not configured',
        'Set EXPO_PUBLIC_GENERAL_REQUEST_CATEGORIES_COLLECTION_ID in mobile/.env, then restart the app.'
      );
      return;
    }
    if (tab === 'approvers' && !hasApproversCollection) {
      Alert.alert(
        'Approvers not configured',
        'Set EXPO_PUBLIC_GENERAL_REQUEST_APPROVERS_COLLECTION_ID in mobile/.env, then restart the app.'
      );
      return;
    }
    setEditorKind(tab);
    setEditing(null);
    if (tab === 'types') {
      setForm({
        typeName: '',
        typeCode: '',
        description: '',
        icon: 'file',
        color: '#054653',
        defaultSLA: 72,
        sortOrder: types.length + 1,
        isActive: true,
      });
    }
    if (tab === 'categories') {
      setForm({
        categoryName: '',
        categoryCode: '',
        requestType: '',
        description: '',
        icon: 'file',
        color: '#054653',
        defaultPriority: 'NORMAL',
        defaultSLA: 72,
        departmentId: '',
        displayOrder: categories.length + 1,
        isActive: true,
      });
    }
    if (tab === 'approvers') {
      setForm({
        userId: '',
        approverName: '',
        approverEmail: '',
        departmentId: '',
        level: 'L1',
        requestTypes: [],
        priority: 0,
        effectiveFrom: '',
        effectiveUntil: '',
        maxApprovalAmount: 0,
        notes: '',
        isActive: true,
      });
    }
    setStep(1);
    setFieldErrors({});
    setEditorOpen(true);
  };

  const openEdit = (item: any) => {
    setEditorKind(tab);
    setEditing(item);
    if (tab === 'types') {
      setForm({
        typeName: item.typeName || item.name || '',
        typeCode: item.typeCode || '',
        description: item.description || '',
        icon: item.icon || 'file',
        color: item.color || '#054653',
        defaultSLA: Number(item.defaultSLA || 72),
        sortOrder: Number(item.sortOrder || 0),
        isActive: item.isActive !== false,
      });
    }
    if (tab === 'categories') {
      setForm({
        categoryName: item.categoryName || item.name || '',
        categoryCode: item.categoryCode || '',
        requestType: item.requestType || '',
        description: item.description || '',
        icon: item.icon || 'file',
        color: item.color || '#054653',
        defaultPriority: item.defaultPriority || 'NORMAL',
        defaultSLA: Number(item.defaultSLA || 72),
        departmentId: item.departmentId || '',
        displayOrder: Number(item.displayOrder || 0),
        isActive: item.isActive !== false,
      });
    }
    if (tab === 'approvers') {
      setForm({
        userId: item.userId || '',
        approverName: item.approverName || '',
        approverEmail: item.approverEmail || '',
        departmentId: item.departmentId || '',
        level: item.level || 'L1',
        requestTypes: Array.isArray(item.requestTypes) ? item.requestTypes : [],
        priority: Number(item.priority || 0),
        effectiveFrom: item.effectiveFrom ? String(item.effectiveFrom).slice(0, 10) : '',
        effectiveUntil: item.effectiveUntil ? String(item.effectiveUntil).slice(0, 10) : '',
        maxApprovalAmount: Number(item.maxApprovalAmount || 0),
        notes: item.notes || '',
        isActive: item.isActive !== false,
      });
    }
    setStep(1);
    setFieldErrors({});
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setEditing(null);
    setForm({});
    setStep(1);
    setFieldErrors({});
  };

  const validateForm = (forStep = step) => {
    const errors: Record<string, string> = {};
    if (editorKind === 'types') {
      if (forStep === 1) {
        if (!String(form.typeName || '').trim()) errors.typeName = 'Type name is required.';
        if (!String(form.typeCode || '').trim()) errors.typeCode = 'Type code is required.';
        if (!String(form.description || '').trim()) errors.description = 'Description is required.';
      }
      if (forStep === 2) {
        if (Number(form.defaultSLA || 0) < 1 || Number(form.defaultSLA || 0) > 720) {
          errors.defaultSLA = 'Default SLA must be between 1 and 720.';
        }
      }
    } else if (editorKind === 'categories') {
      if (forStep === 1) {
        if (!String(form.categoryName || '').trim()) errors.categoryName = 'Category name is required.';
        if (!String(form.categoryCode || '').trim()) errors.categoryCode = 'Category code is required.';
        if (!String(form.requestType || '').trim()) errors.requestType = 'Request type is required.';
      }
      if (forStep === 2) {
        if (!String(form.description || '').trim()) errors.description = 'Description is required.';
        if (!String(form.departmentId || '').trim()) errors.departmentId = 'Department is required.';
        if (Number(form.defaultSLA || 0) < 1 || Number(form.defaultSLA || 0) > 720) {
          errors.defaultSLA = 'Default SLA must be between 1 and 720.';
        }
      }
    } else {
      if (forStep === 1) {
        if (!String(form.userId || '').trim()) errors.userId = 'Approver user is required.';
        if (!String(form.level || '').trim()) errors.level = 'Approver level is required.';
      }
      if (forStep === 2) {
        if (Number(form.maxApprovalAmount || 0) < 0) errors.maxApprovalAmount = 'Max approval amount cannot be negative.';
        if (form.effectiveUntil && form.effectiveFrom && new Date(form.effectiveUntil) <= new Date(form.effectiveFrom)) {
          errors.effectiveUntil = 'Effective Until must be after Effective From.';
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const stepCount = editorKind === 'approvers' ? 3 : 2;
  const nextStep = () => {
    if (!validateForm(step)) return;
    setStep((s) => Math.min(stepCount, s + 1));
  };
  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  const saveCurrent = async () => {
    try {
      if (!validateForm()) return;
      setSaving(true);
      if (editorKind === 'types') {
        if (!resolvedCollections.typesId) throw new Error('General Request Types collection could not be resolved.');
        const payload = {
          typeName: form.typeName || '',
          typeCode: form.typeCode || '',
          description: form.description || '',
          icon: form.icon || 'file',
          color: form.color || '#054653',
          defaultSLA: Number(form.defaultSLA || 72),
          sortOrder: Number(form.sortOrder || 0),
          isActive: !!form.isActive,
        };
        if (editing) await hrDatabases.updateDocument(HR_DB_ID, resolvedCollections.typesId as any, editing.$id, payload);
        else await hrDatabases.createDocument(HR_DB_ID, resolvedCollections.typesId as any, ID.unique(), payload);
      } else if (editorKind === 'categories') {
        if (!resolvedCollections.categoriesId) throw new Error('General Request Categories collection could not be resolved.');
        const payload = {
          categoryName: form.categoryName || '',
          categoryCode: form.categoryCode || '',
          requestType: form.requestType || '',
          description: form.description || '',
          icon: form.icon || 'file',
          color: form.color || '#054653',
          defaultPriority: form.defaultPriority || 'NORMAL',
          defaultSLA: Number(form.defaultSLA || 72),
          departmentId: form.departmentId || null,
          requiresDepartmentApproval: !!form.departmentId,
          displayOrder: Number(form.displayOrder || 0),
          isActive: !!form.isActive,
        };
        if (editing) await hrDatabases.updateDocument(HR_DB_ID, resolvedCollections.categoriesId as any, editing.$id, payload);
        else await hrDatabases.createDocument(HR_DB_ID, resolvedCollections.categoriesId as any, ID.unique(), payload);
      } else {
        if (!resolvedCollections.approversId) throw new Error('General Request Approvers collection could not be resolved.');
        const selected = users.find((u) => String(u.userId) === String(form.userId));
        if (!selected) throw new Error('Select a valid user.');
        const payload: any = {
          userId: String(selected.userId),
          approverName: String(form.approverName || selected.name || 'Approver'),
          approverEmail: String(form.approverEmail || selected.email || ''),
          departmentId: form.departmentId || selected.departmentId || null,
          level: String(form.level || 'L1').toUpperCase(),
          isActive: !!form.isActive,
          approverId: editing?.approverId || `APPR_${String(form.level || 'L1').toUpperCase()}_${Date.now().toString().slice(-6)}`,
          requestTypes: Array.isArray(form.requestTypes) ? form.requestTypes : [],
          priority: Number(form.priority || 0),
          effectiveFrom: form.effectiveFrom ? new Date(`${form.effectiveFrom}T00:00:00.000Z`).toISOString() : new Date().toISOString(),
          effectiveUntil: form.effectiveUntil ? new Date(`${form.effectiveUntil}T00:00:00.000Z`).toISOString() : null,
          maxApprovalAmount: Number(form.maxApprovalAmount || 0),
          notes: form.notes || '',
        };
        if (editing) await hrDatabases.updateDocument(HR_DB_ID, resolvedCollections.approversId as any, editing.$id, payload);
        else await hrDatabases.createDocument(HR_DB_ID, resolvedCollections.approversId as any, ID.unique(), payload);
      }
      closeEditor();
      await loadAll();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Unable to save record.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrent = async (item: any) => {
    setConfirmTarget(item);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (confirmBusy) return;
    setConfirmOpen(false);
    setConfirmTarget(null);
  };

  const performDelete = async () => {
    if (!confirmTarget?.$id) return;
    try {
      setConfirmBusy(true);
      if (tab === 'types' && resolvedCollections.typesId) {
        await hrDatabases.deleteDocument(HR_DB_ID, resolvedCollections.typesId as any, confirmTarget.$id);
      } else if (tab === 'categories' && resolvedCollections.categoriesId) {
        await hrDatabases.deleteDocument(HR_DB_ID, resolvedCollections.categoriesId as any, confirmTarget.$id);
      } else if (tab === 'approvers' && resolvedCollections.approversId) {
        await hrDatabases.deleteDocument(HR_DB_ID, resolvedCollections.approversId as any, confirmTarget.$id);
      }
      closeConfirm();
      await loadAll();
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Unable to delete record.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const toggleApproverStatus = async (item: any) => {
    try {
      if (!resolvedCollections.approversId) return;
      await hrDatabases.updateDocument(HR_DB_ID, resolvedCollections.approversId as any, item.$id, {
        isActive: item.isActive === false,
      });
      await loadAll();
    } catch (e: any) {
      Alert.alert('Update failed', e?.message || 'Unable to update status.');
    }
  };

  if (isLoading || !user) return null;
  if (!hasAdminAccess) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => router.replace('/hr/requests' as any)}>
            <MaterialCommunityIcons name="arrow-left" size={16} color="#054653" />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.headerCard}>
          <Text style={styles.title}>Request Administration</Text>
          <Text style={styles.subtitle}>Request Types, Categories, and Global Approvers</Text>
        </View>

        <View style={styles.metricsRow}>
          <MetricChip label="Types" value={metrics.types} />
          <MetricChip label="Categories" value={metrics.categories} />
          <MetricChip label="Approvers" value={metrics.approvers} />
          <MetricChip label="Active" value={metrics.activeApprovers} />
        </View>

        <View style={styles.tabRow}>
          <TabButton
            label={`Request Types (${types.length})${hasTypesCollection ? '' : ' • Setup needed'}`}
            active={tab === 'types'}
            onPress={() => setTab('types')}
          />
          <TabButton
            label={`Categories (${categories.length})${hasCategoriesCollection ? '' : ' • Setup needed'}`}
            active={tab === 'categories'}
            onPress={() => setTab('categories')}
          />
          <TabButton
            label={`Global Approvers (${approvers.length})${hasApproversCollection ? '' : ' • Setup needed'}`}
            active={tab === 'approvers'}
            onPress={() => setTab('approvers')}
          />
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchWrap}>
            <MaterialCommunityIcons name="magnify" size={16} color="#6b7280" />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search..." placeholderTextColor="#9ca3af" style={styles.searchInput} />
          </View>
          <Pressable style={styles.newBtn} onPress={openNew}>
            <MaterialCommunityIcons name="plus" size={16} color="#ffffff" />
            <Text style={styles.newBtnText}>New</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.stateCard}><ActivityIndicator color="#054653" /></View>
        ) : error ? (
          <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View>
        ) : (
          <View style={styles.listCard}>
            {(tab === 'types' && !hasTypesCollection) ? (
              <Text style={styles.emptyText}>
                Request Types collection is not configured on mobile. Add
                {' '}`EXPO_PUBLIC_GENERAL_REQUEST_TYPES_COLLECTION_ID`{' '}
                in `mobile/.env` and restart.
              </Text>
            ) : null}
            {(tab === 'categories' && !hasCategoriesCollection) ? (
              <Text style={styles.emptyText}>
                Categories collection is not configured on mobile. Add
                {' '}`EXPO_PUBLIC_GENERAL_REQUEST_CATEGORIES_COLLECTION_ID`{' '}
                in `mobile/.env` and restart.
              </Text>
            ) : null}
            {(tab === 'approvers' && !hasApproversCollection) ? (
              <Text style={styles.emptyText}>
                Approvers collection is not configured on mobile. Add
                {' '}`EXPO_PUBLIC_GENERAL_REQUEST_APPROVERS_COLLECTION_ID`{' '}
                in `mobile/.env` and restart.
              </Text>
            ) : null}
            {rows.length === 0 ? (
              <Text style={styles.emptyText}>No records found.</Text>
            ) : (
              rows.map((item: any) => (
                <View key={String(item.$id)} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    {tab === 'types' ? (
                      <>
                        <Text style={styles.rowTitle}>{item.name || item.typeCode || 'Request Type'}</Text>
                        <Text style={styles.rowMeta}>{item.typeCode || ''} {item.description ? `• ${item.description}` : ''}</Text>
                      </>
                    ) : tab === 'categories' ? (
                      <>
                        <Text style={styles.rowTitle}>{item.name || item.categoryCode || 'Category'}</Text>
                        <Text style={styles.rowMeta}>
                          {item.categoryCode || ''} • {item.requestType || 'No Type'} • {getDeptName(item.departmentId)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.rowTitle}>{item.approverName || 'Approver'}</Text>
                        <Text style={styles.rowMeta}>{item.approverEmail || ''} • {item.level || 'L1'} • {getDeptName(item.departmentId)}</Text>
                      </>
                    )}
                  </View>

                  <View style={styles.actions}>
                    {tab === 'approvers' ? (
                      <Pressable style={styles.iconBtn} onPress={() => toggleApproverStatus(item)}>
                        <MaterialCommunityIcons
                          name={item.isActive === false ? 'play-outline' : 'pause-outline'}
                          size={14}
                          color={item.isActive === false ? '#047857' : '#a16207'}
                        />
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.iconBtn} onPress={() => openEdit(item)}>
                      <MaterialCommunityIcons name="pencil-outline" size={14} color="#1d4ed8" />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => deleteCurrent(item)}>
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
            style={styles.kav}
          >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing ? 'Edit' : 'Create'} {editorKind === 'types' ? 'Request Type' : editorKind === 'categories' ? 'Category' : 'Approver'}</Text>

            <View style={styles.stepRow}>
              <Text style={styles.stepText}>Step {step} of {stepCount}</Text>
            </View>
            <View style={styles.stepperPills}>
              {Array.from({ length: stepCount }).map((_, idx) => {
                const n = idx + 1;
                const active = n === step;
                const done = n < step;
                return (
                  <View key={n} style={[styles.stepperPill, active && styles.stepperPillActive, done && styles.stepperPillDone]}>
                    <Text style={[styles.stepperPillText, (active || done) && styles.stepperPillTextActive]}>{n}</Text>
                  </View>
                );
              })}
            </View>

            <ScrollView
              style={styles.formBodyScroll}
              contentContainerStyle={styles.formBodyScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
            {editorKind === 'types' ? (
              <>
                {step === 1 ? (
                  <>
                <Label text="Type Name *" />
                <TextInput value={form.typeName || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, typeName: v }))} style={styles.input} />
                {fieldErrors.typeName ? <Text style={styles.errorHint}>{fieldErrors.typeName}</Text> : null}
                <Label text="Type Code *" />
                <TextInput value={form.typeCode || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, typeCode: v }))} style={styles.input} />
                {fieldErrors.typeCode ? <Text style={styles.errorHint}>{fieldErrors.typeCode}</Text> : null}
                <Label text="Description *" />
                <TextInput value={form.description || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, description: v }))} style={[styles.input, { minHeight: 80 }]} multiline />
                {fieldErrors.description ? <Text style={styles.errorHint}>{fieldErrors.description}</Text> : null}
                  </>
                ) : (
                  <>
                    <Label text="Icon" />
                    <TextInput value={form.icon || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, icon: v }))} style={styles.input} placeholder="e.g. file, laptop, tools" />
                    <Label text="Color" />
                    <TextInput value={form.color || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, color: v }))} style={styles.input} placeholder="#054653" />
                    <Label text="Default SLA (hours) *" />
                    <TextInput value={String(form.defaultSLA ?? 72)} onChangeText={(v) => setForm((s: any) => ({ ...s, defaultSLA: Number(v || 0) }))} style={styles.input} keyboardType="numeric" />
                    {fieldErrors.defaultSLA ? <Text style={styles.errorHint}>{fieldErrors.defaultSLA}</Text> : null}
                    <Label text="Sort Order" />
                    <TextInput value={String(form.sortOrder ?? 0)} onChangeText={(v) => setForm((s: any) => ({ ...s, sortOrder: Number(v || 0) }))} style={styles.input} keyboardType="numeric" />
                  </>
                )}
              </>
            ) : editorKind === 'categories' ? (
              <>
                {step === 1 ? (
                  <>
                <Label text="Category Name *" />
                <TextInput value={form.categoryName || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, categoryName: v }))} style={styles.input} />
                {fieldErrors.categoryName ? <Text style={styles.errorHint}>{fieldErrors.categoryName}</Text> : null}
                <Label text="Category Code *" />
                <TextInput value={form.categoryCode || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, categoryCode: v }))} style={styles.input} />
                {fieldErrors.categoryCode ? <Text style={styles.errorHint}>{fieldErrors.categoryCode}</Text> : null}
                <Label text="Request Type *" />
                <Text style={styles.currentSelection}>Selected: {form.requestType || 'None'}</Text>
                <View style={styles.dropdownWrap}>
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {activeRequestTypes.map((t: any) => (
                      <Pressable
                        key={String(t.$id || t.typeCode)}
                        style={[styles.dropdownItem, form.requestType === (t.typeCode || '') && styles.dropdownItemActive]}
                        onPress={() => setForm((s: any) => ({ ...s, requestType: t.typeCode || '' }))}
                      >
                        <Text style={[styles.dropdownItemText, form.requestType === (t.typeCode || '') && styles.dropdownItemTextActive]}>
                          {t.typeName || t.name || t.typeCode}
                        </Text>
                        <Text style={styles.selectMeta}>{t.typeCode}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                {fieldErrors.requestType ? <Text style={styles.errorHint}>{fieldErrors.requestType}</Text> : null}
                  </>
                ) : (
                  <>
                <Label text="Description *" />
                <TextInput
                  value={form.description || ''}
                  onChangeText={(v) => setForm((s: any) => ({ ...s, description: v }))}
                  style={[styles.input, { minHeight: 80 }]}
                  multiline
                />
                {fieldErrors.description ? <Text style={styles.errorHint}>{fieldErrors.description}</Text> : null}
                <Label text="Department *" />
                <View style={styles.dropdownWrap}>
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                    {departments.map((d) => (
                      <Pressable
                        key={String(d.$id)}
                        style={[styles.dropdownItem, form.departmentId === d.$id && styles.dropdownItemActive]}
                        onPress={() => setForm((s: any) => ({ ...s, departmentId: d.$id }))}
                      >
                        <Text style={[styles.dropdownItemText, form.departmentId === d.$id && styles.dropdownItemTextActive]}>
                          {d.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                {fieldErrors.departmentId ? <Text style={styles.errorHint}>{fieldErrors.departmentId}</Text> : null}
                <Label text="Default Priority" />
                <View style={styles.levelRow}>
                  {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => (
                    <Pressable key={p} style={[styles.levelBtn, form.defaultPriority === p && styles.levelBtnActive]} onPress={() => setForm((s: any) => ({ ...s, defaultPriority: p }))}>
                      <Text style={[styles.levelText, form.defaultPriority === p && styles.levelTextActive]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
                <Label text="Default SLA (hours) *" />
                <TextInput value={String(form.defaultSLA ?? 72)} onChangeText={(v) => setForm((s: any) => ({ ...s, defaultSLA: Number(v || 0) }))} style={styles.input} keyboardType="numeric" />
                {fieldErrors.defaultSLA ? <Text style={styles.errorHint}>{fieldErrors.defaultSLA}</Text> : null}
                <Label text="Icon" />
                <TextInput value={form.icon || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, icon: v }))} style={styles.input} placeholder="e.g. file, laptop, tools" />
                <Label text="Color" />
                <TextInput value={form.color || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, color: v }))} style={styles.input} placeholder="#054653" />
                <Label text="Display Order" />
                <TextInput value={String(form.displayOrder ?? 0)} onChangeText={(v) => setForm((s: any) => ({ ...s, displayOrder: Number(v || 0) }))} style={styles.input} keyboardType="numeric" />
                  </>
                )}
              </>
            ) : (
              <>
                {step === 1 ? (
                  <>
                <Label text="User *" />
                <ScrollView style={styles.selectList} nestedScrollEnabled>
                  {users.map((u) => (
                    <Pressable key={String(u.$id)} style={[styles.selectItem, form.userId === u.userId && styles.selectItemActive]} onPress={() => setForm((s: any) => ({ ...s, userId: u.userId, approverName: u.name || '', approverEmail: u.email || '', departmentId: u.departmentId || '' }))}>
                      <Text style={[styles.selectName, form.userId === u.userId && styles.selectNameActive]}>{u.name} ({u.systemRole || 'Staff'})</Text>
                      <Text style={styles.selectMeta}>{u.email}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {fieldErrors.userId ? <Text style={styles.errorHint}>{fieldErrors.userId}</Text> : null}
                <Label text="Level *" />
                <View style={styles.levelRow}>
                  <Pressable style={[styles.levelBtn, form.level === 'L1' && styles.levelBtnActive]} onPress={() => setForm((s: any) => ({ ...s, level: 'L1' }))}>
                    <Text style={[styles.levelText, form.level === 'L1' && styles.levelTextActive]}>L1</Text>
                  </Pressable>
                  <Pressable style={[styles.levelBtn, form.level === 'L2' && styles.levelBtnActive]} onPress={() => setForm((s: any) => ({ ...s, level: 'L2' }))}>
                    <Text style={[styles.levelText, form.level === 'L2' && styles.levelTextActive]}>L2</Text>
                  </Pressable>
                </View>
                {fieldErrors.level ? <Text style={styles.errorHint}>{fieldErrors.level}</Text> : null}
                  </>
                ) : step === 2 ? (
                  <>
                    <Label text="Approver Name *" />
                    <TextInput value={form.approverName || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, approverName: v }))} style={styles.input} />
                    <Label text="Approver Email *" />
                    <TextInput value={form.approverEmail || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, approverEmail: v }))} style={styles.input} keyboardType="email-address" />
                    <Label text="Department" />
                    <View style={styles.dropdownWrap}>
                      <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                        {departments.map((d) => (
                          <Pressable
                            key={String(d.$id)}
                            style={[styles.dropdownItem, form.departmentId === d.$id && styles.dropdownItemActive]}
                            onPress={() => setForm((s: any) => ({ ...s, departmentId: d.$id }))}
                          >
                            <Text style={[styles.dropdownItemText, form.departmentId === d.$id && styles.dropdownItemTextActive]}>
                              {d.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <Label text="Priority Order" />
                    <TextInput value={String(form.priority ?? 0)} onChangeText={(v) => setForm((s: any) => ({ ...s, priority: Number(v || 0) }))} style={styles.input} keyboardType="numeric" />
                    <Label text="Max Approval Amount (UGX)" />
                    <TextInput value={String(form.maxApprovalAmount ?? 0)} onChangeText={(v) => setForm((s: any) => ({ ...s, maxApprovalAmount: Number(v || 0) }))} style={styles.input} keyboardType="numeric" />
                    {fieldErrors.maxApprovalAmount ? <Text style={styles.errorHint}>{fieldErrors.maxApprovalAmount}</Text> : null}
                  </>
                ) : (
                  <>
                    <Label text="Request Types (Optional)" />
                    <View style={styles.multiSelectWrap}>
                      {activeRequestTypes.map((t: any) => {
                        const code = String(t.typeCode || '');
                        const active = Array.isArray(form.requestTypes) && form.requestTypes.includes(code);
                        return (
                          <Pressable
                            key={code}
                            onPress={() =>
                              setForm((s: any) => ({
                                ...s,
                                requestTypes: active
                                  ? (s.requestTypes || []).filter((x: string) => x !== code)
                                  : [...(s.requestTypes || []), code],
                              }))
                            }
                            style={[styles.multiChip, active && styles.multiChipActive]}
                          >
                            <Text style={[styles.multiChipText, active && styles.multiChipTextActive]}>
                              {t.typeName || code}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Label text="Effective From (YYYY-MM-DD)" />
                    <TextInput value={form.effectiveFrom || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, effectiveFrom: v }))} style={styles.input} placeholder="2026-01-31" />
                    <Label text="Effective Until (YYYY-MM-DD)" />
                    <TextInput value={form.effectiveUntil || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, effectiveUntil: v }))} style={styles.input} placeholder="Optional" />
                    {fieldErrors.effectiveUntil ? <Text style={styles.errorHint}>{fieldErrors.effectiveUntil}</Text> : null}
                    <Label text="Notes" />
                    <TextInput value={form.notes || ''} onChangeText={(v) => setForm((s: any) => ({ ...s, notes: v }))} style={[styles.input, { minHeight: 80 }]} multiline />
                  </>
                )}
              </>
            )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={[styles.actionBtn, styles.actionOutline]} onPress={step > 1 ? prevStep : closeEditor} disabled={saving}>
                <Text style={styles.actionOutlineText}>{step > 1 ? 'Back' : 'Cancel'}</Text>
              </Pressable>
              {step < stepCount ? (
                <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={nextStep} disabled={saving}>
                  <Text style={styles.actionPrimaryText}>Next</Text>
                </Pressable>
              ) : (
                <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={saveCurrent} disabled={saving}>
                  {saving ? (
                    <View style={styles.inlineBusy}>
                      <ActivityIndicator color="#ffffff" />
                      <Text style={styles.actionPrimaryText}>Saving...</Text>
                    </View>
                  ) : (
                    <Text style={styles.actionPrimaryText}>{editing ? 'Update' : 'Create'}</Text>
                  )}
                </Pressable>
              )}
            </View>
            {step > 1 ? (
              <View style={{ marginTop: 8 }}>
                <Pressable onPress={prevStep} style={styles.prevLink}>
                  <Text style={styles.prevLinkText}>Back to previous step</Text>
                </Pressable>
              </View>
            ) : null}
            {step < stepCount ? (
              <View style={{ marginTop: 6, paddingBottom: 2 }}>
                <Text style={styles.helperText}>Complete required fields marked with *</Text>
              </View>
            ) : null}
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={closeConfirm}>
        <View style={styles.confirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeConfirm} />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#b91c1c" />
            </View>
            <Text style={styles.confirmTitle}>
              {tab === 'types' ? 'Delete Request Type?' : tab === 'categories' ? 'Delete Category?' : 'Delete Approver?'}
            </Text>
            <Text style={styles.confirmText}>
              This action permanently deletes{' '}
              <Text style={styles.confirmStrong}>
                {tab === 'types'
                  ? (confirmTarget?.typeName || confirmTarget?.name || 'this type')
                  : tab === 'categories'
                    ? (confirmTarget?.categoryName || confirmTarget?.name || 'this category')
                    : (confirmTarget?.approverName || 'this approver')}
              </Text>
              . This cannot be undone.
            </Text>

            <View style={styles.confirmMetaPill}>
              <Text style={styles.confirmMetaText}>
                {tab === 'types'
                  ? `Code: ${confirmTarget?.typeCode || '—'}`
                  : tab === 'categories'
                    ? `Code: ${confirmTarget?.categoryCode || '—'}`
                    : `Level: ${confirmTarget?.level || '—'}`}
              </Text>
            </View>

            <View style={styles.confirmActions}>
              <Pressable
                onPress={closeConfirm}
                disabled={confirmBusy}
                style={[styles.confirmBtn, styles.confirmBtnOutline, confirmBusy && { opacity: 0.6 }]}
              >
                <Text style={styles.confirmBtnOutlineText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={performDelete}
                disabled={confirmBusy}
                style={[styles.confirmBtn, styles.confirmBtnDanger, confirmBusy && { opacity: 0.7 }]}
              >
                {confirmBusy ? (
                  <View style={styles.inlineBusy}>
                    <ActivityIndicator color="#ffffff" />
                    <Text style={styles.confirmBtnDangerText}>Deleting...</Text>
                  </View>
                ) : (
                  <Text style={styles.confirmBtnDangerText}>Delete</Text>
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

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MetricChip({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricChip}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

async function resolveGeneralRequestAdminCollectionIds() {
  const fromEnv = {
    typesId: String(HR_COLLECTIONS.GENERAL_REQUEST_TYPES || ''),
    categoriesId: String(HR_COLLECTIONS.GENERAL_REQUEST_CATEGORIES || ''),
    approversId: String(HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS || ''),
  };
  if (fromEnv.typesId && fromEnv.categoriesId && fromEnv.approversId) return fromEnv;

  try {
    const anyDb = hrDatabases as any;
    if (typeof anyDb.listCollections !== 'function') return fromEnv;
    const res = await anyDb.listCollections(HR_DB_ID);
    const collections = (res?.collections ?? []) as any[];
    const pick = (needle: string) =>
      String(collections.find((c) => String(c.name || '').toLowerCase().includes(needle.toLowerCase()))?.$id || '');

    return {
      typesId: fromEnv.typesId || pick('general request types'),
      categoriesId: fromEnv.categoriesId || pick('general request categories'),
      approversId: fromEnv.approversId || pick('general request approvers'),
    };
  } catch {
    return fromEnv;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { paddingHorizontal: 16, paddingBottom: 132 },
  topRow: { marginBottom: 10 },
  backBtn: {
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
  headerCard: { borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', padding: 14, marginBottom: 10 },
  title: { color: '#054653', fontSize: 18, fontWeight: '900' },
  subtitle: { marginTop: 4, color: '#6b7280', fontSize: 12 },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  metricChip: { minWidth: 74, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' },
  metricValue: { color: '#054653', fontSize: 18, fontWeight: '900' },
  metricLabel: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '700' },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tabBtn: { borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#ffffff', paddingHorizontal: 12, height: 32, alignItems: 'center', justifyContent: 'center' },
  tabBtnActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  tabBtnText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  tabBtnTextActive: { color: '#054653' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', paddingHorizontal: 10, height: 40 },
  searchInput: { flex: 1, color: '#111827', fontSize: 13, paddingVertical: 0 },
  newBtn: { height: 40, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#054653', flexDirection: 'row', alignItems: 'center', gap: 6 },
  newBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  stateCard: { borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', paddingVertical: 24, alignItems: 'center' },
  errorCard: { borderRadius: 14, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', padding: 12, alignItems: 'center' },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  listCard: { borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 8 },
  emptyText: { color: '#6b7280', fontSize: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowTitle: { color: '#111827', fontSize: 13, fontWeight: '700' },
  rowMeta: { marginTop: 2, color: '#6b7280', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  iconBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  kav: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '100%', maxWidth: 460, maxHeight: '92%', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', padding: 14 },
  formBodyScroll: {
    maxHeight: 460,
    minHeight: 180,
  },
  formBodyScrollContent: {
    paddingBottom: 8,
  },
  modalTitle: { color: '#111827', fontWeight: '900', fontSize: 16, marginBottom: 10 },
  stepRow: { marginBottom: 8 },
  stepText: { color: '#475569', fontSize: 12, fontWeight: '800' },
  stepperPills: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stepperPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperPillActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  stepperPillDone: { borderColor: '#047857', backgroundColor: '#ecfdf5' },
  stepperPillText: { color: '#64748b', fontSize: 11, fontWeight: '800' },
  stepperPillTextActive: { color: '#054653' },
  label: { color: '#374151', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 6 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 14,
    minHeight: 42,
  },
  selectList: { maxHeight: 180, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', padding: 6 },
  selectItem: { borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  selectItemActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  selectName: { color: '#111827', fontWeight: '700', fontSize: 12 },
  selectNameActive: { color: '#054653' },
  selectMeta: { marginTop: 2, color: '#6b7280', fontSize: 11 },
  currentSelection: { marginTop: 2, marginBottom: 4, color: '#64748b', fontSize: 11, fontWeight: '700' },
  errorHint: { marginTop: 4, color: '#b91c1c', fontSize: 11, fontWeight: '700' },
  dropdownWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    overflow: 'hidden',
  },
  dropdownList: { maxHeight: 180 },
  dropdownItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    backgroundColor: '#ffffff',
  },
  dropdownItemActive: { backgroundColor: '#e6f4f2' },
  dropdownItemText: { color: '#111827', fontSize: 12, fontWeight: '700' },
  dropdownItemTextActive: { color: '#054653' },
  multiSelectWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  multiChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  multiChipActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  multiChipText: { color: '#6b7280', fontSize: 11, fontWeight: '700' },
  multiChipTextActive: { color: '#054653' },
  levelRow: { flexDirection: 'row', gap: 8 },
  levelBtn: { flex: 1, height: 36, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  levelBtnActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  levelText: { color: '#6b7280', fontWeight: '800', fontSize: 12 },
  levelTextActive: { color: '#054653' },
  modalActions: { marginTop: 12, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionBtn: { minWidth: 96, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  actionOutline: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#ffffff' },
  actionPrimary: { backgroundColor: '#054653' },
  actionOutlineText: { color: '#374151', fontWeight: '800', fontSize: 12 },
  actionPrimaryText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  prevLink: { alignSelf: 'flex-start', paddingVertical: 2 },
  prevLinkText: { color: '#054653', fontWeight: '700', fontSize: 12 },
  helperText: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  inlineBusy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  confirmIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  confirmTitle: {
    marginTop: 10,
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  confirmText: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  confirmStrong: { color: '#111827', fontWeight: '800' },
  confirmMetaPill: {
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  confirmMetaText: { color: '#334155', fontSize: 11, fontWeight: '800' },
  confirmActions: { marginTop: 14, flexDirection: 'row', gap: 8 },
  confirmBtn: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  confirmBtnOutline: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#ffffff' },
  confirmBtnDanger: { backgroundColor: '#b91c1c' },
  confirmBtnOutlineText: { color: '#374151', fontWeight: '800', fontSize: 12 },
  confirmBtnDangerText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
});
