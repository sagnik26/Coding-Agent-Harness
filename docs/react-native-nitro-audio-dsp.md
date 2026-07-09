# react-native-nitro-audio-dsp

An open-source, ultra-low-latency audio processing and visualization library powered by [Margelo's Nitro Modules](https://nitro.margelo.com/).

By targeting the gap between raw audio recording and full Web Audio engines, this package provides developers with pre-built C++ mathematical filters and real-time visualization streams over zero-copy memory arrays.

---

## Target Use Cases

Capabilities that are currently impossible or sluggish with legacy React Native audio tools:

### Live Voice Modulation & AI Prep

Real-time pitch-shifting, robot voice effects, or automated background noise gating before bytes are sent to local AI tools like Whisper.

### High-Fidelity Audio Visualizers

Glitch-free, 60fps wave graphs and frequency bar charts for music players or audio recorders.

### Low-Latency Signal Processing

Audio tools such as guitar tuner apps, metronomes with microsecond accuracy, or karaoke vocal feedback systems.

---

## Execution Blueprint

### Phase 1: Define the Specification Contract

Create a unified TypeScript configuration file (`.nitro.ts`). Nitro's compiler parses this file and auto-generates the underlying C++ JSI bindings.

```typescript
import { type HybridObject } from 'react-native-nitro-modules'

export interface DSPFrame {
  /** Pointer to raw PCM float memory bytes */
  buffer: ArrayBuffer
  /** Extracted frequencies via Fast Fourier Transform */
  frequencies: number[]
  /** Peak volume level in decibels (dB) */
  decibels: number
}

export interface NitroAudioDSP extends HybridObject<{ ios: 'swift', android: 'kotlin' }> {
  /** Sets up microphone processing node */
  initialize(sampleRate: number, frameSize: number): Promise<boolean>
  /** Starts capture loop and triggers C++ pipeline */
  start(): void
  /** Stops all background threads and releases audio engines */
  stop(): void
  /** Enables real-time audio filters */
  toggleRobotFilter(enabled: boolean): void
  /** Blazing fast real-time frame event callback */
  onFrameProcessed(callback: (frame: DSPFrame) => void): void
}
```

### Phase 2: Build Platform Capture Layers

Write native boilerplate wrappers to request microphone access and funnel raw data into the C++ buffer.

| Platform | Approach |
| -------- | -------- |
| **iOS** | Configure an `AVAudioEngine` node. Tap its output bus to retrieve floating-point PCM buffers (`AVAudioPCMBuffer`). |
| **Android** | Initialize an `AudioRecord` instance. Loop continuously in a background thread pool to pull bytes from the hardware buffer. |

### Phase 3: Implement the C++ DSP Engine

Write a unified, pure C++ worker class for performance on par with Software Mansion / Margelo quality.

| Component | Purpose |
| --------- | ------- |
| **Ring buffer** | Store incoming audio bytes in a thread-safe circular array so no packets are dropped. |
| **FFT algorithm** | Compute real-time decibels and clean frequency bands via Fast Fourier Transform. |
| **Zero-copy wrap** | Pack processed data in a `jsi::ArrayBuffer` so references pass to JavaScript without copying memory. |

### Phase 4: Construct the Frontend Presentation Layer

Design a reactive React Native component layer. Combine the processing library with Skia or Reanimated for smooth drawing.

- Pass the `frequencies` array from the Nitro frame event listener directly into a canvas component.
- Keep drawing calculations on the native UI thread so equalizer graphics render at 60–120fps.

### Phase 5: Build a Demo App & Package Publicly

- Compile a clean example application inside the workspace as living documentation.
- Provide an interactive dashboard with a microphone toggle, effect switches, and an active frequency visualizer.
- Package and distribute via npm.

---

## Voice AI Integration

Current voice AI tools (OpenAI Realtime API, Gemini Live, ElevenLabs, on-device LLMs like Llama 3) rely on real-time bidirectional audio streaming. Standard React Native audio libraries fail here because they copy audio chunks slowly or format them into large strings.

A zero-copy C++ processing engine addresses these constraints directly.

### On-Device VAD (Voice Activity Detection)

**Problem:** Streaming silence or background noise consumes bandwidth and API tokens.

**Solution:** Process audio frames instantly via JSI. Run a lightweight loop that checks decibel and frequency thresholds, then pause network streams the millisecond the user stops speaking—without cloud logic.

### Real-Time Hardware Resampling & Bitrate Matching

**Problem:** AI models require strict formats (e.g. 16kHz or 24kHz mono 16-bit PCM). Smartphones default to 48kHz stereo.

**Solution:** Downsample and compress incoming microphone bytes on a background thread. JavaScript receives an optimized binary chunk ready for WebSocket streaming.

### Low-Latency Echo Cancellation & Noise Suppression

**Problem:** If an AI speaks through the speaker while the mic is open, the model hears itself and interrupts.

**Solution:** Build an audio node that cancels frequencies currently playing back on the device, filtering clean user speech before handing off to the model.

### Signal Flow

```
[Phone Mic] → [Nitro C++ Engine (Noise Gate + 16kHz Resample)] → [Zero-Copy ArrayBuffer] → [WebSocket] → [AI API]
```

### Production Use Cases

| Use case | Description |
| -------- | ----------- |
| **Conversational AI companions** | Lag-free vocal interactions with virtual tutors, AI receptionists, or customer service avatars. |
| **Continuous live transcription** | Clean, conditioned audio arrays for local or cloud dictation (e.g. Whisper) in medical or legal note-taking. |
| **AI-enhanced gaming & avatars** | Live lip-sync mesh animations in 3D engines driven by real-time frequency data from the user's voice. |

---

## Prototyping Next Steps

First engineering goal: capture a **16kHz mono** audio chunk and pass it as a zero-copy packet to JavaScript.

| Decision | Options |
| -------- | ------- |
| Platform capture layer | iOS (Swift) or Android (Kotlin) |
| Core math vs. native setup | C++ FFT implementation or native microphone configuration |
| Spec & linking | TypeScript `.nitro.ts` hybrid object contract |
