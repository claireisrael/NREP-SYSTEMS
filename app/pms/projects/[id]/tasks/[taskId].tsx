import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { PmsBottomNav } from '@/components/PmsBottomNav';
import { PMS_COLLECTIONS, PMS_DB_ID, pmsDatabases, Query } from '@/lib/appwrite';
import { useAuth } from '@/context/AuthContext';

type TaskDoc = {
  $id: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  status: string;
  estimatedHours?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  milestoneId?: string | null;
  assignedTo?: string[];
  createdBy?: string;
};

type Milestone = {
  $id: string;
  name: string;
  startDate?: string | null;
  dueDate?: string | null;
};

type ProjectDoc = {
  $id: string;
  name: string;
  code?: string;
  startDate?: string | null;
  endDate?: string | null;
};

type Member = {
  accountId: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
};

const statusLabels: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
};

const priorityLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export default function TaskDetailScreen() {
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [task, setTask] = useState<TaskDoc | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [formMilestoneId, setFormMilestoneId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [formStatus, setFormStatus] = useState<'todo' | 'in_progress' | 'blocked' | 'done'>('todo');
  const [formEstimatedHours, setFormEstimatedHours] = useState<string>('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState<string[]>([]);

  useEffect(() => {
    if (!id || !taskId) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [projectDoc, taskDoc, milestonesRes] = await Promise.all([
          pmsDatabases.getDocument(PMS_DB_ID, PMS_COLLECTIONS.PROJECTS, String(id)),
          pmsDatabases.getDocument(PMS_DB_ID, PMS_COLLECTIONS.TASKS, String(taskId)),
          pmsDatabases.listDocuments(PMS_DB_ID, PMS_COLLECTIONS.MILESTONES, [
            Query.equal('projectId', String(id)),
            Query.orderAsc('startDate'),
          ]),
        ]);

        const proj: any = projectDoc;
        const t: any = taskDoc;

        setProject({
          $id: proj.$id,
          name: proj.name,
          code: proj.code,
          startDate: proj.startDate,
          endDate: proj.endDate,
        });

        const mappedTask: TaskDoc = {
          $id: t.$id,
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: t.status,
          estimatedHours: t.estimatedHours,
          startDate: t.startDate,
          dueDate: t.dueDate,
          milestoneId: t.milestoneId,
          assignedTo: t.assignedTo || [],
          createdBy: t.createdBy,
        };

        setTask(mappedTask);

        setMilestones(milestonesRes.documents as any);

        // Initialize edit form state from task values
        setFormMilestoneId((mappedTask.milestoneId as string) || '');
        setFormTitle(mappedTask.title || '');
        setFormDescription((mappedTask.description as string) || '');
        setFormPriority(
          ((mappedTask.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium') as any,
        );
        setFormStatus(
          ((mappedTask.status as 'todo' | 'in_progress' | 'blocked' | 'done') || 'todo') as any,
        );
        setFormEstimatedHours(
          typeof mappedTask.estimatedHours === 'number'
            ? String(mappedTask.estimatedHours)
            : '',
        );
        setFormStartDate((mappedTask.startDate as string) || '');
        setFormDueDate((mappedTask.dueDate as string) || '');
        setFormAssignedTo(mappedTask.assignedTo || []);

        if (t.milestoneId) {
          try {
            const mDoc: any = await pmsDatabases.getDocument(
              PMS_DB_ID,
              PMS_COLLECTIONS.MILESTONES,
              t.milestoneId,
            );
            setMilestone({
              $id: mDoc.$id,
              name: mDoc.name,
              startDate: mDoc.startDate,
              dueDate: mDoc.dueDate,
            });
          } catch {
            // ignore milestone load errors – task still shows
          }
        }

        // Load project members via same API as web
        try {
          const PMS_WEB_BASE_URL = 'https://projects.nrep.ug';
          const res = await fetch(
            `${PMS_WEB_BASE_URL}/api/projects/${encodeURIComponent(String(id))}/members`,
          );
          const data = await res.json();
          if (res.ok) {
            setMembers((data.members || []) as Member[]);
          }
        } catch {
          // ignore member load errors
        }
      } catch (err: any) {
        console.error('Failed to load task detail', err);
        setError(err?.message || 'Failed to load task.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, taskId]);

  const assignedMembers = useMemo(() => {
    if (!task || !task.assignedTo || task.assignedTo.length === 0) return [];
    const setIds = new Set(task.assignedTo);
    return members.filter((m) => setIds.has(m.accountId));
  }, [task, members]);

  const loweredStatus = (task?.status || '').toLowerCase();
  const statusPillStyles: any[] = [styles.statusPill];
  if (loweredStatus === 'todo') statusPillStyles.push(styles.statusTodo);
  else if (loweredStatus === 'in_progress') statusPillStyles.push(styles.statusInProgress);
  else if (loweredStatus === 'blocked') statusPillStyles.push(styles.statusBlocked);
  else if (loweredStatus === 'done') statusPillStyles.push(styles.statusDone);

  if (!id || !taskId) {
    return null;
  }

  const canEdit = !!user?.isAdmin;

  const handleQuickStatusUpdate = async (newStatus: TaskDoc['status']) => {
    if (!task) return;

    try {
      setUpdatingStatus(true);

      await pmsDatabases.updateDocument(PMS_DB_ID, PMS_COLLECTIONS.TASKS, String(taskId), {
        status: newStatus,
      });

      setTask((prev) => (prev ? { ...prev, status: newStatus } : prev));
      setShowStatusMenu(false);
    } catch (err: any) {
      console.error('Failed to update task status', err);
      alert(err?.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleToggleEditAssignment = (memberId: string) => {
    setFormAssignedTo((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  };

  const handleSaveEdits = async () => {
    if (!task) return;

    if (!formTitle.trim()) {
      alert('Task title is required.');
      return;
    }

    const estimated = parseFloat(formEstimatedHours || '0') || 0;

    try {
      setSubmitting(true);

      await pmsDatabases.updateDocument(PMS_DB_ID, PMS_COLLECTIONS.TASKS, String(taskId), {
        milestoneId: formMilestoneId || null,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        priority: formPriority,
        status: formStatus,
        estimatedHours: estimated,
        startDate: formStartDate || null,
        dueDate: formDueDate || null,
        assignedTo: formAssignedTo,
      });

      setTask((prev) =>
        prev
          ? {
              ...prev,
              milestoneId: formMilestoneId || null,
              title: formTitle.trim(),
              description: formDescription.trim() || null,
              priority: formPriority,
              status: formStatus,
              estimatedHours: estimated,
              startDate: formStartDate || null,
              dueDate: formDueDate || null,
              assignedTo: [...formAssignedTo],
            }
          : prev,
      );

      // Update linked milestone if changed
      const newMilestone = milestones.find((m) => m.$id === formMilestoneId);
      setMilestone(newMilestone || null);

      setEditing(false);
    } catch (err: any) {
      console.error('Failed to save task edits', err);
      alert(err?.message || 'Failed to save changes.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#111827" />
            </Pressable>
            <View style={styles.headerTextBlock}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {task?.title || 'Task'}
              </Text>
              {project && (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {project.code ? `${project.code} · ` : ''}
                  {project.name}
                  {milestone && (
                    <Text style={styles.headerSubtitleInline}>
                      {'  •  Activity Schedule: '}
                      <Text style={styles.headerSubtitleStrong}>{milestone.name}</Text>
                    </Text>
                  )}
                </Text>
              )}
            </View>
          </View>

          {task && (
            <View style={styles.headerActions}>
              {canEdit && (
                <View style={styles.headerButtonsRow}>
                  <Pressable
                    style={styles.statusUpdateButton}
                    onPress={() => setShowStatusMenu(true)}
                    disabled={updatingStatus || editing}
                  >
                    <MaterialCommunityIcons
                      name="refresh"
                      size={14}
                      color="#ffffff"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.statusUpdateButtonText}>
                      {updatingStatus ? 'Updating…' : 'Update Status'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={16} color="#ffffff" />
                  </Pressable>

                  <Pressable
                    style={styles.editButton}
                    onPress={() => setEditing((prev) => !prev)}
                    disabled={submitting || updatingStatus}
                  >
                    <MaterialCommunityIcons
                      name="pencil-outline"
                      size={14}
                      color="#054653"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.editButtonText}>{editing ? 'Cancel' : 'Edit'}</Text>
                  </Pressable>
                </View>
              )}

              {task && (
                <View style={statusPillStyles}>
                  <Text style={styles.statusPillText}>
                    {statusLabels[loweredStatus] || task.status}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color="#0f766e" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : !task ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Task not found.</Text>
          </View>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
            {/* Overview card */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Overview</Text>

              {editing ? (
                <>
                  <Text style={styles.fieldLabel}>Activity Schedule</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.milestoneChipsRow}
                  >
                    <Pressable
                      style={[
                        styles.milestoneChip,
                        !formMilestoneId && styles.milestoneChipActive,
                      ]}
                      onPress={() => setFormMilestoneId('')}
                    >
                      <Text
                        style={[
                          styles.milestoneChipText,
                          !formMilestoneId && styles.milestoneChipTextActive,
                        ]}
                      >
                        No activity schedule
                      </Text>
                    </Pressable>
                    {milestones.map((m) => {
                      const active = formMilestoneId === m.$id;
                      return (
                        <Pressable
                          key={m.$id}
                          style={[styles.milestoneChip, active && styles.milestoneChipActive]}
                          onPress={() => setFormMilestoneId(m.$id)}
                        >
                          <Text
                            style={[
                              styles.milestoneChipText,
                              active && styles.milestoneChipTextActive,
                            ]}
                          >
                            {m.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <Text style={styles.fieldLabel}>Title</Text>
                  <TextInput
                    style={styles.input}
                    value={formTitle}
                    onChangeText={setFormTitle}
                    placeholder="Task title"
                    placeholderTextColor="#9ca3af"
                  />

                  <Text style={styles.fieldLabel}>Description</Text>
                  <TextInput
                    style={styles.textArea}
                    value={formDescription}
                    onChangeText={setFormDescription}
                    placeholder="Task description (optional)"
                    placeholderTextColor="#9ca3af"
                    multiline
                    textAlignVertical="top"
                  />
                </>
              ) : (
                <>
                  {task.description ? (
                    <Text style={styles.descriptionText}>{task.description}</Text>
                  ) : (
                    <Text style={styles.placeholderText}>No description provided.</Text>
                  )}
                </>
              )}

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Priority</Text>
                {editing ? (
                  <View style={styles.priorityRow}>
                    {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                      <Pressable
                        key={p}
                        style={[
                          styles.priorityChip,
                          formPriority === p && styles.priorityChipActive,
                        ]}
                        onPress={() => setFormPriority(p)}
                      >
                        <Text
                          style={[
                            styles.priorityChipText,
                            formPriority === p && styles.priorityChipTextActive,
                          ]}
                        >
                          {priorityLabels[p]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  (() => {
                    const pr = (task.priority || 'medium').toLowerCase();
                    return (
                      <View
                        style={[
                          styles.priorityPill,
                          pr === 'low' && styles.priorityPillLow,
                          pr === 'medium' && styles.priorityPillMedium,
                          pr === 'high' && styles.priorityPillHigh,
                          pr === 'critical' && styles.priorityPillCritical,
                        ]}
                      >
                        <Text
                          style={[
                            styles.priorityPillText,
                            pr === 'critical' && styles.priorityPillTextOnDark,
                          ]}
                        >
                          {priorityLabels[pr] || 'Medium'}
                        </Text>
                      </View>
                    );
                  })()
                )}
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Estimated Hours</Text>
                {editing ? (
                  <TextInput
                    style={[styles.input, { maxWidth: 100 }]}
                    value={formEstimatedHours}
                    onChangeText={setFormEstimatedHours}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                  />
                ) : (
                  <Text style={styles.metaValue}>
                    {typeof task.estimatedHours === 'number' ? `${task.estimatedHours}h` : '-'}
                  </Text>
                )}
              </View>
            </View>

            {/* Activity schedule / Timeline card */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Timeline</Text>
              {milestone ? (
                <>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Activity Schedule</Text>
                    <Text style={styles.metaValue}>{milestone.name}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Milestone</Text>
                    <Text style={styles.metaValue}>
                      {milestone.startDate && milestone.dueDate
                        ? `${new Date(milestone.startDate).toLocaleDateString()} - ${new Date(
                            milestone.dueDate,
                          ).toLocaleDateString()}`
                        : 'Dates not set'}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.placeholderText}>
                  This task is not linked to a specific activity schedule.
                </Text>
              )}

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Task Dates</Text>
                {editing ? (
                  <View style={styles.datesRow}>
                    <TextInput
                      style={[styles.input, styles.dateInput]}
                      value={formStartDate}
                      onChangeText={setFormStartDate}
                      placeholder="Start (YYYY-MM-DD)"
                      placeholderTextColor="#9ca3af"
                    />
                    <TextInput
                      style={[styles.input, styles.dateInput]}
                      value={formDueDate}
                      onChangeText={setFormDueDate}
                      placeholder="Due (YYYY-MM-DD)"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                ) : (
                  <Text style={styles.metaValue}>
                    {task.startDate && task.dueDate
                      ? `${new Date(task.startDate).toLocaleDateString()} - ${new Date(
                          task.dueDate,
                        ).toLocaleDateString()}`
                      : task.startDate
                      ? `From ${new Date(task.startDate).toLocaleDateString()}`
                      : task.dueDate
                      ? `Due ${new Date(task.dueDate).toLocaleDateString()}`
                      : '-'}
                  </Text>
                )}
              </View>
            </View>

            {/* Assignees card */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Assignees</Text>
              {editing ? (
                <>
                  {members.map((m) => {
                    const checked = formAssignedTo.includes(m.accountId);
                    return (
                      <Pressable
                        key={m.accountId}
                        style={styles.assigneeRow}
                        onPress={() => handleToggleEditAssignment(m.accountId)}
                      >
                        <View style={styles.checkboxOuter}>
                          {checked && <View style={styles.checkboxInner} />}
                        </View>
                        <View style={styles.assigneeInfo}>
                          <Text style={styles.assigneeName}>
                            {m.firstName} {m.lastName}
                          </Text>
                          <Text style={styles.assigneeSubtitle}>
                            @{m.username} · {m.email}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  {members.length === 0 && (
                    <Text style={styles.placeholderText}>
                      No project team members available to assign.
                    </Text>
                  )}
                </>
              ) : assignedMembers.length === 0 ? (
                <Text style={styles.placeholderText}>No team members assigned yet.</Text>
              ) : (
                assignedMembers.map((m) => (
                  <View key={m.accountId} style={styles.assigneeRow}>
                    <View style={styles.assigneeAvatar}>
                      <MaterialCommunityIcons
                        name="account-circle"
                        size={26}
                        color="#054653"
                      />
                    </View>
                    <View style={styles.assigneeInfo}>
                      <Text style={styles.assigneeName}>
                        {m.firstName} {m.lastName}
                      </Text>
                      <Text style={styles.assigneeSubtitle}>
                        @{m.username} · {m.email}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {editing && (
              <View style={styles.footerButtonsRow}>
                <Pressable
                  style={styles.footerCancelButton}
                  onPress={() => setEditing(false)}
                  disabled={submitting}
                >
                  <Text style={styles.footerCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.footerSaveButton}
                  onPress={handleSaveEdits}
                  disabled={submitting}
                >
                  <Text style={styles.footerSaveText}>
                    {submitting ? 'Saving…' : 'Save Changes'}
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        )}

        {showStatusMenu && (
          <Pressable
            style={styles.statusMenuOverlay}
            onPress={() => !updatingStatus && setShowStatusMenu(false)}
          >
            <View style={styles.statusMenu}>
              <Text style={styles.statusMenuHeader}>Change Status To:</Text>

              <Pressable
                style={styles.statusMenuItem}
                onPress={() => handleQuickStatusUpdate('todo')}
              >
                <MaterialCommunityIcons
                  name="circle-outline"
                  size={14}
                  color="#6b7280"
                  style={styles.statusMenuIcon}
                />
                <Text style={styles.statusMenuItemText}>To Do</Text>
              </Pressable>

              <Pressable
                style={styles.statusMenuItem}
                onPress={() => handleQuickStatusUpdate('in_progress')}
              >
                <MaterialCommunityIcons
                  name="progress-clock"
                  size={14}
                  color="#0f766e"
                  style={styles.statusMenuIcon}
                />
                <Text style={styles.statusMenuItemText}>In Progress</Text>
              </Pressable>

              <Pressable
                style={styles.statusMenuItem}
                onPress={() => handleQuickStatusUpdate('blocked')}
              >
                <MaterialCommunityIcons
                  name="close-octagon-outline"
                  size={14}
                  color="#b91c1c"
                  style={styles.statusMenuIcon}
                />
                <Text style={styles.statusMenuItemText}>Blocked</Text>
              </Pressable>

              <View style={styles.statusMenuDivider} />

              <Pressable
                style={styles.statusMenuItem}
                onPress={() => handleQuickStatusUpdate('done')}
              >
                <MaterialCommunityIcons
                  name="check-circle"
                  size={14}
                  color="#16a34a"
                  style={styles.statusMenuIcon}
                />
                <Text style={styles.statusMenuItemText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        )}

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
  },
  headerRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  headerSubtitleInline: {
    fontSize: 12,
    color: '#6b7280',
  },
  headerSubtitleStrong: {
    fontWeight: '600',
    color: '#0f172a',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  statusTodo: {
    backgroundColor: '#f1f5f9',
  },
  statusInProgress: {
    backgroundColor: '#ecfdf5',
  },
  statusBlocked: {
    backgroundColor: '#fee2e2',
  },
  statusDone: {
    backgroundColor: '#dcfce7',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  statusUpdateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#054653',
    marginRight: 4,
  },
  statusUpdateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    marginRight: 2,
  },
  statusMenu: {
    width: '90%',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    paddingVertical: 8,
  },
  statusMenuHeader: {
    fontSize: 11,
    color: '#6b7280',
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  statusMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusMenuIcon: {
    marginRight: 6,
  },
  statusMenuItemText: {
    fontSize: 13,
    color: '#111827',
  },
  statusMenuDivider: {
    marginVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  statusMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 80,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e0f2fe', // faint PMS accent border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  metaLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  assigneeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  assigneeInfo: {
    flex: 1,
  },
  assigneeName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  assigneeSubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  fieldLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
    marginBottom: 4,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  textArea: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
    minHeight: 80,
  },
  priorityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  priorityChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  priorityChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  priorityChipText: {
    fontSize: 12,
    color: '#374151',
  },
  priorityChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  priorityPillLow: {
    backgroundColor: '#e0f2fe',
  },
  priorityPillMedium: {
    backgroundColor: '#fef3c7',
  },
  priorityPillHigh: {
    backgroundColor: '#fee2e2',
  },
  priorityPillCritical: {
    backgroundColor: '#b91c1c',
  },
  priorityPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#054653',
  },
  priorityPillTextOnDark: {
    color: '#ffffff',
  },
  datesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  dateInput: {
    flex: 1,
  },
  checkboxOuter: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxInner: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#0f766e',
  },
  footerButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  footerCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  footerCancelText: {
    fontSize: 13,
    color: '#374151',
  },
  footerSaveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#054653',
  },
  footerSaveText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#054653',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
  },
});

