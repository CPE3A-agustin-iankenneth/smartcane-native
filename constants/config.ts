/**
 * Central configuration for the Smart Cane app.
 * Secrets (Supabase, Mapbox) are read from EXPO_PUBLIC_ env vars so they are
 * never committed to source control.
 */
export const CONFIG = {
  // ── ESP32 Hardware ──────────────────────────────────────────────────────────
  /** IP assigned to ESP32 when phone is the hotspot. Change if your DHCP differs. */
  ESP32_IP: '192.168.43.1',
  /** MJPEG stream port */
  ESP32_STREAM_PORT: 81,
  /** HTTP command port */
  ESP32_CMD_PORT: 80,
  /** Max ms to wait for any ESP32 request before giving up */
  ESP32_TIMEOUT_MS: 1000,

  // ── Vision Loop ─────────────────────────────────────────────────────────────
  /** How often to capture + infer a frame (ms). ~2.5 fps */
  INFERENCE_INTERVAL_MS: 400,
  /** Minimum YOLO confidence to consider a detection valid */
  CONFIDENCE_THRESHOLD: 0.45,
  /**
   * Fraction of the 640-px input width that a box must occupy before we
   * treat the obstacle as "close enough" to trigger vibration.
   */
  PROXIMITY_THRESHOLD: 0.30,
  /** Minimum ms between vibration commands to the same side */
  VIBRATION_DEBOUNCE_MS: 1500,

  // ── Cloud / Navigation ───────────────────────────────────────────────────────
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '',

  /** Distance (metres) from a waypoint before it is marked as reached */
  WAYPOINT_RADIUS_M: 15,
};

/** YOLO input tensor dimensions */
export const MODEL_INPUT = { width: 640, height: 640 };

/** Horizontal zone boundaries (0–1 normalised across MODEL_INPUT.width) */
export const ZONES = {
  LEFT_END: 1 / 3,
  RIGHT_START: 2 / 3,
} as const;

export type Zone = 'left' | 'center' | 'right';
