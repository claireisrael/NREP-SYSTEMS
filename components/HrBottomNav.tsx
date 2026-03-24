import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useHrAuth } from '@/context/HrAuthContext';

type TabKey = 'home' | 'travel' | 'requests' | 'approvals' | 'staff';

export function HrBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useHrAuth();

  const canApprove = user?.systemRole === 'Senior Manager' || user?.systemRole === 'Supervisor';

  const currentTab: TabKey =
    pathname.startsWith('/hr/home') ? 'home'
    : pathname.startsWith('/hr/travel') ? 'travel'
    : pathname.startsWith('/hr/requests') ? 'requests'
    : pathname.startsWith('/hr/approvals') ? 'approvals'
    : pathname.startsWith('/hr/staff-directory') ? 'staff'
    : 'home';

  const goTo = (tab: TabKey, route: string) => {
    if (currentTab === tab) return;
    router.replace(route as any);
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(10, insets.bottom + 8) }]}>
      <LinearGradient
        colors={['#054653', '#0e706d', '#FFB803']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradientShell}
      >
        <View style={styles.container}>
          <NavItem
            label="Home"
            icon="home-variant-outline"
            active={currentTab === 'home'}
            onPress={() => goTo('home', '/hr/home')}
          />
          <NavItem
            label="Travel"
            icon="airplane"
            active={currentTab === 'travel'}
            onPress={() => goTo('travel', '/hr/travel')}
          />
          {canApprove && (
            <NavItem
              label="Approvals"
              icon="check-decagram-outline"
              active={currentTab === 'approvals'}
              onPress={() => goTo('approvals', '/hr/approvals')}
            />
          )}
          <NavItem
            label="Requests"
            icon="file-document-outline"
            active={currentTab === 'requests'}
            onPress={() => goTo('requests', '/hr/requests')}
          />
          <NavItem
            label="Staff"
            icon="account-group-outline"
            active={currentTab === 'staff'}
            onPress={() => goTo('staff', '/hr/staff-directory')}
          />
        </View>
      </LinearGradient>
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
        color={active ? '#054653' : '#6b7280'}
      />
      <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 4,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    margin: 1.5,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  gradientShell: {
    borderRadius: 999,
    padding: 1.5,
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
    borderBottomColor: '#054653',
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
    color: '#054653',
    fontWeight: '600',
  },
});

