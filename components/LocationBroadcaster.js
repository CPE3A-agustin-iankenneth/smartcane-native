/**
 * LocationBroadcaster
 *
 * A renderless component that tracks the device's position and UPSERTs
 * each update to the Supabase `device_locations` table.
 *
 * Props:
 *   deviceId  {string}  – unique identifier for this cane/device
 *   enabled   {boolean} – set false to pause broadcasting without unmounting
 *
 * Throttling: updates fire at most every 5 seconds OR every 5 metres,
 * whichever comes first, matching expo-location's built-in filtering.
 *
 * CLAUDE.md directives applied:
 *   • useRef for the subscription handle — no re-render on assignment
 *   • All Supabase calls are fire-and-forget (void) to keep the location
 *     callback non-blocking
 *   • Graceful permission handling with user-readable error states
 */

import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { supabase } from '@/utils/supabaseClient';

/**
 * @typedef {'idle'|'requesting'|'denied'|'broadcasting'|'error'} BroadcastStatus
 */

/**
 * @param {{ deviceId: string, enabled?: boolean, onStatusChange?: (s: BroadcastStatus) => void }} props
 */
export default function LocationBroadcaster({ deviceId, enabled = true, onStatusChange }) {
  const subscriptionRef = useRef(null);
  const [status, setStatus] = useState('idle');

  function updateStatus(next) {
    setStatus(next);
    onStatusChange?.(next);
  }

  async function startWatching() {
    updateStatus('requesting');

    // ── 1. Foreground permission ───────────────────────────────────────────────
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      updateStatus('denied');
      console.warn('[LocationBroadcaster] Foreground location permission denied.');
      return;
    }

    // ── 2. Background permission (needed for when app is backgrounded) ─────────
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      // Background was denied — broadcasting only works in foreground.
      // Not fatal: continue with foreground-only tracking.
      console.warn('[LocationBroadcaster] Background location permission denied — foreground only.');
    }

    // ── 3. Start watching ──────────────────────────────────────────────────────
    try {
      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,      // minimum ms between updates
          distanceInterval: 5,     // minimum metres moved between updates
        },
        (locationUpdate) => {
          void broadcastLocation(locationUpdate.coords);
        },
      );
      updateStatus('broadcasting');
    } catch (err) {
      console.error('[LocationBroadcaster] watchPositionAsync failed:', err);
      updateStatus('error');
    }
  }

  function stopWatching() {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    updateStatus('idle');
  }

  /**
   * UPSERT the latest position to Supabase.
   * Fire-and-forget: errors are logged but never thrown.
   */
  async function broadcastLocation(coords) {
    try {
      const { error } = await supabase.from('device_locations').upsert(
        {
          device_id: deviceId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'device_id' },
      );
      if (error) {
        console.warn('[LocationBroadcaster] Supabase upsert error:', error.message);
      }
    } catch (err) {
      console.warn('[LocationBroadcaster] broadcastLocation threw:', err);
    }
  }

  useEffect(() => {
    if (enabled) {
      void startWatching();
    } else {
      stopWatching();
    }

    return () => stopWatching();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, deviceId]);

  // This component is purely logic — renders nothing.
  return null;
}
