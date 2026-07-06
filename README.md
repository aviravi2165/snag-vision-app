# SnagVision — Mobile Capture App

Offline-first React Native (Expo) app for capturing 360° construction site photos mapped to floor-plan locations, for IEVO.

## What it does
- Worker opens a project, sees the floor plan with marked capture spots ("dots")
- Taps a spot, captures a photo (via phone camera for now; Insta360 OSC integration in progress)
- Photos save to local device storage immediately — works with zero network at the site
- Back on WiFi, a sync engine uploads the local queue to the backend, resuming automatically if interrupted

## Status
Early build — local capture, storage, and sync-queue logic are working and tested via Expo Go. Backend upload endpoint is not yet built (uploads currently mocked). Insta360 OSC camera integration is designed but not yet tested against real hardware.

## Tech stack
- React Native (Expo SDK 54)
- expo-sqlite + expo-file-system — local photo queue and storage
- react-native-gesture-handler + reanimated — zoom/pan floor plan viewer
- OSC (Open Spherical Camera protocol) — planned camera integration over local WiFi

## Setup
```
npm install --legacy-peer-deps
npx expo start
```
Scan the QR code with Expo Go (Android/iOS). Requires Expo Go version matching this project's SDK 54.

## Project structure
## Project Structure

```text
src/
├── api/            # Backend client
├── camera/         # OSC camera client
├── components/     # Reusable UI components
│   ├── PlanPicker/     # Zoomable floor plan picker
│   └── SyncStatusBar/  # Upload/sync status indicator
├── data/           # Local caching
│   ├── floor-plans/
│   ├── structure/
│   └── mock-data/
├── db/             # SQLite local photo queue
├── storage/        # Local file storage for captured photos
├── sync/           # Connectivity-aware upload sync engine
└── screens/        # Application screens
    ├── Login/
    ├── Projects/
    ├── Capture/
    └── Dashboard/
```