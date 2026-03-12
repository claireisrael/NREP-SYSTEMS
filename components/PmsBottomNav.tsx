import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/context/AuthContext';

type TabKey = 'home' | 'projects' | 'timesheets' | 'approvals';

export function PmsBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const isSupervisor = !!user?.isSupervisor && !user?.isAdmin;
  const isAdmin = !!user?.isAdmin;
  const showApprovals = isAdmin || isSupervisor;

  const currentTab: TabKey =
    pathname.startsWith('/pms/home') ? 'home'
    : pathname.startsWith('/pms/projects') ? 'projects'
    : pathname.startsWith('/pms/timesheets') ? 'timesheets'
    : pathname.startsWith('/pms/approvals') ? 'approvals'
    : 'home';

  const goTo = (tab: TabKey, route: string) => {
    if (currentTab === tab) return;
    router.replace(route);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <NavItem
          label="Home"
          icon="home-variant-outline"
          active={currentTab === 'home'}
          onPress={() => goTo('home', '/pms/home')}
        />
        <NavItem
          label="Projects"
          icon="briefcase-outline"
          active={currentTab === 'projects'}
          onPress={() => goTo('projects', '/pms/projects')}
        />
        <NavItem
          label="Timesheets"
          icon="clock-outline"
          active={currentTab === 'timesheets'}
          onPress={() => goTo('timesheets', '/pms/timesheets')}
        />
        {showApprovals && (
          <NavItem
            label="Approvals"
            icon="check-decagram-outline"
            active={currentTab === 'approvals'}
            onPress={() => goTo('approvals', '/pms/approvals')}
          />
        )}
      </View>
    </View>
  );
}

type NavItemProps = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  active: boolean;
  onPress: () => void;
};

function NavItem({ label, icon, active, onPress }: NavItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        active && styles.itemActive,
        pressed && !active && styles.itemPressed,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={active ? '#14B8A6' : '#6b7280'}
      />
      <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  itemActive: {
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderBottomColor: '#14B8A6',
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemLabel: {
    marginTop: 4,
    fontSize: 10,
    color: '#6b7280',
  },
  itemLabelActive: {
    color: '#14B8A6',
    fontWeight: '600',
  },
});

