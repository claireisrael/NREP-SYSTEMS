import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
// DateTimePicker is provided by @react-native-community/datetimepicker – install via:
// npx expo install @react-native-community/datetimepicker
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DateTimePicker = require('@react-native-community/datetimepicker').default;
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { PmsBottomNav } from '@/components/PmsBottomNav';
import { PMS_COLLECTIONS, PMS_DB_ID, pmsDatabases, Query, ID, Permission, Role } from '@/lib/appwrite';
import { useAuth } from '@/context/AuthContext';

type Project = {
  $id: string;
  name: string;
  code?: string;
  clientName?: string;
  status?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  projectTeamId?: string;
  organizationId?: string;
};

type Task = {
  $id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  estimatedHours?: number;
};

type TeamMember = {
  accountId: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  projectRoles?: string[];
  roles?: string[];
  membershipId?: string;
};

type StaffMember = {
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

const projectRoleLabels: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  contributor: 'Contributor',
  viewer: 'Viewer',
  client_rep: 'Client Representative',
  lead: 'Lead',
  developer: 'Developer',
  designer: 'Designer',
  qa: 'QA',
  member: 'Member',
};

const projectRoleBadgeColors: Record<string, string> = {
  owner: '#0f766e',
  manager: '#f97316',
  contributor: '#4b5563',
  viewer: '#e5e7eb',
  client_rep: '#2563eb',
  lead: '#0ea5e9',
  developer: '#22c55e',
  designer: '#eab308',
  qa: '#a855f7',
  member: '#e5e7eb',
};

// Web PMS origin – matches the browser origin used on the web app
const PMS_WEB_BASE_URL = 'https://projects.nrep.ug';

