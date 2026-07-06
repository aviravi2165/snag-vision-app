import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

/**
 * JS wrapper around the native Insta360 SDK bridge (Insta360Module).
 * The native side (Android: Insta360Module.kt, iOS: Insta360Module.swift)
 * wraps Insta360's camera SDK: discover, connect, start/stop capture,
 * and emit per-frame stitched panorama file paths.
 */
const { Insta360Module } = NativeModules;

// Graceful fallback so the JS app still runs in an emulator without the SDK.
const Native = Insta360Module || {
  discoverCameras: async () => [],
  connect: async () => ({ connected: false, reason: 'SDK not linked' }),
  disconnect: async () => true,
  startCapture: async () => ({ sessionId: 'mock', started: true }),
  stopCapture: async () => ({ stopped: true }),
  isMock: true,
};

const emitter = Insta360Module ? new NativeEventEmitter(Insta360Module) : null;

export default {
  isAvailable: !!Insta360Module,
  platform: Platform.OS,

  discoverCameras: () => Native.discoverCameras(),
  connect: (cameraId) => Native.connect(cameraId),
  disconnect: () => Native.disconnect(),

  /**
   * Start a continuous walkthrough capture.
   * @param {object} opts { intervalMs, stitch: true }
   */
  startCapture: (opts = {}) => Native.startCapture(opts),
  stopCapture: () => Native.stopCapture(),

  /**
   * Subscribe to stitched frame events:
   * payload = { filePath, timestamp, yaw, pitch }
   */
  onFrame: (cb) => emitter?.addListener('Insta360Frame', cb),
  onStatus: (cb) => emitter?.addListener('Insta360Status', cb),
};
