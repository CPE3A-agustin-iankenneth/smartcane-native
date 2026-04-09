/**
 * Vision & Hardware Loop (Phase 2).
 *
 * Polls the ESP32-CAM for JPEG snapshots, runs YOLOv8 Nano inference,
 * divides detections into Left / Center / Right zones, and triggers
 * debounced vibration commands when an obstacle is deemed "close".
 *
 * Design constraints from CLAUDE.md:
 *  - Use useRef heavily to avoid React re-renders inside the loop.
 *  - All ESP32 HTTP calls are wrapped in aggressive timeouts (see services/esp32.ts).
 *  - Debounce prevents flooding the ESP32 with redundant vibration requests.
 */
import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { TensorflowModel } from 'react-native-fast-tflite';
import { sendVibrate, fetchSnapshot } from '@/services/esp32';
import { OBSTACLE_CLASS_INDICES } from '@/constants/yolo-labels';
import {
  CONFIG,
  MODEL_INPUT,
  ZONES,
  Zone,
} from '@/constants/config';

// ── YOLOv8 output parsing ────────────────────────────────────────────────────

type Detection = {
  x: number; // centre x normalised [0,1]
  y: number; // centre y normalised [0,1]
  w: number; // width normalised [0,1]
  h: number; // height normalised [0,1]
  classIndex: number;
  confidence: number;
  zone: Zone;
};

/**
 * Parse YOLOv8 Nano raw output tensor.
 *
 * YOLOv8 COCO output shape: [1, 84, 8400]
 *   Axis-1 layout: [cx, cy, w, h, class0, class1, … class79]
 *   Values are already scaled to the input resolution (640 × 640).
 */
function parseYoloOutput(
  output: Float32Array | Int32Array | Uint8Array,
  numDetections = 8400,
  numClasses = 80,
): Detection[] {
  const results: Detection[] = [];

  for (let i = 0; i < numDetections; i++) {
    // YOLOv8 stores output transposed as [84, 8400]; each detection is a column.
    // We receive a flat Float32Array in row-major order from the library.
    const cx = (output[0 * numDetections + i] as number) / MODEL_INPUT.width;
    const cy = (output[1 * numDetections + i] as number) / MODEL_INPUT.height;
    const w = (output[2 * numDetections + i] as number) / MODEL_INPUT.width;
    const h = (output[3 * numDetections + i] as number) / MODEL_INPUT.height;

    // Find the highest-confidence class
    let bestClass = -1;
    let bestConf = 0;
    for (let c = 0; c < numClasses; c++) {
      const conf = output[(4 + c) * numDetections + i] as number;
      if (conf > bestConf) {
        bestConf = conf;
        bestClass = c;
      }
    }

    if (bestConf < CONFIG.CONFIDENCE_THRESHOLD) continue;
    if (!OBSTACLE_CLASS_INDICES.has(bestClass)) continue;

    const left = cx - w / 2;
    let zone: Zone;
    if (left + w < ZONES.LEFT_END) {
      zone = 'left';
    } else if (left > ZONES.RIGHT_START) {
      zone = 'right';
    } else {
      zone = 'center';
    }

    results.push({ x: cx, y: cy, w, h, classIndex: bestClass, confidence: bestConf, zone });
  }

  return results;
}

/**
 * Returns true if any detection in `zone` is close enough to trigger vibration.
 * "Close" = the bounding box width (or height) exceeds PROXIMITY_THRESHOLD.
 */
function isProximate(detections: Detection[], zone: Zone): boolean {
  return detections.some(
    (d) => d.zone === zone && (d.w > CONFIG.PROXIMITY_THRESHOLD || d.h > CONFIG.PROXIMITY_THRESHOLD),
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type StreamStatus = 'stopped' | 'running' | 'no_model' | 'connecting';

export type VisionState = {
  detections: Detection[];
  zones: { left: boolean; center: boolean; right: boolean };
};

type Options = {
  model: TensorflowModel | null;
  enabled: boolean;
  /** Called with latest detection state (not a state setter — avoids re-renders) */
  onDetection?: (state: VisionState) => void;
  /** Called when connection to ESP32 is established or lost */
  onConnectionChange?: (connected: boolean) => void;
};

export function useESP32Stream({ model, enabled, onDetection, onConnectionChange }: Options) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastVibrateRef = useRef<Record<Zone, number>>({ left: 0, center: 0, right: 0 });
  const isRunningRef = useRef(false);
  const connectedRef = useRef(false);

  const runInferenceOnBase64 = useCallback(
    async (base64Jpeg: string) => {
      if (!model) return;

      // Resize the captured JPEG to 640×640 for YOLO input
      const resized = await ImageManipulator.manipulateAsync(
        `data:image/jpeg;base64,${base64Jpeg}`,
        [{ resize: { width: MODEL_INPUT.width, height: MODEL_INPUT.height } }],
        { base64: true, format: ImageManipulator.SaveFormat.JPEG },
      );

      if (!resized.base64) return;

      // Decode base64 to Uint8Array and normalise to Float32 [0, 1]
      const raw = Buffer.from(resized.base64, 'base64');
      const float32 = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        float32[i] = (raw[i] as number) / 255;
      }

      const outputs = model.runSync([float32]);
      const rawOutput = outputs[0];
      if (!rawOutput) return;

      const detections = parseYoloOutput(rawOutput as Float32Array, 8400, 80);
      const zones = {
        left: isProximate(detections, 'left'),
        center: isProximate(detections, 'center'),
        right: isProximate(detections, 'right'),
      };

      onDetection?.({ detections, zones });

      // Fire vibration commands, respecting debounce
      const now = Date.now();
      const last = lastVibrateRef.current;

      if (zones.left && zones.right && now - Math.min(last.left, last.right) > CONFIG.VIBRATION_DEBOUNCE_MS) {
        void sendVibrate('both');
        last.left = now;
        last.right = now;
      } else {
        if (zones.left && now - last.left > CONFIG.VIBRATION_DEBOUNCE_MS) {
          void sendVibrate('left');
          last.left = now;
        }
        if (zones.right && now - last.right > CONFIG.VIBRATION_DEBOUNCE_MS) {
          void sendVibrate('right');
          last.right = now;
        }
      }
    },
    [model, onDetection],
  );

  const tick = useCallback(async () => {
    if (isRunningRef.current) return; // Skip if previous tick still running
    isRunningRef.current = true;

    try {
      const frame = await fetchSnapshot();
      if (frame === null) {
        if (connectedRef.current) {
          connectedRef.current = false;
          onConnectionChange?.(false);
        }
        return;
      }

      if (!connectedRef.current) {
        connectedRef.current = true;
        onConnectionChange?.(true);
      }

      await runInferenceOnBase64(frame);
    } finally {
      isRunningRef.current = false;
    }
  }, [runInferenceOnBase64, onConnectionChange]);

  useEffect(() => {
    if (!enabled || !model || Platform.OS === 'web') return;

    intervalRef.current = setInterval(() => {
      void tick();
    }, CONFIG.INFERENCE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [enabled, model, tick]);
}
