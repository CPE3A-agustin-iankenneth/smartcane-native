/**
 * Loads the YOLOv8 Nano TFLite model into memory using hardware acceleration.
 *
 * Place the model file at: assets/models/yolov8n.tflite
 *
 * Delegate selection:
 *   iOS  → Core ML (Neural Engine / GPU)
 *   Android → GPU delegate, NNAPI fallback handled by the library
 *   Web / test → CPU fallback (model won't be loaded on web)
 */
import { Platform } from 'react-native';
import { useTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';

export type ModelState =
  | { status: 'loading' }
  | { status: 'loaded'; model: TensorflowModel }
  | { status: 'error'; error: string }
  | { status: 'unavailable' };

export function useTFLiteModel(): ModelState {
  // Web platform cannot run TFLite
  if (Platform.OS === 'web') return { status: 'unavailable' };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const delegate = Platform.OS === 'ios' ? 'core-ml' : 'android-gpu';
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const result = useTensorflowModel(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/assets/models/yolov8n.tflite'),
    delegate,
  );

  if (result.state === 'loading') return { status: 'loading' };
  if (result.state === 'error') {
    return { status: 'error', error: result.error?.message ?? 'Unknown model error' };
  }
  if (result.model == null) return { status: 'loading' };
  return { status: 'loaded', model: result.model };
}
