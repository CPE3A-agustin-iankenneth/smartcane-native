# Smart Cane - React Native Edge Client

## Project Overview
This repository contains the React Native (Expo) mobile application for the Smart Cane ecosystem. This app acts as the "brain" of the operation. It processes real-time video from a local hardware device (ESP32-CAM), runs edge AI object detection to trigger physical haptics, and handles background location tracking and voice navigation based on commands received from an external cloud database.

## System Architecture & Network Flow
* **Network Topology:** The smartphone running this app acts as a Wi-Fi Hotspot. The ESP32 hardware connects to this hotspot. 
* **Hardware Interfacing (Local):** * Ingests MJPEG video stream from `http://<ESP32_IP>:81/stream`.
  * Sends hardware actuation commands via HTTP GET (e.g., `http://<ESP32_IP>:80/vibrate?side=left`).
* **Cloud Interfacing (Cellular):** Connects to a Supabase PostgreSQL database to listen for remote navigation targets sent by an external Next.js companion app.

---

## Technology Stack
* **Framework:** React Native with Expo (Managed Workflow).
* **AI/Vision:** `react-native-fast-tflite`, using a pre-trained YOLOv8 Nano model from Ultralytics (`yolov8n.tflite`).
* **Hardware/Sensors:** `expo-location` (GPS tracking), `expo-speech` (Voice TTS), `expo-camera` (if needed for testing vision pipeline before hardware integration).
* **Backend Integration:** `@supabase/supabase-js`.

---

## Implementation Roadmap

### Phase 1: Foundation & AI Initialization
1. Initialize the Expo app and install dependencies (`react-native-fast-tflite`, `expo-speech`, `expo-location`, `@supabase/supabase-js`).
2. Place the `yolov8n.tflite` model in the local assets.
3. Write a hook/service to load the TFLite model into memory on app start. Ensure it utilizes native hardware acceleration (NPU/CoreML) via the library's configurations.

### Phase 2: The Vision & Hardware Loop
1. **Stream Ingestion:** Implement a hidden mechanism (e.g., `<WebView>` or a frame processor) to capture JPEGs from the ESP32's MJPEG stream at ~2-3 frames per second.
2. **Inference & Logic:** * Convert frames to tensors and pass them to the YOLO model.
   * Divide the 640x640 tensor output space into three vertical zones: `Left`, `Center`, `Right`.
   * Filter output for obstacle classes (person, car, chair, fire hydrant, etc.).
3. **Hardware Execution:**
   * If an obstacle bounding box expands significantly within a specific zone (indicating proximity), trigger the corresponding vibration motor.
   * Send an asynchronous `fetch()` request to the ESP32's local API.
   * **Crucial:** Implement strict debounce logic so the app does not flood the ESP32 network with redundant HTTP requests.

### Phase 3: The "Waze" Routing Engine
1. Initialize the Supabase client and establish a WebSocket connection.
2. Listen for `INSERT` events on the `active_navigation` table.
3. When a target coordinate is received:
   * Fetch the current GPS coordinates using `expo-location`.
   * Query a routing API (Mapbox or Google Directions API) to get turn-by-turn pathing.
   * Monitor live location and use `expo-speech` to dictate upcoming steps (e.g., "In 20 meters, turn right").
   * Use `expo-speech` to interrupt navigation with "Obstacle nearby" if the Phase 2 Vision Loop detects a critical hazard.

---

## Claude Code Execution Directives
* **Hardware Resilience:** The ESP32 connection will be inherently unstable due to the moving cane. Wrap all local `fetch()` calls in aggressive timeout blocks. The app must never crash if the ESP32 drops the hotspot connection.
* **Performance:** Running TFLite and background location simultaneously is battery-intensive. Keep React state updates to an absolute minimum during the vision loop to prevent UI thread freezing. Use `useRef` heavily for state that does not require visual updates.
* **Accessibility:** The UI for this app should be minimal. The primary user relies on screen readers (VoiceOver/TalkBack). Ensure any visible buttons ("Connect to Cane", "Stop Navigation") have massive touch targets and correct ARIA/accessibility labels.
* **Testing:** Build the TFLite processing pipeline using a static local image first to verify bounding box logic before attempting to parse the live network MJPEG stream.