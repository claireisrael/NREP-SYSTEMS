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
  Switch,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedView } from '@/components/themed-view';
import { PmsBottomNav } from '@/components/PmsBottomNav';
import { useAuth } from '@/context/AuthContext';

const PMS_WEB_BASE_URL = 'https://projects.nrep.ug';

type Timesheet = {
  $id: string;
  status: string;
  weekStart: string;
};

type Entry = {
  $id: string;
  projectId: string;
  taskId?: string | null;
  workDate: string;
  title: string;
  hours: number;
  notes?: string | null;
  billable: boolean;
};

type Project = {
  $id: string;
  name: string;
  code?: string;
};

type Task = {
  $id: string;
  name: string;
  code?: string;
};

export default function MyTimesheetsScreen() {
  const { user } = useAuth();

  const [timesheet, setTimesheet] = useState<Timesheet | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [weekStart, setWeekStart] = useState<string>(() => getWeekStartISO(new Date()));
  const [weekEnd, setWeekEnd] = useState<string>(() => getWeekEndISO(new Date()));

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [entryProjectId, setEntryProjectId] = useState('');
  const [entryTaskId, setEntryTaskId] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryHours, setEntryHours] = useState('');
  const [entryStartTime, setEntryStartTime] = useState('');
  const [entryEndTime, setEntryEndTime] = useState('');
  const [entryBillable, setEntryBillable] = useState(true);
  const [entryNotes, setEntryNotes] = useState('');

  const [activeTimePicker, setActiveTimePicker] = useState<'start' | 'end' | null>(null);
  const [timePickerValue, setTimePickerValue] = useState<Date | null>(null);

  const accountId = user?.authUser?.$id;
  const organizationId = user?.organizationId;

  useEffect(() => {
    if (!accountId || !organizationId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);

        // Load projects
        const projectsRes = await fetch(
          `${PMS_WEB_BASE_URL}/api/projects?organizationId=${encodeURIComponent(
            organizationId,
          )}&requesterId=${encodeURIComponent(accountId)}`,
        );
        const projectsData = await projectsRes.json();
        if (projectsRes.ok) {
          const active =
            (projectsData.projects as Project[] | undefined)?.filter(
              (p: any) => p.status === 'active',
            ) || [];
          setProjects(active);
        }

        // Load timesheet + entries for week
        const tsRes = await fetch(
          `${PMS_WEB_BASE_URL}/api/timesheets?accountId=${encodeURIComponent(
            accountId,
          )}&requesterId=${encodeURIComponent(accountId)}&organizationId=${encodeURIComponent(
            organizationId,
          )}&weekStart=${encodeURIComponent(weekStart)}`,
        );
        const tsData = await tsRes.json();
        if (!tsRes.ok) {
          throw new Error(tsData?.error || 'Failed to load timesheet');
        }

        setTimesheet(tsData.timesheet as Timesheet | null);
        setEntries((tsData.entries || []) as Entry[]);
      } catch (err: any) {
        console.error('Failed to load my timesheet', err);
        Alert.alert('Error', err?.message || 'Failed to load timesheet.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [accountId, organizationId, weekStart]);

  // Load tasks when project selection changes (same as web entry page)
  useEffect(() => {
    const loadTasks = async () => {
      if (!entryProjectId) {
        setTasks([]);
        return;
      }
      try {
        const res = await fetch(
          `${PMS_WEB_BASE_URL}/api/projects/${encodeURIComponent(entryProjectId)}/tasks`,
        );
        const data = await res.json();
        if (res.ok) {
          setTasks((data.tasks || []) as Task[]);
        } else {
          setTasks([]);
        }
      } catch {
        setTasks([]);
      }
    };

    loadTasks();
  }, [entryProjectId]);

  // Auto-calc hours from start & end time (like web)
  useEffect(() => {
    if (entryStartTime && entryEndTime) {
      const start = new Date(`1970-01-01T${entryStartTime}`);
      const end = new Date(`1970-01-01T${entryEndTime}`);
      if (end > start) {
        const diffMs = end.getTime() - start.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);
        const rounded = Math.round(diffHrs * 100) / 100;
        setEntryHours(rounded.toString());
      }
    }
  }, [entryStartTime, entryEndTime]);

  const openTimePicker = (target: 'start' | 'end') => {
    const raw = target === 'start' ? entryStartTime : entryEndTime;
    let base = new Date();
    if (raw) {
      const parsed = new Date(`1970-01-01T${raw}`);
      if (!Number.isNaN(parsed.getTime())) {
        base = parsed;
      }
    }
    setActiveTimePicker(target);
    setTimePickerValue(base);
  };

  const handleTimePicked = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      // Android automatically closes the picker; clear state regardless
      setActiveTimePicker(null);
    }

    if (!selectedDate) {
      return;
    }

    const hours = `${selectedDate.getHours()}`.padStart(2, '0');
    const minutes = `${selectedDate.getMinutes()}`.padStart(2, '0');
    const value = `${hours}:${minutes}`;

    if (activeTimePicker === 'start') {
      setEntryStartTime(value);
    } else if (activeTimePicker === 'end') {
      setEntryEndTime(value);
    }

    if (Platform.OS === 'ios') {
      // keep picker open for further tweaks
      setTimePickerValue(selectedDate);
    }
  };

  const totals = useMemo(() => {
    const total = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
    const billable = entries
      .filter((e) => e.billable)
      .reduce((sum, e) => sum + (e.hours || 0), 0);
    const nonBillable = total - billable;
    const projectIds = new Set(entries.map((e) => e.projectId));
    return {
      total,
      billable,
      nonBillable,
      projectsCount: projectIds.size,
    };
  }, [entries]);

  const statusPill = () => {
    const status = timesheet?.status || 'draft';
    let label = 'Draft';
    let bg = '#e5e7eb';
    let color = '#111827';

    if (status === 'submitted') {
      label = 'Submitted';
      bg = '#fef9c3';
      color = '#854d0e';
    } else if (status === 'approved') {
      label = 'Approved';
      bg = '#dcfce7';
      color = '#166534';
    } else if (status === 'rejected') {
      label = 'Rejected';
      bg = '#fee2e2';
      color = '#b91c1c';
    }

    return (
      <View style={[styles.statusPill, { backgroundColor: bg }]}>
        <Text style={[styles.statusPillText, { color }]}>{label.toUpperCase()}</Text>
      </View>
    );
  };

  const canEdit =
    !timesheet || timesheet.status === 'draft' || timesheet.status === 'rejected';

  const handlePrevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(getWeekStartISO(d));
    setWeekEnd(getWeekEndISO(d));
  };

  const handleNextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(getWeekStartISO(d));
    setWeekEnd(getWeekEndISO(d));
  };

  const openEntryModal = () => {
    if (!canEdit) {
      Alert.alert('Locked', 'This timesheet is submitted or approved and cannot be edited.');
      return;
    }
    setEditingEntry(null);
    setEntryProjectId(projects[0]?.$id || '');
    setEntryTaskId('');
    setEntryDate(toInputDate(new Date()));
    setEntryTitle('');
    setEntryHours('');
    setEntryStartTime('');
    setEntryEndTime('');
    setEntryBillable(true);
    setEntryNotes('');
    setShowEntryModal(true);
  };

  const saveEntry = async () => {
    if (!accountId || !organizationId) return;
    if (!entryProjectId || !entryDate || !entryTitle || !entryStartTime || !entryEndTime) {
      Alert.alert(
        'Missing fields',
        'Project, date, title, start time and end time are required.',
      );
      return;
    }

    const hoursNum = parseFloat(entryHours);
    if (!hoursNum || hoursNum <= 0 || hoursNum > 24) {
      Alert.alert('Invalid hours', 'Hours must be between 0.1 and 24.');
      return;
    }

    try {
      setSubmitting(true);

      // Payload matches web entry implementation
      const payload = {
        projectId: entryProjectId,
        taskId: entryTaskId || null,
        workDate: entryDate,
        title: entryTitle,
        hours: hoursNum,
        notes: entryNotes || null,
        billable: entryBillable,
        startTime: entryStartTime || null,
        endTime: entryEndTime || null,
        requesterId: accountId,
      };

      if (editingEntry) {
        // Update existing entry
        const res = await fetch(
          `${PMS_WEB_BASE_URL}/api/timesheets/entries/${editingEntry.$id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to update entry.');
        }
      } else {
        // Create new entry
        const res = await fetch(`${PMS_WEB_BASE_URL}/api/timesheets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            requesterId: accountId,
            organizationId,
            weekStart,
            entries: [payload],
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to add entry.');
        }
      }

      // Reload week
      const tsRes = await fetch(
        `${PMS_WEB_BASE_URL}/api/timesheets?accountId=${encodeURIComponent(
          accountId,
        )}&requesterId=${encodeURIComponent(accountId)}&organizationId=${encodeURIComponent(
          organizationId,
        )}&weekStart=${encodeURIComponent(weekStart)}`,
      );
      const tsData = await tsRes.json();
      if (tsRes.ok) {
        setTimesheet(tsData.timesheet as Timesheet | null);
        setEntries((tsData.entries || []) as Entry[]);
      }

      setShowEntryModal(false);
      setEditingEntry(null);
    } catch (err: any) {
      console.error('Failed to save entry', err);
      Alert.alert('Error', err?.message || 'Failed to save entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteEntry = async (entry: Entry) => {
    if (!accountId) return;
    if (!canEdit) {
      Alert.alert('Locked', 'This timesheet is submitted or approved and cannot be edited.');
      return;
    }

    Alert.alert(
      'Delete entry',
      `Delete this ${entry.hours}h time entry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmitting(true);
              const res = await fetch(
                `${PMS_WEB_BASE_URL}/api/timesheets/entries/${entry.$id}?requesterId=${encodeURIComponent(
                  accountId,
                )}`,
                { method: 'DELETE' },
              );
              const data = await res.json();
              if (!res.ok) {
                throw new Error(data?.error || 'Failed to delete entry.');
              }
              setEntries((prev) => prev.filter((e) => e.$id !== entry.$id));
            } catch (err: any) {
              console.error('Failed to delete entry', err);
              Alert.alert('Error', err?.message || 'Failed to delete entry.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const submitTimesheet = async () => {
    if (!timesheet || entries.length === 0) {
      Alert.alert('Cannot submit', 'Cannot submit an empty timesheet.');
      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`${PMS_WEB_BASE_URL}/api/timesheets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timesheetId: timesheet.$id,
          action: 'submit',
          requesterId: accountId,
          organizationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to submit timesheet.');
      }

      setTimesheet((prev) => (prev ? { ...prev, status: 'submitted' } : prev));
    } catch (err: any) {
      console.error('Failed to submit timesheet', err);
      Alert.alert('Error', err?.message || 'Failed to submit timesheet.');
    } finally {
      setSubmitting(false);
    }
  };

  const weekRangeLabel = () => {
    const start = new Date(weekStart);
    const end = new Date(weekEnd);
    return `${start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} - ${end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })}`;
  };

  const findProject = (id: string) => projects.find((p) => p.$id === id);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerTitle}>My Timesheets</Text>
              <Text style={styles.headerSubtitleSmall}>{weekRangeLabel()}</Text>
            </View>
            <View style={styles.headerRight}>
              {statusPill()}
              <View style={styles.weekNavRow}>
                <Pressable style={styles.weekNavButton} onPress={handlePrevWeek}>
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={18}
                    color="#0f766e"
                  />
                </Pressable>
                <Pressable style={styles.weekNavButton} onPress={handleNextWeek}>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color="#0f766e"
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color="#0f766e" />
              <Text style={styles.loadingText}>Loading timesheet…</Text>
            </View>
          )}

          {!loading && (
            <>
              {/* Summary cards */}
              <View style={styles.summaryCardsRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryCardLabel}>Total Hours</Text>
                  <Text style={styles.summaryCardValue}>{totals.total.toFixed(1)}h</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryCardLabel}>Billable</Text>
                  <Text style={styles.summaryCardValue}>{totals.billable.toFixed(1)}h</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryCardLabel}>Non‑Billable</Text>
                  <Text style={styles.summaryCardValue}>
                    {totals.nonBillable.toFixed(1)}h
                  </Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryCardLabel}>Projects</Text>
                  <Text style={styles.summaryCardValue}>{totals.projectsCount}</Text>
                </View>
              </View>

              {/* Submit actions (unsubmit not supported by current API) */}
              <View style={styles.actionsBar}>
                {timesheet && timesheet.status === 'submitted' ? (
                  <Text style={styles.awaitingText}>
                    This timesheet is submitted and awaiting approval. Use the web portal if you
                    need to make changes.
                  </Text>
                ) : (
                  <Pressable
                    style={styles.submitButton}
                    onPress={submitTimesheet}
                    disabled={submitting || entries.length === 0}
                  >
                    <Text style={styles.submitButtonText}>
                      {submitting ? 'Submitting…' : 'Submit for Approval'}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Entries list header */}
              <View style={styles.entriesHeaderRow}>
                <Text style={styles.entriesTitle}>Entries</Text>
                <Pressable
                  style={styles.addEntryButton}
                  onPress={openEntryModal}
                  disabled={submitting}
                >
                  <MaterialCommunityIcons
                    name="plus-circle-outline"
                    size={18}
                    color="#ffffff"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.addEntryButtonText}>Add Entry</Text>
                </Pressable>
              </View>

              {entries.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={40}
                    color="#d1d5db"
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.emptyTitle}>No time entries yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Add your first entry to get started.
                  </Text>
                </View>
              ) : (
                entries.map((e) => {
                  const proj = findProject(e.projectId);
                  const date = new Date(e.workDate);
                  return (
                      <Pressable
                        key={e.$id}
                        style={styles.entryCard}
                        onPress={() => {
                          if (!canEdit) return;
                          setEditingEntry(e);
                          setEntryProjectId(e.projectId);
                          setEntryTaskId(e.taskId || '');
                          setEntryDate(e.workDate);
                          setEntryTitle(e.title);
                          setEntryHours(String(e.hours ?? ''));
                          setEntryStartTime('');
                          setEntryEndTime('');
                          setEntryBillable(e.billable);
                          setEntryNotes(e.notes || '');
                          setShowEntryModal(true);
                        }}
                      >
                      <View style={styles.entryHeaderRow}>
                        <Text style={styles.entryTitle}>{e.title}</Text>
                        {canEdit && (
                          <Pressable
                            onPress={() => deleteEntry(e)}
                            hitSlop={8}
                            disabled={submitting}
                          >
                            <MaterialCommunityIcons
                              name="trash-can-outline"
                              size={18}
                              color="#b91c1c"
                            />
                          </Pressable>
                        )}
                      </View>
                      <Text style={styles.entryMeta}>
                        {proj ? `${proj.code || proj.name}` : 'Project'}
                        {'  ·  '}
                        {date.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      <View style={styles.entryFooterRow}>
                        <View style={styles.entryHoursBadge}>
                          <Text style={styles.entryHoursText}>{e.hours}h</Text>
                        </View>
                        <View style={styles.entryBillableBadge}>
                          <Text style={styles.entryBillableText}>
                            {e.billable ? 'Billable' : 'Non‑billable'}
                          </Text>
                        </View>
                      </View>
                      {e.notes ? (
                        <Text style={styles.entryNotes}>{e.notes}</Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </>
          )}
        </ScrollView>

        {/* Add Entry modal */}
        <Modal
          transparent
          visible={showEntryModal}
          animationType="fade"
          onRequestClose={() => !submitting && setShowEntryModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Time Entry</Text>
              <ScrollView
                style={{ maxHeight: 380 }}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                <Text style={styles.fieldLabel}>Project</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.projectPickerRow}
                >
                  {projects.map((p) => {
                    const active = entryProjectId === p.$id;
                    return (
                      <Pressable
                        key={p.$id}
                        style={[
                          styles.projectPickerChip,
                          active && styles.projectPickerChipActive,
                        ]}
                        onPress={() => setEntryProjectId(p.$id)}
                      >
                        <Text
                          style={[
                            styles.projectPickerText,
                            active && styles.projectPickerTextActive,
                          ]}
                        >
                          {p.code || p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={styles.fieldLabel}>Task (Optional)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.projectPickerRow}
                >
                  <Pressable
                    style={[
                      styles.projectPickerChip,
                      !entryTaskId && styles.projectPickerChipActive,
                    ]}
                    onPress={() => setEntryTaskId('')}
                  >
                    <Text
                      style={[
                        styles.projectPickerText,
                        !entryTaskId && styles.projectPickerTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </Pressable>
                  {tasks.map((t) => {
                    const active = entryTaskId === t.$id;
                    return (
                      <Pressable
                        key={t.$id}
                        style={[
                          styles.projectPickerChip,
                          active && styles.projectPickerChipActive,
                        ]}
                        onPress={() => setEntryTaskId(t.$id)}
                      >
                        <Text
                          style={[
                            styles.projectPickerText,
                            active && styles.projectPickerTextActive,
                          ]}
                        >
                          {t.code || t.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={styles.fieldLabel}>Date</Text>
                <TextInput
                  style={styles.input}
                  value={entryDate}
                  onChangeText={setEntryDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                />

                <Text style={styles.fieldLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={entryTitle}
                  onChangeText={setEntryTitle}
                  placeholder="What did you work on?"
                  placeholderTextColor="#9ca3af"
                />

                <Text style={styles.fieldLabel}>Start Time</Text>
                <Pressable onPress={() => openTimePicker('start')}>
                  <View style={styles.input}>
                    <Text style={entryStartTime ? styles.inputText : styles.inputPlaceholder}>
                      {entryStartTime ? formatTimeLabel(entryStartTime) : 'HH:MM AM/PM'}
                    </Text>
                  </View>
                </Pressable>

                <Text style={styles.fieldLabel}>End Time</Text>
                <Pressable onPress={() => openTimePicker('end')}>
                  <View style={styles.input}>
                    <Text style={entryEndTime ? styles.inputText : styles.inputPlaceholder}>
                      {entryEndTime ? formatTimeLabel(entryEndTime) : 'HH:MM AM/PM'}
                    </Text>
                  </View>
                </Pressable>

                <Text style={styles.fieldLabel}>Hours</Text>
                <TextInput
                  style={styles.input}
                  value={entryHours}
                  onChangeText={setEntryHours}
                  keyboardType="numeric"
                  placeholder="e.g. 2.5"
                  placeholderTextColor="#9ca3af"
                />

                <View style={styles.switchRow}>
                  <Text style={styles.fieldLabel}>Billable</Text>
                  <Switch
                    value={entryBillable}
                    onValueChange={setEntryBillable}
                    thumbColor={entryBillable ? '#0f766e' : '#f9fafb'}
                    trackColor={{ true: '#a7f3d0', false: '#e5e7eb' }}
                  />
                </View>

                <Text style={styles.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  style={styles.textArea}
                  value={entryNotes}
                  onChangeText={setEntryNotes}
                  placeholder="Details or reference"
                  placeholderTextColor="#9ca3af"
                  multiline
                  textAlignVertical="top"
                />
              </ScrollView>

              <View style={styles.modalButtonsRow}>
                <Pressable
                  style={styles.modalCancelButton}
                  disabled={submitting}
                  onPress={() => setShowEntryModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.modalPrimaryButton}
                  disabled={submitting}
                  onPress={saveEntry}
                >
                  <Text style={styles.modalPrimaryText}>
                    {submitting ? 'Saving…' : 'Save Entry'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {activeTimePicker && timePickerValue && (
          <DateTimePicker
            value={timePickerValue}
            mode="time"
            // Let the OS show AM/PM where appropriate
            is24Hour={false}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleTimePicked}
          />
        )}

        <PmsBottomNav />
      </ThemedView>
    </SafeAreaView>
  );
}

function getWeekStartISO(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return toInputDate(d);
}

function getWeekEndISO(date: Date) {
  const start = new Date(getWeekStartISO(date));
  start.setDate(start.getDate() + 6);
  return toInputDate(start);
}

function toInputDate(d: Date) {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeLabel(value: string) {
  // value expected as "HH:MM" in 24h, show as localized 12h with AM/PM where applicable
  const date = new Date(`1970-01-01T${value}`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  weekNavRow: {
    flexDirection: 'row',
    gap: 4,
  },
  weekNavButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '600',
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
  summaryCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: '47%',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryCardLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  summaryCardValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  submitButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0f766e',
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  unsubmitButton: {
    backgroundColor: '#e5e7eb',
  },
  unsubmitButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  awaitingText: {
    flex: 1,
    fontSize: 11,
    color: '#6b7280',
  },
  entriesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  entriesTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  addEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0f766e',
  },
  addEntryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
  entryCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  entryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  entryTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  entryMeta: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  entryFooterRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginBottom: 2,
  },
  entryHoursBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
  },
  entryHoursText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
  },
  entryBillableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
  },
  entryBillableText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#047857',
  },
  entryNotes: {
    marginTop: 2,
    fontSize: 11,
    color: '#4b5563',
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
    marginBottom: 8,
  },
  fieldLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  inputText: {
    fontSize: 13,
    color: '#111827',
  },
  inputPlaceholder: {
    fontSize: 13,
    color: '#9ca3af',
  },
  textArea: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
    minHeight: 70,
  },
  switchRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectPickerRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  projectPickerChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  projectPickerChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  projectPickerText: {
    fontSize: 11,
    color: '#374151',
  },
  projectPickerTextActive: {
    color: '#ffffff',
    fontWeight: '600',
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
    backgroundColor: '#0f766e',
  },
  modalPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});

