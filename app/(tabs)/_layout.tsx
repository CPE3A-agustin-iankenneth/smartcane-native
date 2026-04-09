/**
 * Tab layout — Smart Cane runs as a single-screen app.
 * The tab bar is hidden; navigation is entirely voice-driven.
 */
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Smart Cane',
          tabBarAccessibilityLabel: 'Smart Cane main screen',
        }}
      />
    </Tabs>
  );
}
