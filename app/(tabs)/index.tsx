/**
 * Smart Cane — Main Screen
 *
 * Minimal, accessibility-first UI:
 *   • One large "Connect to Cane" / "Disconnect" button (entire top half)
 *   • Status area in the middle (connection, model, navigation)
 *   • One large "Stop Navigation" button at the bottom (only visible while navigating)
 *
 * All interactive elements have large touch targets (min 80px) and
 * accessibilityLabel / accessibilityHint for VoiceOver / TalkBack.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
  Platform,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTFLiteModel } from '@/hooks/use-tflite-model';
import { useESP32Stream, VisionState } from '@/hooks/use-esp32-stream';
import { useNavigationEngine } from '@/hooks/use-navigation-engine';
import { pingESP32 } from '@/services/esp32';
import LocationBroadcaster from '@/components/LocationBroadcaster';

// Stable device ID — in production replace with a persisted UUID per device
const DEVICE_ID = 'smartcane-01';

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  bg: '#0d1117',
  surface: '#161b22',
  border: '#30363d',
  accent: '#1f6feb',
  accentDim: '#1a5ccc',
  success: '#238636',
  warning: '#d29922',
  danger: '#da3633',
  text: '#e6edf3',
  textMuted: '#8b949e',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function ZoneIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <View
      style={[styles.zone, active && styles.zoneActive]}
      accessibilityLabel={`${label} zone: ${active ? 'obstacle' : 'clear'}`}
    >
      <Text style={[styles.zoneText, active && styles.zoneTextActive]}>{label}</Text>
    </View>
  );
}

function StatusRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MainScreen() {
  const [caneEnabled, setCaneEnabled] = useState(false);
  const [caneConnected, setCaneConnected] = useState(false);
  const [pinging, setPinging] = useState(false);
  const visionRef = useRef<VisionState>({ detections: [], zones: { left: false, center: false, right: false } });
  const [visionDisplay, setVisionDisplay] = useState(visionRef.current);

  const modelState = useTFLiteModel();

  const onDetection = useCallback((state: VisionState) => {
    visionRef.current = state;
    // Only update display state when something changed to minimise renders
    setVisionDisplay({ ...state });
  }, []);

  const onConnectionChange = useCallback((connected: boolean) => {
    setCaneConnected(connected);
    AccessibilityInfo.announceForAccessibility(
      connected ? 'Smart cane connected.' : 'Smart cane disconnected.',
    );
  }, []);

  const { navState, reportObstacle, stopNavigation } = useNavigationEngine();

  // Forward proximate center obstacles to the navigation engine for TTS
  useEffect(() => {
    if (visionDisplay.zones.left) reportObstacle('left');
    if (visionDisplay.zones.center) reportObstacle('center');
    if (visionDisplay.zones.right) reportObstacle('right');
  }, [visionDisplay.zones, reportObstacle]);

  useESP32Stream({
    model: modelState.status === 'loaded' ? modelState.model : null,
    enabled: caneEnabled,
    onDetection,
    onConnectionChange,
  });

  const handleConnectPress = useCallback(async () => {
    if (caneEnabled) {
      setCaneEnabled(false);
      setCaneConnected(false);
      return;
    }
    // Quick ping before enabling the full stream
    setPinging(true);
    const reachable = await pingESP32();
    setPinging(false);
    if (!reachable) {
      AccessibilityInfo.announceForAccessibility(
        'Cane not found. Make sure the phone hotspot is on and the cane is powered.',
      );
    }
    setCaneEnabled(true);
  }, [caneEnabled]);

  // ── Derived display strings ────────────────────────────────────────────────
  const modelLabel =
    modelState.status === 'loading' ? 'Loading…'
    : modelState.status === 'loaded' ? 'Ready'
    : modelState.status === 'unavailable' ? 'N/A (web)'
    : `Error: ${modelState.status === 'error' ? modelState.error : ''}`;

  const modelColor =
    modelState.status === 'loaded' ? C.success
    : modelState.status === 'error' ? C.danger
    : C.textMuted;

  const connLabel = pinging ? 'Pinging…' : caneEnabled ? (caneConnected ? 'Connected' : 'Searching…') : 'Off';
  const connColor = caneConnected ? C.success : caneEnabled ? C.warning : C.textMuted;

  const navLabel =
    navState.status === 'navigating'
      ? `Navigating — ${navState.stepsRemaining} step${navState.stepsRemaining !== 1 ? 's' : ''} left`
      : navState.status === 'arrived' ? 'Arrived!'
      : navState.status === 'fetching_route' ? 'Fetching route…'
      : navState.status === 'error' ? `Error: ${navState.errorMessage ?? ''}`
      : navState.status === 'waiting_for_target' ? 'Waiting for destination'
      : 'Idle';

  const navColor =
    navState.status === 'navigating' ? C.accent
    : navState.status === 'arrived' ? C.success
    : navState.status === 'error' ? C.danger
    : C.textMuted;

  const connectBtnColor = caneEnabled ? C.danger : C.accent;
  const connectBtnLabel = pinging ? 'Connecting…' : caneEnabled ? 'Disconnect Cane' : 'Connect to Cane';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Location broadcaster — active whenever the cane is enabled */}
      <LocationBroadcaster deviceId={DEVICE_ID} enabled={caneEnabled} />

      {/* ── CONNECT BUTTON ── */}
      <Pressable
        style={({ pressed }) => [
          styles.connectBtn,
          { backgroundColor: pressed ? connectBtnColor + 'cc' : connectBtnColor },
        ]}
        onPress={handleConnectPress}
        disabled={pinging}
        accessibilityRole="button"
        accessibilityLabel={connectBtnLabel}
        accessibilityHint={
          caneEnabled
            ? 'Stops the cane vision loop'
            : 'Starts the cane vision loop and begins obstacle detection'
        }
        accessibilityState={{ disabled: pinging, busy: pinging }}
      >
        <Text style={styles.connectBtnText}>{connectBtnLabel}</Text>
      </Pressable>

      {/* ── STATUS PANEL ── */}
      <ScrollView style={styles.statusPanel} contentContainerStyle={styles.statusPanelContent}>
        <Text style={styles.sectionTitle} accessibilityRole="header">System Status</Text>
        <StatusRow label="AI Model" value={modelLabel} color={modelColor} />
        <StatusRow label="Cane" value={connLabel} color={connColor} />
        <StatusRow label="Navigation" value={navLabel} color={navColor} />

        {navState.currentStep && (
          <View style={styles.stepCard} accessibilityLiveRegion="polite">
            <Text style={styles.stepInstruction} accessibilityLabel={`Current instruction: ${navState.currentStep.instruction}`}>
              {navState.currentStep.instruction}
            </Text>
            {navState.distanceToNext !== null && (
              <Text style={styles.stepDistance}>
                {Math.round(navState.distanceToNext)}m away
              </Text>
            )}
          </View>
        )}

        {/* ── OBSTACLE ZONE INDICATOR ── */}
        {caneEnabled && (
          <View style={styles.zonesContainer} accessibilityLabel="Obstacle detection zones">
            <Text style={styles.sectionTitle}>Detection Zones</Text>
            <View style={styles.zonesRow}>
              <ZoneIndicator label="Left" active={visionDisplay.zones.left} />
              <ZoneIndicator label="Center" active={visionDisplay.zones.center} />
              <ZoneIndicator label="Right" active={visionDisplay.zones.right} />
            </View>
            <Text style={styles.detectionCount}>
              {visionDisplay.detections.length} obstacle{visionDisplay.detections.length !== 1 ? 's' : ''} detected
            </Text>
          </View>
        )}

        {Platform.OS === 'web' && (
          <View style={styles.webWarning}>
            <Text style={styles.webWarningText}>
              AI obstacle detection requires a native build. Run{' '}
              <Text style={{ fontWeight: 'bold' }}>npx expo run:android</Text> or{' '}
              <Text style={{ fontWeight: 'bold' }}>npx expo run:ios</Text>.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── STOP NAVIGATION BUTTON ── */}
      {navState.status === 'navigating' && (
        <Pressable
          style={({ pressed }) => [styles.stopBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={stopNavigation}
          accessibilityRole="button"
          accessibilityLabel="Stop Navigation"
          accessibilityHint="Cancels the current walking route and stops all voice guidance"
        >
          <Text style={styles.stopBtnText}>Stop Navigation</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  connectBtn: {
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  connectBtnText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  statusPanel: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  statusPanelContent: {
    padding: 20,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  statusLabel: {
    fontSize: 16,
    color: C.text,
  },
  statusValue: {
    fontSize: 16,
    color: C.textMuted,
    fontWeight: '500',
  },
  stepCard: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.accent,
    padding: 16,
    marginTop: 12,
    gap: 4,
  },
  stepInstruction: {
    fontSize: 18,
    color: C.text,
    fontWeight: '600',
    lineHeight: 24,
  },
  stepDistance: {
    fontSize: 14,
    color: C.textMuted,
  },
  zonesContainer: {
    marginTop: 16,
  },
  zonesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  zone: {
    flex: 1,
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.surface,
  },
  zoneActive: {
    borderColor: C.danger,
    backgroundColor: C.danger + '22',
  },
  zoneText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textMuted,
  },
  zoneTextActive: {
    color: C.danger,
  },
  detectionCount: {
    marginTop: 6,
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
  },
  webWarning: {
    marginTop: 20,
    padding: 14,
    backgroundColor: C.warning + '22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.warning,
  },
  webWarningText: {
    color: C.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  stopBtn: {
    minHeight: 80,
    backgroundColor: C.danger,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  stopBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
});
