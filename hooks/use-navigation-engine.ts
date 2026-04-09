/**
 * "Waze" Routing Engine (Phase 3).
 *
 * Subscribes to the Supabase `active_navigation` table for new targets,
 * then drives turn-by-turn GPS navigation via expo-location + expo-speech.
 *
 * Obstacle interrupts: call `reportObstacle()` from the vision loop to
 * inject an "Obstacle nearby" TTS warning ahead of the next navigation step.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { supabase, NavigationTarget } from '@/services/supabase';
import { fetchWalkingRoute, distanceMetres, formatDistance, RouteStep, Coordinate } from '@/services/routing';
import { CONFIG } from '@/constants/config';

export type NavStatus =
  | 'idle'
  | 'requesting_permissions'
  | 'waiting_for_target'
  | 'fetching_route'
  | 'navigating'
  | 'arrived'
  | 'error';

export type NavigationState = {
  status: NavStatus;
  currentStep: RouteStep | null;
  stepsRemaining: number;
  distanceToNext: number | null;
  destination: NavigationTarget | null;
  errorMessage: string | null;
};

function speak(text: string, priority = false) {
  if (priority) Speech.stop();
  Speech.speak(text, { language: 'en', rate: 0.9 });
}

export function useNavigationEngine() {
  const [navState, setNavState] = useState<NavigationState>({
    status: 'idle',
    currentStep: null,
    stepsRemaining: 0,
    distanceToNext: null,
    destination: null,
    errorMessage: null,
  });

  // Refs for mutable loop state — no re-renders needed
  const stepsRef = useRef<RouteStep[]>([]);
  const stepIndexRef = useRef(0);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const obstacleBlockedRef = useRef(false);

  const stopNavigation = useCallback(() => {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    stepsRef.current = [];
    stepIndexRef.current = 0;
    Speech.stop();
    setNavState((s) => ({ ...s, status: 'idle', currentStep: null, stepsRemaining: 0, destination: null }));
  }, []);

  /** Call from the vision loop when a proximate obstacle is detected. */
  const reportObstacle = useCallback((zone: 'left' | 'center' | 'right') => {
    if (obstacleBlockedRef.current) return;
    obstacleBlockedRef.current = true;
    const dir = zone === 'left' ? 'to your left' : zone === 'right' ? 'to your right' : 'ahead';
    speak(`Obstacle ${dir}`, true);
    setTimeout(() => { obstacleBlockedRef.current = false; }, 3000);
  }, []);

  const advanceToStep = useCallback((index: number) => {
    const steps = stepsRef.current;
    if (index >= steps.length) {
      speak('You have arrived at your destination.', true);
      setNavState((s) => ({ ...s, status: 'arrived', currentStep: null, stepsRemaining: 0 }));
      locationSubRef.current?.remove();
      return;
    }
    const step = steps[index]!;
    const remaining = steps.length - index;
    setNavState((s) => ({ ...s, currentStep: step, stepsRemaining: remaining }));
    speak(step.instruction);
  }, []);

  const startLocationTracking = useCallback(
    async (destination: NavigationTarget) => {
      locationSubRef.current?.remove();

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => {
          const pos: Coordinate = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };

          const steps = stepsRef.current;
          const idx = stepIndexRef.current;
          if (idx >= steps.length) return;

          const step = steps[idx]!;
          const dist = distanceMetres(pos, step.location);

          setNavState((s) => ({ ...s, distanceToNext: dist }));

          // If within WAYPOINT_RADIUS_M of the step endpoint, advance
          if (dist < CONFIG.WAYPOINT_RADIUS_M) {
            stepIndexRef.current = idx + 1;
            advanceToStep(idx + 1);
          } else if (dist < 30 && idx + 1 < steps.length) {
            // Announce upcoming step
            const next = steps[idx + 1]!;
            speak(`${formatDistance(dist)}, ${next.instruction}`);
          }
        },
      );
    },
    [advanceToStep],
  );

  const startNavigationTo = useCallback(
    async (target: NavigationTarget) => {
      setNavState((s) => ({ ...s, status: 'fetching_route', destination: target, errorMessage: null }));
      speak(`Starting navigation to ${target.label ?? 'destination'}.`);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setNavState((s) => ({
          ...s,
          status: 'error',
          errorMessage: 'Location permission denied.',
        }));
        speak('Location permission denied. Navigation unavailable.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const origin: Coordinate = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

      const steps = await fetchWalkingRoute(origin, {
        latitude: target.latitude,
        longitude: target.longitude,
      });

      if (!steps || steps.length === 0) {
        setNavState((s) => ({ ...s, status: 'error', errorMessage: 'Could not fetch route.' }));
        speak('Could not fetch route. Please try again.');
        return;
      }

      stepsRef.current = steps;
      stepIndexRef.current = 0;
      setNavState((s) => ({ ...s, status: 'navigating', stepsRemaining: steps.length }));

      advanceToStep(0);
      await startLocationTracking(target);
    },
    [advanceToStep, startLocationTracking],
  );

  // Subscribe to Supabase active_navigation table
  useEffect(() => {
    if (!CONFIG.SUPABASE_URL) return;

    setNavState((s) => ({ ...s, status: 'waiting_for_target' }));

    const channel = supabase
      .channel('active_navigation_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'active_navigation' },
        (payload) => {
          const target = payload.new as NavigationTarget;
          void startNavigationTo(target);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      stopNavigation();
    };
  }, [startNavigationTo, stopNavigation]);

  return { navState, reportObstacle, stopNavigation };
}