const formatDateInput = (d: Date) => {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PmsProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const isAdmin = !!user?.isAdmin;
  const isSupervisor = !!user?.isSupervisor && !user?.isAdmin;
  const canCreateTask = isAdmin || isSupervisor;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high' | 'critical'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [activeTab, setActiveTab] = useState<'overview' | 'team' | 'tasks' | 'activity'>('tasks');
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamRoleFilter, setTeamRoleFilter] = useState<
    'all' | 'manager' | 'lead' | 'developer' | 'designer' | 'qa' | 'member'
  >('all');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>(
    'medium',
  );
  const [newTaskStatus, setNewTaskStatus] = useState<'todo' | 'in_progress' | 'blocked' | 'done'>(
    'todo',
  );
  const [newTaskEstimatedHours, setNewTaskEstimatedHours] = useState<string>('');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState<string[]>([]);
  const [newTaskSubmitting, setNewTaskSubmitting] = useState(false);
  const [newTaskMilestoneId, setNewTaskMilestoneId] = useState<string>('');
  const [milestones, setMilestones] = useState<any[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [milestoneSearch, setMilestoneSearch] = useState('');
  const [milestoneStatusFilter, setMilestoneStatusFilter] = useState<
    'all' | 'open' | 'reached' | 'closed'
  >('all');
  const [showNewMilestoneModal, setShowNewMilestoneModal] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneDescription, setNewMilestoneDescription] = useState('');
  const [newMilestoneStatus, setNewMilestoneStatus] = useState<'open' | 'reached' | 'closed'>(
    'open',
  );
  const [newMilestoneStart, setNewMilestoneStart] = useState('');
  const [newMilestoneDue, setNewMilestoneDue] = useState('');
  const [newMilestoneSubmitting, setNewMilestoneSubmitting] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [availableStaffLoading, setAvailableStaffLoading] = useState(false);
  const [availableStaffError, setAvailableStaffError] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedMemberRoles, setSelectedMemberRoles] = useState<string[]>(['member']);
  const [showMilestonePicker, setShowMilestonePicker] = useState(false);
  const [activeDatePicker, setActiveDatePicker] = useState<
    'start' | 'due' | 'milestoneStart' | 'milestoneDue' | null
  >(null);
  const [datePickerValue, setDatePickerValue] = useState<Date | null>(null);

  useEffect(() => {
    // If the user is no longer authenticated (e.g. after logout), leave this screen.
    if (!user) {
      router.replace('/pms');
      return;
    }

    if (!id) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setMilestonesLoading(true);

        const [projectDoc, tasksRes, milestonesRes] = await Promise.all([
          pmsDatabases.getDocument(PMS_DB_ID, PMS_COLLECTIONS.PROJECTS, String(id)),
          pmsDatabases.listDocuments(PMS_DB_ID, PMS_COLLECTIONS.TASKS, [
            Query.equal('projectId', String(id)),
            Query.orderAsc('dueDate'),
          ]),
          pmsDatabases.listDocuments(PMS_DB_ID, PMS_COLLECTIONS.MILESTONES, [
            Query.equal('projectId', String(id)),
            Query.orderAsc('startDate'),
          ]),
        ]);

        const p: any = projectDoc;
        setProject({
          $id: p.$id,
          name: p.name,
          code: p.code,
          clientName: p.clientName,
          status: p.status,
          description: p.description,
          startDate: p.startDate,
          endDate: p.endDate,
          budgetAmount:
            typeof p.budgetAmount === 'number' ? p.budgetAmount : undefined,
          budgetCurrency: p.budgetCurrency,
          projectTeamId: p.projectTeamId,
          organizationId: p.organizationId,
        });

        setMilestones(milestonesRes.documents as any[]);

        const mappedTasks: Task[] = (tasksRes.documents as any[]).map((t) => ({
          $id: t.$id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          estimatedHours: t.estimatedHours,
        }));

        setTasks(mappedTasks);
      } catch (err: any) {
        console.error('Failed to load project detail', err);
        setError(err?.message || 'Failed to load project.');
      } finally {
        setLoading(false);
        setMilestonesLoading(false);
      }
    };

    load();
  }, [id, user]);

  const loadTeam = useCallback(async () => {
    if (!id) return;

    try {
      setTeamLoading(true);
      setTeamError(null);

      const res = await fetch(
        `${PMS_WEB_BASE_URL}/api/projects/${encodeURIComponent(String(id))}/members`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load team members.');
      }

      setTeam((data.members || []) as TeamMember[]);
    } catch (err: any) {
      console.error('Failed to load project team', err);
      setTeamError(err?.message || 'Failed to load project team.');
    } finally {
      setTeamLoading(false);
    }
  }, [id]);

  // Load team members using the same API + origin as the web app
  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const filteredTeam = useMemo(() => {
    const term = teamSearch.trim().toLowerCase();

    return team.filter((member) => {
      if (teamRoleFilter !== 'all') {
        if (!member.projectRoles || !member.projectRoles.includes(teamRoleFilter)) {
          return false;
        }
      }

      if (!term) return true;

      const fullName = `${member.firstName || ''} ${member.lastName || ''}`.toLowerCase();
      const username = (member.username || '').toLowerCase();
      const email = (member.email || '').toLowerCase();

      return (
        fullName.includes(term) ||
        username.includes(term) ||
        email.includes(term)
      );
    });
  }, [team, teamSearch, teamRoleFilter]);

  const teamRoleStats = useMemo(
    () => ({
      total: team.length,
      manager: team.filter((m) => m.projectRoles?.includes('manager')).length,
      lead: team.filter((m) => m.projectRoles?.includes('lead')).length,
      developer: team.filter((m) => m.projectRoles?.includes('developer')).length,
      designer: team.filter((m) => m.projectRoles?.includes('designer')).length,
      qa: team.filter((m) => m.projectRoles?.includes('qa')).length,
    }),
    [team],
  );

  const handleRemoveMember = (member: TeamMember) => {
    if (!member.membershipId || !user?.authUser?.$id || !user.organizationId) {
      return;
    }

    const fullName = `${member.firstName} ${member.lastName}`.trim() || member.username;

    Alert.alert(
      'Remove from Project',
      `Are you sure you want to remove ${fullName} from this project?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const url = `${PMS_WEB_BASE_URL}/api/projects/${encodeURIComponent(
                String(id),
              )}/members?membershipId=${encodeURIComponent(
                member.membershipId!,
              )}&requesterId=${encodeURIComponent(
                user.authUser.$id,
              )}&organizationId=${encodeURIComponent(user.organizationId)}`;

              const res = await fetch(url, { method: 'DELETE' });
              const data = await res.json();

              if (!res.ok) {
                throw new Error(data?.error || 'Failed to remove member from project.');
              }

              setTeam((prev) => prev.filter((m) => m.membershipId !== member.membershipId));
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to remove member from project.');
            }
          },
        },
      ],
    );
  };

  const loadAvailableStaff = useCallback(async () => {
    if (!user?.organizationId) return;

    try {
      setAvailableStaffLoading(true);
      setAvailableStaffError(null);

      const res = await fetch(
        `${PMS_WEB_BASE_URL}/api/staff?organizationId=${encodeURIComponent(user.organizationId)}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load staff list.');
      }

      const staff = (data.staff || []) as StaffMember[];
      const teamIds = new Set(team.map((m) => m.accountId));
      const notInProject = staff.filter((s) => !teamIds.has(s.accountId));

      setAvailableStaff(notInProject);
    } catch (err: any) {
      console.error('Failed to load staff list', err);
      setAvailableStaffError(err?.message || 'Failed to load staff list.');
    } finally {
      setAvailableStaffLoading(false);
    }
  }, [team, user]);

  const handleOpenAddMember = () => {
    if (!user?.isAdmin) return;
    setSelectedStaffId(null);
    setSelectedMemberRoles(['member']);
    setStaffSearch('');
    setShowAddMemberModal(true);
    loadAvailableStaff();
  };

  const toggleMemberRole = (role: string) => {
    setSelectedMemberRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const filteredStaff = useMemo(() => {
    const term = staffSearch.trim().toLowerCase();
    if (!term) return availableStaff;

    return availableStaff.filter((s) => {
      const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
      const username = (s.username || '').toLowerCase();
      const email = (s.email || '').toLowerCase();

      return fullName.includes(term) || username.includes(term) || email.includes(term);
    });
  }, [availableStaff, staffSearch]);

  const handleAddMember = async () => {
    if (!user || !project || !selectedStaffId) {
      return;
    }

    if (selectedMemberRoles.length === 0) {
      Alert.alert('Select roles', 'Please select at least one project role for this member.');
      return;
    }

    try {
      setAvailableStaffLoading(true);

      const res = await fetch(
        `${PMS_WEB_BASE_URL}/api/projects/${encodeURIComponent(String(id))}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: selectedStaffId,
            roles: selectedMemberRoles,
            requesterId: user.authUser.$id,
            organizationId: user.organizationId,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to add staff member.');
      }

      setShowAddMemberModal(false);
      await loadTeam();
    } catch (err: any) {
      console.error('Failed to add staff member', err);
      Alert.alert('Error', err?.message || 'Failed to add staff member.');
    } finally {
      setAvailableStaffLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!project || !user) {
      return;
    }

    if (!newTaskTitle.trim()) {
      Alert.alert('Task title required', 'Please enter a task title.');
      return;
    }

    const estimated = parseFloat(newTaskEstimatedHours || '0') || 0;

    try {
      setNewTaskSubmitting(true);

      await pmsDatabases.createDocument(
        PMS_DB_ID,
        PMS_COLLECTIONS.TASKS,
        ID.unique(),
        {
          projectId: project.$id,
          milestoneId: newTaskMilestoneId || null,
          title: newTaskTitle.trim(),
          description: newTaskDescription.trim() || null,
          priority: newTaskPriority,
          status: newTaskStatus,
          estimatedHours: estimated,
          startDate: newTaskStartDate || null,
          dueDate: newTaskDueDate || null,
          assignedTo: newTaskAssignedTo,
          createdBy: user.authUser.$id,
        },
        [
          Permission.read(Role.team((project.organizationId || user.organizationId) as string)),
          Permission.update(Role.team(project.projectTeamId as string)),
          Permission.delete(Role.label('admin')),
        ],
      );

      setTasks((prev) => [
        {
          $id: `${Date.now()}`,
          title: newTaskTitle.trim(),
          status: newTaskStatus,
          priority: newTaskPriority,
          dueDate: newTaskDueDate || undefined,
          estimatedHours: estimated,
        },
        ...prev,
      ]);

      setShowNewTaskModal(false);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskPriority('medium');
      setNewTaskStatus('todo');
      setNewTaskEstimatedHours('');
      setNewTaskStartDate('');
      setNewTaskDueDate('');
      setNewTaskAssignedTo([]);
    } catch (err: any) {
      console.error('Failed to create task', err);
      Alert.alert('Error', err?.message || 'Failed to create task.');
    } finally {
      setNewTaskSubmitting(false);
    }
  };

  const handleCreateMilestone = async () => {
    if (!project || !user) return;

    if (!newMilestoneName.trim()) {
      Alert.alert('Name required', 'Activity Schedule name is required.');
      return;
    }

    // Basic date validation similar to web
    if (newMilestoneStart && project.startDate) {
      if (new Date(newMilestoneStart) < new Date(project.startDate)) {
        Alert.alert(
          'Invalid start date',
          'Activity Schedule start date cannot be before project start date',
        );
        return;
      }
    }

    if (newMilestoneStart && project.endDate) {
      if (new Date(newMilestoneStart) > new Date(project.endDate)) {
        Alert.alert(
          'Invalid start date',
          'Activity Schedule start date cannot be after project end date',
        );
        return;
      }
    }

    if (newMilestoneDue && project.startDate) {
      if (new Date(newMilestoneDue) < new Date(project.startDate)) {
        Alert.alert(
          'Invalid due date',
          'Activity Schedule due date cannot be before project start date',
        );
        return;
      }
    }

    if (newMilestoneDue && project.endDate) {
      if (new Date(newMilestoneDue) > new Date(project.endDate)) {
        Alert.alert(
          'Invalid due date',
          'Activity Schedule due date cannot be after project end date',
        );
        return;
      }
    }

    if (newMilestoneStart && newMilestoneDue) {
      if (new Date(newMilestoneStart) > new Date(newMilestoneDue)) {
        Alert.alert(
          'Invalid dates',
          'Activity Schedule start date cannot be after due date',
        );
        return;
      }
    }

    try {
      setNewMilestoneSubmitting(true);

      const doc = await pmsDatabases.createDocument(
        PMS_DB_ID,
        PMS_COLLECTIONS.MILESTONES,
        ID.unique(),
        {
          projectId: project.$id,
          name: newMilestoneName.trim(),
          description: newMilestoneDescription.trim() || null,
          status: newMilestoneStatus,
          startDate: newMilestoneStart || null,
          dueDate: newMilestoneDue || null,
          actualDueDate: null,
          components: [],
          createdBy: user.authUser.$id,
        },
        [
          Permission.read(Role.team((project.organizationId || user.organizationId) as string)),
          Permission.update(Role.label('admin')),
          Permission.delete(Role.label('admin')),
        ],
      );

      setMilestones((prev) => [doc, ...prev]);
      setShowNewMilestoneModal(false);
      setNewMilestoneName('');
      setNewMilestoneDescription('');
      setNewMilestoneStart('');
      setNewMilestoneDue('');
      setNewMilestoneStatus('open');
    } catch (err: any) {
      console.error('Failed to create Activity Schedule', err);
      Alert.alert('Error', err?.message || 'Failed to create Activity Schedule.');
    } finally {
      setNewMilestoneSubmitting(false);
    }
  };

  const openDatePicker = (target: 'start' | 'due' | 'milestoneStart' | 'milestoneDue') => {
    const raw =
      target === 'start'
        ? newTaskStartDate
        : target === 'due'
        ? newTaskDueDate
        : target === 'milestoneStart'
        ? newMilestoneStart
        : newMilestoneDue;
    let baseDate: Date;
    if (raw) {
      const parsed = new Date(raw);
      baseDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      baseDate = new Date();
    }
    setActiveDatePicker(target);
    setDatePickerValue(baseDate);
  };

  const handleDatePicked = (_event: any, selectedDate?: Date) => {
    if (!selectedDate) {
      setActiveDatePicker(null);
      return;
    }

    const value = formatDateInput(selectedDate);

    if (activeDatePicker === 'start') {
      setNewTaskStartDate(value);
    } else if (activeDatePicker === 'due') {
      setNewTaskDueDate(value);
    } else if (activeDatePicker === 'milestoneStart') {
      setNewMilestoneStart(value);
    } else if (activeDatePicker === 'milestoneDue') {
      setNewMilestoneDue(value);
    }

    setActiveDatePicker(null);
  };

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tasks.filter((t) => {
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;

      if (!term) return true;

      return `${t.title || ''}`.toLowerCase().includes(term);
    });
  }, [tasks, search, priorityFilter]);

  const statusCounts = useMemo(
    () => ({
      todo: filteredTasks.filter((t) => t.status === 'todo').length,
      in_progress: filteredTasks.filter((t) => t.status === 'in_progress').length,
      blocked: filteredTasks.filter((t) => t.status === 'blocked').length,
      done: filteredTasks.filter((t) => t.status === 'done').length,
    }),
    [filteredTasks],
  );

  const milestoneStats = useMemo(() => {
    const total = milestones.length;
    const open = milestones.filter((m) => m.status === 'open').length;
    const reached = milestones.filter((m) => m.status === 'reached').length;
    const closed = milestones.filter((m) => m.status === 'closed').length;
    return { total, open, reached, closed };
  }, [milestones]);

  const filteredMilestones = useMemo(() => {
    const term = milestoneSearch.trim().toLowerCase();
    return milestones.filter((m) => {
      if (milestoneStatusFilter !== 'all' && m.status !== milestoneStatusFilter) return false;
      if (!term) return true;
      const name = (m.name || '').toLowerCase();
      const description = (m.description || '').toLowerCase();
      return name.includes(term) || description.includes(term);
    });
  }, [milestones, milestoneSearch, milestoneStatusFilter]);

  const loweredStatus = (project?.status || '').toLowerCase();
  const statusStyles: any[] = [styles.statusPill];
  if (loweredStatus === 'active' || loweredStatus === 'planned' || loweredStatus === 'in_progress') {
    statusStyles.push(styles.statusPillActive);
  } else if (loweredStatus === 'completed' || loweredStatus === 'done' || loweredStatus === 'cancelled') {
    statusStyles.push(styles.statusPillCompleted);
  } else if (loweredStatus === 'on_hold') {
    statusStyles.push(styles.statusPillOnHold);
  }

  const renderTask = ({ item }: { item: Task }) => {
    const lowered = (item.status || '').toLowerCase();
    const badgeStyles: any[] = [styles.taskStatusBadge];

    if (lowered === 'todo') {
      badgeStyles.push(styles.taskStatusTodo);
    } else if (lowered === 'in_progress') {
      badgeStyles.push(styles.taskStatusInProgress);
    } else if (lowered === 'blocked') {
      badgeStyles.push(styles.taskStatusBlocked);
    } else if (lowered === 'done') {
      badgeStyles.push(styles.taskStatusDone);
    }

    // Card accent based on status
    const taskCardStyles: any[] = [styles.taskCard];
    if (lowered === 'todo') {
      taskCardStyles.push(styles.taskCardTodo);
    } else if (lowered === 'in_progress') {
      taskCardStyles.push(styles.taskCardInProgress);
    } else if (lowered === 'blocked') {
      taskCardStyles.push(styles.taskCardBlocked);
    } else if (lowered === 'done') {
      taskCardStyles.push(styles.taskCardDone);
    }

    return (
      <Pressable
        style={taskCardStyles}
        onPress={() => router.push(`/pms/projects/${String(id)}/tasks/${item.$id}`)}
      >
        <View style={styles.taskHeaderRow}>
          <Text style={styles.taskTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={badgeStyles}>
            <Text style={styles.taskStatusText}>{statusLabels[lowered] || item.status}</Text>
          </View>
        </View>

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

  const renderTasksEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.tasksEmptyState}>
        <MaterialCommunityIcons name="clipboard-list-outline" size={40} color="#9ca3af" />
        <Text style={styles.tasksEmptyTitle}>
          {search ? 'No tasks found' : 'No tasks yet'}
        </Text>
        <Text style={styles.tasksEmptySubtitle}>
          {search ? 'Try adjusting your search term.' : 'Tasks will appear here for this project.'}
        </Text>
      </View>
    );
  };

  const formattedTimeline =
    project && (project.startDate || project.endDate)
      ? [
          project.startDate &&
            new Date(project.startDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }),
          project.endDate &&
            new Date(project.endDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }),
        ]
          .filter(Boolean)
          .join(' - ')
      : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {loading && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#0f766e" />
              <Text style={styles.loadingText}>Loading project…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && project && (
            <>
              <View style={styles.headerCard}>
                <View style={styles.headerTopRow}>
                  <View style={styles.codeStatusRow}>
                    {project.code && (
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{project.code}</Text>
                      </View>
                    )}
                    {project.status && (
                      <View style={statusStyles}>
                        <Text style={styles.statusText}>
                          {project.status.replace('_', ' ')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <Text style={styles.projectName}>{project.name}</Text>

                <View style={styles.infoTilesRow}>
                  {typeof project.budgetAmount === 'number' && project.budgetAmount > 0 && (
                    <View style={styles.infoTile}>
                      <View style={styles.infoTileHeader}>
                        <MaterialCommunityIcons
                          name="cash-multiple"
                          size={18}
                          color="#054653"
                        />
                        <Text style={styles.infoTileLabel}>Budget</Text>
                      </View>
                      <Text style={styles.infoTileValue}>
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: project.budgetCurrency || 'USD',
                          maximumFractionDigits: 0,
                        }).format(project.budgetAmount)}
                      </Text>
                    </View>
                  )}

                  {formattedTimeline && (
                    <View style={styles.infoTile}>
                      <View style={styles.infoTileHeader}>
                        <MaterialCommunityIcons
                          name="calendar-month-outline"
                          size={18}
                          color="#14B8A6"
                        />
                        <Text style={styles.infoTileLabel}>Timeline</Text>
                      </View>
                      <Text style={styles.infoTileValueSmall}>{formattedTimeline}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Tabs row – mirror web tabs (excluding Documents/Embeds) */}
              <View style={styles.tabsRow}>
                <Text
                  style={[
                    styles.tabItem,
                    activeTab === 'overview' && styles.tabItemActive,
                  ]}
                  onPress={() => setActiveTab('overview')}
                >
                  Overview
                </Text>
                <Text
                  style={[
                    styles.tabItem,
                    activeTab === 'team' && styles.tabItemActive,
                  ]}
                  onPress={() => setActiveTab('team')}
                >
                  Team
                </Text>
                <Text
                  style={[
                    styles.tabItem,
                    activeTab === 'tasks' && styles.tabItemActive,
                  ]}
                  onPress={() => setActiveTab('tasks')}
                >
                  Tasks
                </Text>
                <Text
                  style={[
                    styles.tabItem,
                    activeTab === 'activity' && styles.tabItemActive,
                  ]}
                  onPress={() => setActiveTab('activity')}
                >
                  Activity Schedule
                </Text>
              </View>

              {activeTab === 'tasks' && (
                <>
                  <View style={styles.tasksHeaderRow}>
                    <View style={styles.tasksHeaderLeft}>
                      <Text style={styles.tasksTitle}>Tasks</Text>
                      <View style={styles.tasksBadge}>
                        <Text style={styles.tasksBadgeText}>{filteredTasks.length}</Text>
                      </View>
                    </View>
                    <View style={styles.tasksHeaderRight}>
                      <Text style={styles.viewToggleLabel}>View</Text>
                      <View style={styles.viewToggleGroup}>
                        <Text
                          style={[
                            styles.viewToggleItem,
                            viewMode === 'kanban' && styles.viewToggleItemActive,
                          ]}
                          onPress={() => setViewMode('kanban')}
                        >
                          🗂
                        </Text>
                        <Text
                          style={[
                            styles.viewToggleItem,
                            viewMode === 'list' && styles.viewToggleItemActive,
                          ]}
                          onPress={() => setViewMode('list')}
                        >
                          ☰
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.tasksControlsRow}>
                    <View style={styles.tasksSearchCard}>
                      <MaterialCommunityIcons name="magnify" size={20} color="#6b7280" />
                      <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search tasks"
                        placeholderTextColor="#9ca3af"
                        style={styles.tasksSearchInput}
                      />
                    </View>

                    <View style={styles.tasksFiltersRow}>
                      <View style={styles.priorityPill}>
                        <Text style={styles.priorityLabel}>All Priorities</Text>
                      </View>
                      {canCreateTask && (
                        <Pressable
                          style={styles.newTaskButton}
                          onPress={() => setShowNewTaskModal(true)}
                        >
                          <Text style={styles.newTaskButtonText}>New Task</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

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

                  <FlatList
                    data={filteredTasks}
                    keyExtractor={(item) => item.$id}
                    renderItem={renderTask}
                    ListEmptyComponent={renderTasksEmpty}
                    contentContainerStyle={styles.tasksListContent}
                    scrollEnabled={false}
                    showsVerticalScrollIndicator={false}
                  />
                </>
              )}

              {activeTab === 'overview' && project && (
                <>
                  {/* Project Information card – mirrors web layout in mobile form */}
                  <View style={styles.overviewCard}>
                    <View style={styles.overviewHeaderRow}>
                      <View style={styles.overviewIconCircle}>
                        <MaterialCommunityIcons
                          name="information-outline"
                          size={18}
                          color="#054653"
                        />
                      </View>
                      <Text style={styles.overviewTitle}>Project Information</Text>
                    </View>

                    <View style={styles.overviewRow}>
                      <Text style={styles.overviewLabel}>Project Code</Text>
                      <Text style={styles.overviewValue}>{project.code || '-'}</Text>
                    </View>

                  <View style={styles.overviewRow}>
                    <Text style={styles.overviewLabel}>Status</Text>
                    <View style={styles.overviewStatusPill}>
                      <Text style={styles.overviewStatusText}>
                        {project.status ? project.status.replace('_', ' ') : '-'}
                      </Text>
                    </View>
                  </View>

                    <View style={styles.overviewRow}>
                      <Text style={styles.overviewLabel}>Start Date</Text>
                      <Text style={styles.overviewValue}>
                        {project.startDate
                          ? new Date(project.startDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Not set'}
                      </Text>
                    </View>

                    <View style={styles.overviewRow}>
                      <Text style={styles.overviewLabel}>End Date</Text>
                      <Text style={styles.overviewValue}>
                        {project.endDate
                          ? new Date(project.endDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Not set'}
                      </Text>
                    </View>

                    {project.clientName && (
                      <View style={styles.overviewRow}>
                        <Text style={styles.overviewLabel}>Client</Text>
                        <Text style={styles.overviewValue}>{project.clientName}</Text>
                      </View>
                    )}
                  </View>

                  {/* Budget card */}
                  {typeof project.budgetAmount === 'number' && project.budgetAmount > 0 && (
                    <View style={styles.overviewCard}>
                      <View style={styles.overviewHeaderRow}>
                        <View style={styles.overviewIconCircleBudget}>
                          <MaterialCommunityIcons
                            name="cash-multiple"
                            size={18}
                            color="#054653"
                          />
                        </View>
                        <Text style={styles.overviewTitle}>Budget</Text>
                      </View>

                      <Text style={styles.overviewBudgetValue}>
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: project.budgetCurrency || 'USD',
                          maximumFractionDigits: 0,
                        }).format(project.budgetAmount)}
                      </Text>

                      <Text style={styles.overviewBudgetCurrency}>
                        {project.budgetCurrency || 'USD'}
                      </Text>
                    </View>
                  )}

                  {/* Description card */}
                  {project.description && (
                    <View style={styles.overviewCard}>
                      <View style={styles.overviewHeaderRow}>
                        <View style={styles.overviewIconCircleDescription}>
                          <MaterialCommunityIcons
                            name="file-document-outline"
                            size={18}
                            color="#14B8A6"
                          />
                        </View>
                        <Text style={styles.overviewTitle}>Description</Text>
                      </View>
                      <Text style={styles.overviewDescriptionText}>{project.description}</Text>
                    </View>
                  )}
                </>
              )}

              {activeTab === 'team' && (
                <View style={styles.teamSection}>
                  {/* Header + count */}
                  <View style={styles.teamHeaderRow}>
                    <View style={styles.teamTitleRow}>
                      <Text style={styles.teamTitle}>Project Team</Text>
                      <View style={styles.teamCountBadge}>
                        <Text style={styles.teamCountText}>{filteredTeam.length}</Text>
                      </View>
                    </View>
                {user?.isAdmin && (
                  <Pressable style={styles.teamAddButton} onPress={handleOpenAddMember}>
                    <MaterialCommunityIcons
                      name="account-plus-outline"
                      size={16}
                      color="#ffffff"
                      style={styles.teamAddIcon}
                    />
                    <Text style={styles.teamAddButtonText}>Add Member</Text>
                  </Pressable>
                )}
                  </View>

                  {/* Search + role filter */}
                  <View style={styles.teamControlsRow}>
                    <View style={styles.teamSearchContainer}>
                      <MaterialCommunityIcons
                        name="magnify"
                        size={18}
                        color="#9ca3af"
                        style={styles.teamSearchIcon}
                      />
                      <TextInput
                        placeholder="Search team members"
                        placeholderTextColor="#9ca3af"
                        value={teamSearch}
                        onChangeText={setTeamSearch}
                        style={styles.teamSearchInput}
                      />
                    </View>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.teamFilterChipsRow}
                  >
                    {(['all', 'manager', 'lead', 'developer', 'designer', 'qa', 'member'] as const).map(
                      (roleKey) => (
                        <Pressable
                          key={roleKey}
                          style={[
                            styles.teamFilterChip,
                            teamRoleFilter === roleKey && styles.teamFilterChipActive,
                          ]}
                          onPress={() => setTeamRoleFilter(roleKey)}
                        >
                          <Text
                            style={[
                              styles.teamFilterChipText,
                              teamRoleFilter === roleKey && styles.teamFilterChipTextActive,
                            ]}
                          >
                            {roleKey === 'all' ? 'All roles' : projectRoleLabels[roleKey] || roleKey}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </ScrollView>

                  {/* Role stats row */}
                  <View style={styles.teamStatsRow}>
                    <View style={styles.teamStatCard}>
                      <Text style={styles.teamStatLabel}>Total</Text>
                      <Text style={styles.teamStatValue}>{teamRoleStats.total}</Text>
                    </View>
                    <View style={styles.teamStatCard}>
                      <Text style={styles.teamStatLabel}>Managers</Text>
                      <Text style={styles.teamStatValue}>{teamRoleStats.manager}</Text>
                    </View>
                    <View style={styles.teamStatCard}>
                      <Text style={styles.teamStatLabel}>Leads</Text>
                      <Text style={styles.teamStatValue}>{teamRoleStats.lead}</Text>
                    </View>
                    <View style={styles.teamStatCard}>
                      <Text style={styles.teamStatLabel}>Developers</Text>
                      <Text style={styles.teamStatValue}>{teamRoleStats.developer}</Text>
                    </View>
                  </View>

                  {teamLoading && (
                    <View style={styles.center}>
                      <ActivityIndicator size="small" color="#0f766e" />
                      <Text style={styles.loadingText}>Loading project team…</Text>
                    </View>
                  )}

                  {!teamLoading && teamError && (
                    <View style={styles.placeholderCard}>
                      <Text style={styles.placeholderTitle}>Team</Text>
                      <Text style={styles.placeholderText}>{teamError}</Text>
                    </View>
                  )}

                  {!teamLoading && !teamError && team.length === 0 && (
                    <View style={styles.placeholderCard}>
                      <Text style={styles.placeholderTitle}>Team</Text>
                      <Text style={styles.placeholderText}>
                        No team members are assigned to this project yet.
                      </Text>
                    </View>
                  )}

                  {!teamLoading && !teamError && filteredTeam.length > 0 && (
                    <FlatList
                      data={filteredTeam}
                      keyExtractor={(m) => m.accountId}
                      contentContainerStyle={styles.teamListContent}
                      scrollEnabled={false}
                      renderItem={({ item }) => (
                        <View style={styles.teamCard}>
                          <View style={styles.teamTopRow}>
                            <View style={styles.teamAvatar}>
                              <MaterialCommunityIcons
                                name="account-circle"
                                size={28}
                                color="#054653"
                              />
                            </View>
                            <View style={styles.teamInfo}>
                              <View style={styles.teamHeaderBlock}>
                                <Text style={styles.teamName} numberOfLines={1}>
                                  {item.firstName} {item.lastName}
                                </Text>
                                <Text style={styles.teamUsername} numberOfLines={1}>
                                  @{item.username}
                                </Text>
                                <Text style={styles.teamEmail} numberOfLines={1}>
                                  {item.email}
                                </Text>
                              </View>
                            </View>
                          </View>

                          {item.projectRoles && item.projectRoles.length > 0 && (
                            <View style={styles.teamRolesBlock}>
                              <Text style={styles.teamRolesLabel}>Project Roles</Text>
                              <View style={styles.teamRolesRow}>
                                {item.projectRoles.map((role) => (
                                  <View
                                    key={role}
                                    style={[
                                      styles.roleBadge,
                                      {
                                        backgroundColor:
                                          projectRoleBadgeColors[role] ?? styles.roleBadge.backgroundColor,
                                      },
                                    ]}
                                  >
                                    <Text style={styles.roleBadgeText}>
                                      {projectRoleLabels[role] || role}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          )}

                          {item.roles && item.roles.length > 0 && (
                            <View style={styles.orgRolesBlock}>
                              <Text style={styles.orgRolesLabel}>Organization Roles</Text>
                              <View style={styles.orgRolesRow}>
                                {item.roles.map((role) => (
                                  <View key={role} style={styles.orgRoleBadge}>
                                    <Text style={styles.orgRoleBadgeText}>{role}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          )}

                          {user?.isAdmin && item.membershipId && (
                            <View style={styles.teamRemoveContainer}>
                              <Pressable
                                style={styles.teamRemoveButton}
                                onPress={() => handleRemoveMember(item)}
                              >
                                <MaterialCommunityIcons
                                  name="trash-can-outline"
                                  size={16}
                                  color="#b91c1c"
                                  style={styles.teamRemoveIcon}
                                />
                                <Text style={styles.teamRemoveText}>Remove from Project</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      )}
                    />
                  )}
                </View>
              )}

              {activeTab === 'activity' && (
                <View style={styles.activitySection}>
                  {milestonesLoading ? (
                    <View style={styles.center}>
                      <ActivityIndicator size="small" color="#0f766e" />
                    </View>
                  ) : (
                    <>
                      <View style={styles.activityHeaderRow}>
                        <View style={styles.activityTitleRow}>
                          <Text style={styles.activityTitle}>Activity Schedule</Text>
                          <View style={styles.activityCountBadge}>
                            <Text style={styles.activityCountText}>
                              {filteredMilestones.length}
                            </Text>
                          </View>
                        </View>
                        {user?.isAdmin && (
                          <Pressable
                            style={styles.newActivityButton}
                            onPress={() => setShowNewMilestoneModal(true)}
                          >
                            <MaterialCommunityIcons
                              name="plus-circle-outline"
                              size={16}
                              color="#ffffff"
                              style={{ marginRight: 4 }}
                            />
                            <Text style={styles.newActivityButtonText}>New Activity Schedule</Text>
                          </Pressable>
                        )}
                      </View>

                      <View style={styles.activityControlsRow}>
                        <View style={styles.activitySearchContainer}>
                          <MaterialCommunityIcons
                            name="magnify"
                            size={18}
                            color="#9ca3af"
                            style={styles.activitySearchIcon}
                          />
                          <TextInput
                            placeholder="Search activity schedules"
                            placeholderTextColor="#9ca3af"
                            value={milestoneSearch}
                            onChangeText={setMilestoneSearch}
                            style={styles.activitySearchInput}
                          />
                        </View>
                      </View>

                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.activityFilterChipsRow}
                      >
                        {(['all', 'open', 'reached', 'closed'] as const).map((s) => (
                          <Pressable
                            key={s}
                            style={[
                              styles.activityFilterChip,
                              milestoneStatusFilter === s && styles.activityFilterChipActive,
                            ]}
                            onPress={() => setMilestoneStatusFilter(s)}
                          >
                            <Text
                              style={[
                                styles.activityFilterChipText,
                                milestoneStatusFilter === s && styles.activityFilterChipTextActive,
                              ]}
                            >
                              {s === 'all'
                                ? 'All Status'
                                : s === 'open'
                                ? 'Open'
                                : s === 'reached'
                                ? 'Reached'
                                : 'Closed'}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>

                      <View style={styles.activityStatsRow}>
                        <View style={styles.activityStatCard}>
                          <Text style={styles.activityStatLabel}>Total</Text>
                          <Text style={styles.activityStatValue}>{milestoneStats.total}</Text>
                        </View>
                        <View style={styles.activityStatCard}>
                          <Text style={styles.activityStatLabel}>Open</Text>
                          <Text style={styles.activityStatValue}>{milestoneStats.open}</Text>
                        </View>
                        <View style={styles.activityStatCard}>
                          <Text style={styles.activityStatLabel}>Reached</Text>
                          <Text style={styles.activityStatValue}>{milestoneStats.reached}</Text>
                        </View>
                        <View style={styles.activityStatCard}>
                          <Text style={styles.activityStatLabel}>Closed</Text>
                          <Text style={styles.activityStatValue}>{milestoneStats.closed}</Text>
                        </View>
                      </View>

                      {filteredMilestones.length === 0 ? (
                        <View style={styles.placeholderCard}>
                          <Text style={styles.placeholderTitle}>No Activity Schedules</Text>
                          <Text style={styles.placeholderText}>
                            Try adjusting your search or filter criteria.
                          </Text>
                        </View>
                      ) : (
                        filteredMilestones.map((m) => {
                          const hasDates = m.startDate || m.dueDate;
                          const due = m.dueDate ? new Date(m.dueDate) : null;
                          const isOverdue =
                            !!due &&
                            due < new Date() &&
                            m.status !== 'reached' &&
                            m.status !== 'closed';
                          const statusLower = (m.status || '').toLowerCase();

                          const statusPillStyles: any[] = [styles.activityStatusPill];
                          if (statusLower === 'open') {
                            statusPillStyles.push(styles.activityStatusOpen);
                          } else if (statusLower === 'reached') {
                            statusPillStyles.push(styles.activityStatusReached);
                          } else if (statusLower === 'closed') {
                            statusPillStyles.push(styles.activityStatusClosed);
                          }

                          // Card accent border color based on status / overdue
                          const activityCardStyles: any[] = [styles.activityCard];
                          if (isOverdue) {
                            activityCardStyles.push(styles.activityCardOverdue);
                          } else if (statusLower === 'open') {
                            activityCardStyles.push(styles.activityCardOpen);
                          } else if (statusLower === 'reached') {
                            activityCardStyles.push(styles.activityCardReached);
                          } else if (statusLower === 'closed') {
                            activityCardStyles.push(styles.activityCardClosed);
                          }

                          return (
                            <View key={m.$id} style={activityCardStyles}>
                              <View style={styles.activityCardHeader}>
                                <View style={styles.activityTitleBlock}>
                                  <Text style={styles.activityCardTitle} numberOfLines={1}>
                                    {m.name}
                                  </Text>
                                  {m.description && (
                                    <Text style={styles.activityCardDescription} numberOfLines={2}>
                                      {m.description}
                                    </Text>
                                  )}
                                </View>
                                <View style={statusPillStyles}>
                                  <Text style={styles.activityStatusText}>
                                    {statusLower === 'open'
                                      ? 'Open'
                                      : statusLower === 'reached'
                                      ? 'Reached'
                                      : statusLower === 'closed'
                                      ? 'Closed'
                                      : m.status}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.activityMetaRow}>
                                <View style={styles.activityMetaItem}>
                                  <MaterialCommunityIcons
                                    name="calendar-start"
                                    size={16}
                                    color="#6b7280"
                                  />
                                  <View style={styles.activityMetaTextBlock}>
                                    <Text style={styles.activityMetaLabel}>Start</Text>
                                    <Text style={styles.activityMetaValue}>
                                      {m.startDate
                                        ? new Date(m.startDate).toLocaleDateString()
                                        : '-'}
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.activityMetaItem}>
                                  <MaterialCommunityIcons
                                    name="calendar-end"
                                    size={16}
                                    color={isOverdue ? '#b91c1c' : '#6b7280'}
                                  />
                                  <View style={styles.activityMetaTextBlock}>
                                    <Text style={styles.activityMetaLabel}>Due</Text>
                                    <Text
                                      style={[
                                        styles.activityMetaValue,
                                        isOverdue && { color: '#b91c1c' },
                                      ]}
                                    >
                                      {m.dueDate
                                        ? new Date(m.dueDate).toLocaleDateString()
                                        : '-'}
                                    </Text>
                                  </View>
                                </View>
                              </View>

                              {isOverdue && (
                                <View style={styles.activityOverdueRow}>
                                  <MaterialCommunityIcons
                                    name="alert-circle-outline"
                                    size={14}
                                    color="#b91c1c"
                                    style={{ marginRight: 4 }}
                                  />
                                  <Text style={styles.activityOverdueText}>Overdue</Text>
                                </View>
                              )}
                            </View>
                          );
                        })
                      )}
                    </>
                  )}
                </View>
              )}

            </>
          )}
        </ScrollView>

        {/* New Task modal (admins / supervisors only) */}
        {canCreateTask && (
          <Modal
            transparent
            visible={showNewTaskModal}
            animationType="fade"
            onRequestClose={() => !newTaskSubmitting && setShowNewTaskModal(false)}
          >
          <View style={styles.newTaskModalOverlay}>
            <View style={styles.newTaskModalCard}>
              <Text style={styles.newTaskModalTitle}>New Task</Text>

              {/* Activity schedule section first, like the web */}
              <Text style={styles.newTaskFieldLabel}>Activity Schedule</Text>
              <View style={styles.newTaskFieldWrapper}>
                <Pressable
                  style={styles.newTaskSelect}
                  onPress={() => setShowMilestonePicker(true)}
                >
                  <Text
                    style={
                      newTaskMilestoneId ? styles.newTaskSelectText : styles.newTaskSelectPlaceholder
                    }
                    numberOfLines={2}
                  >
                    {(() => {
                      if (!newTaskMilestoneId) {
                        return 'No Activity Schedule (optional)';
                      }
                      const m = milestones.find((mm) => mm.$id === newTaskMilestoneId);
                      if (!m) return 'No Activity Schedule (optional)';
                      const hasDates = m.startDate && m.dueDate;
                      if (!hasDates) return m.name;
                      return `${m.name} (${new Date(m.startDate).toLocaleDateString()} - ${new Date(
                        m.dueDate,
                      ).toLocaleDateString()})`;
                    })()}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={18}
                    color="#6b7280"
                  />
                </Pressable>
                <Text style={styles.newTaskSmallHint}>
                  Link this task to an activity schedule (optional)
                </Text>
              </View>
              {/* Title & description should come before dates */}
              <Text style={styles.newTaskFieldLabel}>Title</Text>
              <TextInput
                style={styles.newTaskTitleInput}
                placeholder="Task title"
                placeholderTextColor="#9ca3af"
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
              />

              <Text style={styles.newTaskFieldLabel}>Description</Text>
              <TextInput
                style={styles.newTaskDescriptionInput}
                placeholder="Task description (optional)"
                placeholderTextColor="#9ca3af"
                value={newTaskDescription}
                onChangeText={setNewTaskDescription}
                multiline
                textAlignVertical="top"
              />

              {/* Dates + estimate after basic task details */}
              <View style={styles.newTaskDatesRow}>
                <View style={styles.newTaskDateColumn}>
                  <Text style={styles.newTaskFieldLabel}>Start Date</Text>
                  <Pressable onPress={() => openDatePicker('start')}>
                    <TextInput
                      style={styles.newTaskDateInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                      value={newTaskStartDate}
                      editable={false}
                      pointerEvents="none"
                    />
                  </Pressable>
                </View>
                <View style={styles.newTaskDateColumn}>
                  <Text style={styles.newTaskFieldLabel}>Due Date</Text>
                  <Pressable onPress={() => openDatePicker('due')}>
                    <TextInput
                      style={styles.newTaskDateInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                      value={newTaskDueDate}
                      editable={false}
                      pointerEvents="none"
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.newTaskEstimateRow}>
                <Text style={styles.newTaskFieldLabel}>Estimated hours</Text>
                <View style={styles.newTaskEstimateControls}>
                  <Pressable
                    style={styles.newTaskStepButton}
                    onPress={() => {
                      const current = parseFloat(newTaskEstimatedHours || '0') || 0;
                      const next = Math.max(0, current - 0.5);
                      setNewTaskEstimatedHours(next ? String(next) : '');
                    }}
                  >
                    <Text style={styles.newTaskStepButtonText}>-</Text>
                  </Pressable>
                  <TextInput
                    style={styles.newTaskEstimateInput}
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    value={newTaskEstimatedHours}
                    onChangeText={setNewTaskEstimatedHours}
                  />
                  <Pressable
                    style={styles.newTaskStepButton}
                    onPress={() => {
                      const current = parseFloat(newTaskEstimatedHours || '0') || 0;
                      const next = current + 0.5;
                      setNewTaskEstimatedHours(String(next));
                    }}
                  >
                    <Text style={styles.newTaskStepButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.newTaskPriorityRow}>
                <Text style={styles.newTaskPriorityLabel}>Priority</Text>
                {(['low', 'medium', 'high', 'critical'] as const).map((p) => (
                  <Pressable
                    key={p}
                    style={[
                      styles.newTaskPriorityChip,
                      newTaskPriority === p && styles.newTaskPriorityChipActive,
                    ]}
                    onPress={() => setNewTaskPriority(p)}
                  >
                    <Text
                      style={[
                        styles.newTaskPriorityText,
                        newTaskPriority === p && styles.newTaskPriorityTextActive,
                      ]}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.newTaskStatusRow}>
                <Text style={styles.newTaskStatusLabel}>Status</Text>
                {(['todo', 'in_progress', 'blocked', 'done'] as const).map((s) => (
                  <Pressable
                    key={s}
                    style={[
                      styles.newTaskStatusChip,
                      newTaskStatus === s && styles.newTaskStatusChipActive,
                    ]}
                    onPress={() => setNewTaskStatus(s)}
                  >
                    <Text
                      style={[
                        styles.newTaskStatusText,
                        newTaskStatus === s && styles.newTaskStatusTextActive,
                      ]}
                    >
                      {statusLabels[s] || s}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.newTaskAssigneesSection}>
                <Text style={styles.newTaskFieldLabel}>Assign to</Text>
                <Text style={styles.newTaskSmallHint}>
                  Choose one or more project team members to assign this task to.
                </Text>
                <ScrollView style={styles.newTaskAssigneesList}>
                  {team.map((member) => {
                    const checked = newTaskAssignedTo.includes(member.accountId);
                    return (
                      <Pressable
                        key={member.accountId}
                        style={styles.newTaskAssigneeRow}
                        onPress={() => {
                          setNewTaskAssignedTo((prev) =>
                            checked
                              ? prev.filter((id) => id !== member.accountId)
                              : [...prev, member.accountId],
                          );
                        }}
                      >
                        <View style={styles.addMemberRadioOuter}>
                          {checked && <View style={styles.addMemberRadioInner} />}
                        </View>
                        <View style={styles.addMemberInfo}>
                          <Text style={styles.addMemberName}>
                            {member.firstName} {member.lastName}
                          </Text>
                          <Text style={styles.addMemberSubtitle}>
                            @{member.username} · {member.email}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}

                  {team.length === 0 && (
                    <Text style={styles.newTaskSmallHint}>
                      No team members available yet. Add members in the Team tab first.
                    </Text>
                  )}
                </ScrollView>
              </View>
              <View style={styles.newTaskModalButtonsRow}>
                <Pressable
                  style={styles.newTaskCancelButton}
                  disabled={newTaskSubmitting}
                  onPress={() => setShowNewTaskModal(false)}
                >
                  <Text style={styles.newTaskCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.newTaskCreateButton}
                  disabled={newTaskSubmitting}
                  onPress={handleCreateTask}
                >
                  <Text style={styles.newTaskCreateText}>
                    {newTaskSubmitting ? 'Creating…' : 'Create Task'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
          </Modal>
        )}

        {/* Add Member modal */}
        <Modal
          transparent
          visible={showAddMemberModal}
          animationType="fade"
          onRequestClose={() => !availableStaffLoading && setShowAddMemberModal(false)}
        >
          <View style={styles.newTaskModalOverlay}>
            <View style={styles.addMemberModalCard}>
              <Text style={styles.addMemberModalTitle}>Add Project Member</Text>
              <TextInput
                style={styles.addMemberSearchInput}
                placeholder="Search staff by name, username, email"
                placeholderTextColor="#9ca3af"
                value={staffSearch}
                onChangeText={setStaffSearch}
              />

              {availableStaffLoading && (
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator size="small" color="#0f766e" />
                </View>
              )}

              {availableStaffError && !availableStaffLoading && (
                <Text style={{ color: '#b91c1c', fontSize: 12, marginBottom: 4 }}>
                  {availableStaffError}
                </Text>
              )}

              <ScrollView style={styles.addMemberList}>
                {filteredStaff.map((staff) => {
                  const isSelected = selectedStaffId === staff.accountId;
                  return (
                    <Pressable
                      key={staff.accountId}
                      style={styles.addMemberRow}
                      onPress={() => setSelectedStaffId(staff.accountId)}
                    >
                      <View style={styles.addMemberRadioOuter}>
                        {isSelected && <View style={styles.addMemberRadioInner} />}
                      </View>
                      <View style={styles.addMemberInfo}>
                        <Text style={styles.addMemberName}>
                          {staff.firstName} {staff.lastName}
                        </Text>
                        <Text style={styles.addMemberSubtitle}>
                          @{staff.username} · {staff.email}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                {filteredStaff.length === 0 && !availableStaffLoading && (
                  <Text style={{ fontSize: 12, color: '#6b7280', paddingVertical: 8 }}>
                    No available staff found for this project.
                  </Text>
                )}
              </ScrollView>

              <View style={styles.addMemberRolesRow}>
                {['member', 'developer', 'manager', 'lead', 'qa'].map((role) => {
                  const active = selectedMemberRoles.includes(role);
                  return (
                    <Pressable
                      key={role}
                      style={[
                        styles.addMemberRoleChip,
                        active && styles.addMemberRoleChipActive,
                      ]}
                      onPress={() => toggleMemberRole(role)}
                    >
                      <Text
                        style={[
                          styles.addMemberRoleText,
                          active && styles.addMemberRoleTextActive,
                        ]}
                      >
                        {projectRoleLabels[role] || role}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.addMemberButtonsRow}>
                <Pressable
                  style={styles.addMemberCancelButton}
                  disabled={availableStaffLoading}
                  onPress={() => setShowAddMemberModal(false)}
                >
                  <Text style={styles.addMemberCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.addMemberConfirmButton}
                  disabled={availableStaffLoading || !selectedStaffId}
                  onPress={handleAddMember}
                >
                  <Text style={styles.addMemberConfirmText}>
                    {availableStaffLoading ? 'Adding…' : 'Add Member'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* New Activity Schedule modal */}
        <Modal
          transparent
          visible={showNewMilestoneModal}
          animationType="fade"
          onRequestClose={() => !newMilestoneSubmitting && setShowNewMilestoneModal(false)}
        >
          <View style={styles.newTaskModalOverlay}>
            <View style={styles.newTaskModalCard}>
              <Text style={styles.newTaskModalTitle}>New Activity Schedule</Text>

              <Text style={styles.newTaskFieldLabel}>Name</Text>
              <TextInput
                style={styles.newTaskTitleInput}
                placeholder="e.g., Phase 1 Completion"
                placeholderTextColor="#9ca3af"
                value={newMilestoneName}
                onChangeText={setNewMilestoneName}
              />

              <Text style={styles.newTaskFieldLabel}>Description</Text>
              <TextInput
                style={styles.newTaskDescriptionInput}
                placeholder="Description (optional)"
                placeholderTextColor="#9ca3af"
                value={newMilestoneDescription}
                onChangeText={setNewMilestoneDescription}
                multiline
                textAlignVertical="top"
              />

              <View style={styles.newTaskPriorityRow}>
                <Text style={styles.newTaskPriorityLabel}>Status</Text>
                {(['open', 'reached', 'closed'] as const).map((s) => (
                  <Pressable
                    key={s}
                    style={[
                      styles.newTaskPriorityChip,
                      newMilestoneStatus === s && styles.newTaskPriorityChipActive,
                    ]}
                    onPress={() => setNewMilestoneStatus(s)}
                  >
                    <Text
                      style={[
                        styles.newTaskPriorityText,
                        newMilestoneStatus === s && styles.newTaskPriorityTextActive,
                      ]}
                    >
                      {s === 'open' ? 'Open' : s === 'reached' ? 'Reached' : 'Closed'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.newTaskDatesRow}>
                <View style={styles.newTaskDateColumn}>
                  <Text style={styles.newTaskFieldLabel}>Start Date</Text>
                  <Pressable onPress={() => openDatePicker('milestoneStart')}>
                    <View style={styles.newTaskDateInput}>
                      <Text style={styles.newTaskDateText}>
                        {newMilestoneStart || 'YYYY-MM-DD'}
                      </Text>
                    </View>
                  </Pressable>
                </View>
                <View style={styles.newTaskDateColumn}>
                  <Text style={styles.newTaskFieldLabel}>Due Date</Text>
                  <Pressable onPress={() => openDatePicker('milestoneDue')}>
                    <View style={styles.newTaskDateInput}>
                      <Text style={styles.newTaskDateText}>
                        {newMilestoneDue || 'YYYY-MM-DD'}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              <View style={styles.newTaskModalButtonsRow}>
                <Pressable
                  style={styles.newTaskCancelButton}
                  disabled={newMilestoneSubmitting}
                  onPress={() => setShowNewMilestoneModal(false)}
                >
                  <Text style={styles.newTaskCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.newTaskCreateButton}
                  disabled={newMilestoneSubmitting}
                  onPress={handleCreateMilestone}
                >
                  <Text style={styles.newTaskCreateText}>
                    {newMilestoneSubmitting ? 'Creating…' : 'Create Schedule'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          transparent
          visible={showMilestonePicker}
          animationType="fade"
          onRequestClose={() => setShowMilestonePicker(false)}
        >
          <View style={styles.newTaskModalOverlay}>
            <View style={styles.addMemberModalCard}>
              <Text style={styles.addMemberModalTitle}>Select Activity Schedule</Text>
              <ScrollView style={styles.addMemberList}>
                <Pressable
                  style={styles.addMemberRow}
                  onPress={() => {
                    setNewTaskMilestoneId('');
                    setShowMilestonePicker(false);
                  }}
                >
                  <View style={styles.addMemberRadioOuter}>
                    {!newTaskMilestoneId && <View style={styles.addMemberRadioInner} />}
                  </View>
                  <View style={styles.addMemberInfo}>
                    <Text style={styles.addMemberName}>No Activity Schedule (optional)</Text>
                  </View>
                </Pressable>

                {milestones.map((m) => {
                  const active = newTaskMilestoneId === m.$id;
                  const hasDates = m.startDate && m.dueDate;
                  return (
                    <Pressable
                      key={m.$id}
                      style={styles.addMemberRow}
                      onPress={() => {
                        setNewTaskMilestoneId(m.$id);
                        setShowMilestonePicker(false);
                      }}
                    >
                      <View style={styles.addMemberRadioOuter}>
                        {active && <View style={styles.addMemberRadioInner} />}
                      </View>
                      <View style={styles.addMemberInfo}>
                        <Text style={styles.addMemberName}>{m.name}</Text>
                        {hasDates && (
                          <Text style={styles.addMemberSubtitle}>
                            {new Date(m.startDate).toLocaleDateString()} -{' '}
                            {new Date(m.dueDate).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.addMemberButtonsRow}>
                <Pressable
                  style={styles.addMemberCancelButton}
                  onPress={() => setShowMilestonePicker(false)}
                >
                  <Text style={styles.addMemberCancelText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Date picker – inline, triggers native calendar/dialog when active */}
        {activeDatePicker && datePickerValue && (
          <DateTimePicker
            value={datePickerValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDatePicked}
          />
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
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#4b5563',
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
    textAlign: 'center',
  },
  headerCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeBadge: {
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
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#064e3b',
    textTransform: 'capitalize',
  },
  projectName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 8,
  },
  projectDescription: {
    marginTop: 6,
    fontSize: 13,
    color: '#4b5563',
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  clientText: {
    marginLeft: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  infoTilesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  infoTile: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoTileLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  infoTileValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#054653',
  },
  infoTileValueSmall: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  tabItem: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  tabItemActive: {
    color: '#054653',
    borderBottomWidth: 2,
    borderBottomColor: '#054653',
    fontWeight: '600',
  },
  placeholderCard: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  placeholderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 12,
    color: '#6b7280',
  },
  overviewCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  overviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  overviewIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  overviewIconCircleBudget: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  overviewIconCircleDescription: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  overviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  overviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  overviewLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  overviewValue: {
    fontSize: 13,
    color: '#1f2933',
    fontWeight: '500',
    marginLeft: 8,
  },
  overviewStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#dcfce7',
    marginLeft: 8,
  },
  overviewStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    textTransform: 'capitalize',
  },
  overviewBudgetValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#054653',
    marginTop: 4,
  },
  overviewBudgetCurrency: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  overviewDescriptionText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 20,
  },
  tasksHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  tasksHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tasksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  tasksBadge: {
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tasksBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
  },
  tasksHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewToggleLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginRight: 4,
  },
  viewToggleGroup: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    overflow: 'hidden',
  },
  viewToggleItem: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    color: '#6b7280',
  },
  viewToggleItemActive: {
    backgroundColor: '#0f766e',
    color: '#ffffff',
  },
  tasksControlsRow: {
    marginBottom: 8,
  },
  tasksSearchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tasksSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
  },
  tasksFiltersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  priorityPill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  priorityLabel: {
    fontSize: 12,
    color: '#374151',
  },
  newTaskButton: {
    borderRadius: 999,
    backgroundColor: '#054653',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newTaskButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  tasksListContent: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  taskCard: {
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 4,
    borderLeftColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  taskCardTodo: {
    borderLeftColor: '#e5e7eb',
  },
  taskCardInProgress: {
    borderLeftColor: '#0f766e',
  },
  taskCardBlocked: {
    borderLeftColor: '#b91c1c',
  },
  taskCardDone: {
    borderLeftColor: '#16a34a',
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
  tasksEmptyState: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tasksEmptyTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  tasksEmptySubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  teamSection: {
    marginTop: 8,
  },
  teamHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  teamCountBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  teamAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#054653',
  },
  teamAddIcon: {
    marginRight: 4,
  },
  teamAddButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  teamControlsRow: {
    marginBottom: 8,
  },
  teamSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  teamSearchIcon: {
    marginRight: 6,
  },
  teamSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
  },
  teamFilterChipsRow: {
    paddingVertical: 4,
    paddingRight: 4,
    gap: 6,
  },
  teamFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    marginRight: 6,
  },
  teamFilterChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  teamFilterChipText: {
    fontSize: 12,
    color: '#374151',
  },
  teamFilterChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  teamStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  teamStatCard: {
    flexGrow: 1,
    minWidth: '22%',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
  },
  teamStatLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  teamStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  teamListContent: {
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  teamCard: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 0,
    marginBottom: 10,
  },
  teamAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  teamInfo: {
    flex: 1,
  },
  teamTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  teamUsername: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  teamEmail: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  teamHeaderBlock: {
    marginBottom: 6,
  },
  teamRolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  teamRolesBlock: {
    marginTop: 8,
  },
  teamRolesLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  orgRolesBlock: {
    marginTop: 8,
  },
  orgRolesLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  orgRolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  orgRoleBadge: {
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  orgRoleBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#374151',
  },
  teamRemoveContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  teamRemoveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  teamRemoveIcon: {
    marginRight: 6,
  },
  teamRemoveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c',
  },
  activitySection: {
    marginTop: 8,
  },
  activityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  activityCountBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  activityControlsRow: {
    marginBottom: 8,
  },
  activitySearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activitySearchIcon: {
    marginRight: 6,
  },
  activitySearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
  },
  activityFilterChipsRow: {
    paddingVertical: 4,
    paddingRight: 4,
    gap: 6,
  },
  activityFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    marginRight: 6,
  },
  activityFilterChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  activityFilterChipText: {
    fontSize: 12,
    color: '#374151',
  },
  activityFilterChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  activityStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  activityStatCard: {
    flexGrow: 1,
    minWidth: '22%',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
  },
  activityStatLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 2,
  },
  activityStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  activityCard: {
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 4,
    borderLeftColor: '#e0f2fe',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 8,
  },
  activityCardOpen: {
    borderLeftColor: '#0f766e',
  },
  activityCardReached: {
    borderLeftColor: '#16a34a',
  },
  activityCardClosed: {
    borderLeftColor: '#6b7280',
  },
  activityCardOverdue: {
    borderLeftColor: '#b91c1c',
  },
  activityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  activityTitleBlock: {
    flex: 1,
    marginRight: 8,
  },
  activityCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  activityCardDescription: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  activityStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  activityStatusOpen: {
    backgroundColor: '#ecfdf5',
  },
  activityStatusReached: {
    backgroundColor: '#dcfce7',
  },
  activityStatusClosed: {
    backgroundColor: '#f3f4f6',
  },
  activityStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#054653',
    textTransform: 'capitalize',
  },
  activityOverdueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  activityOverdueText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#b91c1c',
  },
  activityMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  activityMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityMetaTextBlock: {
    marginLeft: 6,
  },
  activityMetaLabel: {
    fontSize: 10,
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  activityMetaValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
  },
  newTaskModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  newTaskModalCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  newTaskModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 10,
  },
  newTaskFieldLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  newTaskTitleInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    marginBottom: 10,
  },
  newTaskDescriptionInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
    minHeight: 70,
    marginBottom: 10,
  },
  newTaskPriorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  newTaskPriorityLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginRight: 8,
  },
  newTaskPriorityChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 6,
  },
  newTaskPriorityChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  newTaskPriorityText: {
    fontSize: 12,
    color: '#374151',
  },
  newTaskPriorityTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  newTaskStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  newTaskStatusLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginRight: 8,
    marginBottom: 4,
  },
  newTaskStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 6,
    marginBottom: 4,
  },
  newTaskStatusChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0f766e',
  },
  newTaskStatusText: {
    fontSize: 12,
    color: '#374151',
  },
  newTaskStatusTextActive: {
    color: '#0f172a',
    fontWeight: '600',
  },
  newTaskDatesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  newTaskDateColumn: {
    flex: 1,
  },
  newTaskDateInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  newTaskDateText: {
    fontSize: 13,
    color: '#111827',
  },
  newTaskEstimateRow: {
    marginBottom: 10,
  },
  newTaskEstimateInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
    textAlign: 'center',
  },
  newTaskEstimateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  newTaskStepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  newTaskStepButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4b5563',
  },
  newTaskAssigneesSection: {
    marginTop: 4,
    marginBottom: 10,
  },
  newTaskSmallHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  newTaskAssigneesList: {
    maxHeight: 160,
  },
  newTaskAssigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  newTaskFieldWrapper: {
    marginBottom: 10,
  },
  newTaskSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  newTaskSelectText: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    marginRight: 8,
  },
  newTaskSelectPlaceholder: {
    flex: 1,
    fontSize: 13,
    color: '#9ca3af',
    marginRight: 8,
  },
  newTaskModalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 8,
  },
  newTaskCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  newTaskCancelText: {
    fontSize: 13,
    color: '#374151',
  },
  newTaskCreateButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#054653',
  },
  newTaskCreateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  roleBadge: {
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0f172a',
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  datePickerCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  datePickerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 10,
  },
  newActivityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#054653',
  },
  newActivityButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  addMemberModalCard: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addMemberModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  addMemberSearchInput: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
    marginBottom: 8,
  },
  addMemberList: {
    marginTop: 4,
    marginBottom: 8,
  },
  addMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  addMemberRadioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  addMemberRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0f766e',
  },
  addMemberInfo: {
    flex: 1,
  },
  addMemberName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  addMemberSubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  addMemberRolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 6,
  },
  addMemberRoleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addMemberRoleChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  addMemberRoleText: {
    fontSize: 12,
    color: '#374151',
  },
  addMemberRoleTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  addMemberButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 8,
  },
  addMemberCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  addMemberCancelText: {
    fontSize: 13,
    color: '#374151',
  },
  addMemberConfirmButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#054653',
  },
  addMemberConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});

