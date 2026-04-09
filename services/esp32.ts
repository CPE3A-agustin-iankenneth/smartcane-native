/**
 * ESP32 hardware service.
 *
 * All functions are fire-and-forget with aggressive timeouts.
 * They NEVER throw — the app must stay alive even when the cane is out of range.
 */
import { CONFIG } from '@/constants/config';

const base = (port: number) => `http://${CONFIG.ESP32_IP}:${port}`;

/** AbortController wrapper that rejects after `ms` milliseconds. */
function fetchWithTimeout(url: string, ms = CONFIG.ESP32_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * Tell the cane to fire a vibration motor.
 * Returns true if the command reached the ESP32, false otherwise.
 */
export async function sendVibrate(side: 'left' | 'right' | 'both'): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${base(CONFIG.ESP32_CMD_PORT)}/vibrate?side=${side}`,
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch a single JPEG snapshot from the ESP32-CAM.
 * Returns a base64-encoded string on success, null on failure.
 */
export async function fetchSnapshot(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `${base(CONFIG.ESP32_CMD_PORT)}/capture`,
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    return await blobToBase64(blob);
  } catch {
    return null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip data URL prefix, keep only raw base64
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Ping the ESP32. Returns true if reachable. */
export async function pingESP32(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${base(CONFIG.ESP32_CMD_PORT)}/status`, 500);
    return res.ok;
  } catch {
    return false;
  }
}
