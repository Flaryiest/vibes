# macOS audio routing for a browser singing-practice app: AirPods output vs built-in speakers + built-in mic (state as of 2026-11-13)

Scope: Apple Silicon MacBook Pro, desktop browsers only (Chrome, Safari, Firefox), macOS 26 "Tahoe" and newer. Latest versions listed by caniuse at the time of research: Chrome 160, Edge 156, Firefox 163, Safari 27.3. Apple's Mac User Guide version selector also lists a macOS 27 release above Tahoe 26 — [Apple Mac User Guide](https://support.apple.com/guide/mac-help/mchle82b42f0/mac).

Claim tags used on every finding:
- **[D] documented** = primary source (Apple support/developer docs, W3C/MDN/caniuse compatibility data, vendor engineering blog).
- **[R] reported** = bug report, forum post, mailing-list post or individual measurement (engineer-authored statements in bug trackers are tagged [R] and the author is named).
- **[U] unverified** = speculation, or a claim I only saw as a search snippet without opening the page, or background knowledge not re-checked this session.
- **(pre-2024)** = source older than 2024; may be outdated.

Setup names: **Setup A** = AirPods for listening + MacBook built-in mic. **Setup B** = MacBook built-in speakers + built-in mic.

---

## 1. AirPods as output with the built-in mic as input: does playback stay high quality, what triggers the hands-free switch, and did macOS 26+/H2 firmware change the penalty?

### Takeaway
Apple documents that the quality drop happens only while something on the Mac is using the headphones' microphone, so Setup A (AirPods output, built-in mic pinned as input) keeps AirPods in the high-quality listening mode. The switch is triggered by any process opening the AirPods mic (including the System Settings Sound pane); no source found shows that macOS 26/27 or H2 "studio-quality recording" removes the playback penalty on a Mac, and the playback behaviour of the new recording mode is undocumented.

### Cited Findings
- **[D]** Apple describes two Bluetooth modes on Mac: one for higher-quality listening, and one for speaking through the microphone and listening, in which playback quality (and volume) is reduced; static or popping may be heard. Opening an app that uses the Bluetooth headphones' microphone switches to the second mode, and "audio quality is reduced until the microphone is no longer in use." Article published April 23, 2025 — [Apple Support 102217](https://support.apple.com/en-us/102217)
- **[D]** Apple's fixes: quit any apps using the headphones' microphone; make sure System Settings is not open to Sound settings; then reselect the headphones (switch output to the internal speakers and back) — [Apple Support 102217](https://support.apple.com/en-us/102217)
- **[R] (pre-2024, Big Sur 11.1, AirPods Pro)** Core Audio exposes AirPods as two devices: a 2-channel output-only device at native 48 kHz and a 1-channel input-only device at native 16 kHz. "The AirPods must drop their playback quality down to 16kHz whenever the microphone is activated." Selecting AirPods as input in the Sound settings pane triggers the switch because that UI opens the mic to meter levels — [Chris Liscio, Capo developer, 2021](https://supermegaultragroovy.com/2021/01/28/more-on-avaudioengine-airpods/)
- **[R] (pre-2024)** In native AVAudioEngine apps the switch was triggered merely by asking for the engine's `outputNode`/`mainMixerNode` when (a) AirPods were the system default input and (b) the app had microphone access, because the engine builds an aggregate device that includes the default input. Workaround given: make sure the Mac's default input is not the AirPods (choose the built-in mic) — [Chris Liscio, 2021](https://supermegaultragroovy.com/2021/01/28/more-on-avaudioengine-airpods/)
- **[R]** Mozilla engineer Jan-Ivar Bruaroey (2025), explaining Firefox's macOS voice-processing path, gives AirPods as the example: output dropped from 48,000 Hz to 24,000 Hz to match the 24,000 Hz AirPods microphone while the mic was in use. In the same bug a Logitech dongle headset dropped to 8,000 Hz (visible in Audio MIDI Setup); choosing a different microphone removed the problem — [Mozilla bug 1964935](https://bugzilla.mozilla.org/show_bug.cgi?id=1964935)
- **[R]** Community workaround consistently reported: set the Mac's sound input to the built-in microphone so AirPods stay in high-quality output mode; several Apple Community threads also report the low-quality mode occasionally persisting after switching inputs (search-snippet level, threads not opened) — [Apple Community thread 251432342](https://discussions.apple.com/thread/251432342); [Apple Community thread 252307810](https://discussions.apple.com/thread/252307810)
- **[D]** Apple announced (June 9, 2025) "studio-quality audio recording" and improved call quality for AirPods 4, AirPods 4 with ANC and AirPods Pro 2, stated to work across iPhone, iPad and Mac, in Camera, Voice Memos, dictation, third-party camera apps and video-conferencing apps (search-snippet level for the Newsroom page) — [MacRumors summary](https://www.macrumors.com/2025/06/09/airpods-features-ios-26/); [Apple Newsroom](https://www.apple.com/sa/newsroom/2025/06/airpods-now-more-versatile-with-studio-quality-audio-recording-and-camera-remote)
- **[D]** WWDC25 session 251 transcript: "In iOS 26, there's a new high quality, high sample rate, bluetooth option for apps that feature audio capture"; the app "uses a more reliable bluetooth link that is designed specifically for AirPods high quality recording"; it is opt-in via the `bluetoothHighQualityRecording` AVAudioSession category option (or an AVCaptureSession property), and "BluetoothHFP is a fallback in case the input route doesn't support bluetooth high quality." The transcript names no codec or sample rate, ties the API to iOS, and does not say whether playback stays high quality while recording — [WWDC25 session 251 transcript index](https://nonstrict.eu/wwdcindex/wwdc2025/251/); [Apple video page](https://developer.apple.com/videos/play/wwdc2025/251/)
- **[D]** Apple's API reference describes `bluetoothHighQualityRecording` as an option "to enable high-quality audio for input and output routes" (search-snippet level) — [Apple Developer documentation](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/bluetoothhighqualityrecording)
- **[U]** A MacRumors forum commenter guessed the high-quality recording mode uses the whole link bandwidth for the mic and turns off the audio back channel (no listening while recording); the commenter hedged "But I could be wrong" — [MacRumors forum thread](https://forums.macrumors.com/threads/all-the-new-airpods-features-coming-in-ios-26.2458485)

### Inferences
- Setup A is safe for playback quality provided no process on the Mac has the AirPods mic open. That includes this app, other tabs/apps (Zoom, Meet, dictation), and the System Settings > Sound pane.
- The dangerous moment is the first `getUserMedia` call. macOS makes AirPods the default input on connect, so `getUserMedia({audio: true})` (or `deviceId: "default"`) opens the AirPods mic and flips the link to hands-free mode for as long as that track is live. Design consequence: do the permission-granting call before any music is playing, stop that track immediately, then reopen with an exact built-in-mic `deviceId` (see section 2). Expect a short audible glitch on that first-run flow.
- The mic-active mode appears to have moved from 16 kHz (2021 report, AirPods Pro, Big Sur) to 24 kHz (2025 engineer statement) on current hardware/OS. If so the penalty is smaller than it used to be but still real: output band-limited to under 12 kHz and, by Apple's description, reduced quality and volume. The two reports are different AirPods/macOS combinations and neither is an Apple statement, so treat the 24 kHz figure as indicative.
- What a page can observe when the switch happens is limited. `AudioContext.sampleRate` is fixed when the context is constructed (Web Audio spec behaviour, background knowledge not re-checked this session), so the context rate should not change; the hardware rate change is absorbed by browser resampling. Practical detection signals are: the live mic track's `label` containing "AirPods", a `devicechange` event, and a change in `AudioContext.outputLatency`. All three need an on-device test.
- For a web app there is no way to request Apple's high-quality Bluetooth recording mode; it is an opt-in native session option. Whether any browser opts in on macOS is unknown, so the spec should assume the AirPods mic always costs playback quality and should never use it.

### Gaps
- No Apple statement found on whether macOS 26/27 with H2 AirPods keeps stereo AAC playback while the AirPods mic is recording. No evidence found of LE Audio/LC3 or any newer codec being used between AirPods and a Mac.
- No test data on what `MediaStreamTrack.getSettings().sampleRate` reports for an AirPods mic in Chrome, Safari or Firefox on macOS 26+.
- Not confirmed whether simply creating an `AudioContext` or calling `enumerateDevices()` while AirPods are the default input can trigger the switch in any browser. The only hint is a bug reporter's statement that Chrome "opens independent input and output units" — [Mozilla bug 2073800](https://bugzilla.mozilla.org/show_bug.cgi?id=2073800) — which suggests Chrome only touches the input device named in `getUserMedia`.
- The reports that low-quality mode sometimes "sticks" after the mic is released were not investigated for macOS 26+.

---

## 2. Pinning the built-in microphone and choosing/observing the output device

### Takeaway
Pin the mic by matching the label from `enumerateDevices()` after permission and reopening with `deviceId: {exact: id}`; never rely on the default device, because Chrome and Safari add a non-standard "Default" mic entry that follows the OS default and the browsers disagree on ordering and `devicechange` behaviour. For output, `AudioContext.setSinkId` is Chromium-only (110+), `HTMLMediaElement.setSinkId` is in Chrome 49+/Firefox 116+/Safari 18.4+, `selectAudioOutput` is Firefox-only (116+), and no API exposes the transport, so "is this Bluetooth?" can only be guessed from the label.

### Cited Findings
Input device enumeration and events
- **[R]** W3C WebRTC WG log (Sept 2023) of connecting AirPods on macOS: Chrome fired eight `devicechange` events with interleaved `enumerateDevices()` calls, including entries labelled "Default - MacBook Pro Microphone (Built-in)" and then "Default - AirPods"; Firefox fired one event; Safari fired four, and Safari also fires `devicechange` as part of `getUserMedia`. Chrome and Safari both add a non-standard "Default" microphone entry — [W3C public-webrtc-logs, J-I Bruaroey, 2023-09-26](https://lists.w3.org/Archives/Public/public-webrtc-logs/2023Sep/0172.html)
- **[R]** Same source: handling `devicechange` by calling `enumerateDevices()` inside the handler is racy ("100+ milliseconds may have passed"), and code that works in one browser can fail in another — [W3C public-webrtc-logs, 2023-09-26](https://lists.w3.org/Archives/Public/public-webrtc-logs/2023Sep/0172.html)
- **[R]** W3C WebRTC WG post (Oct 2025): when the default mic is changed in System Settings, "Firefox and Safari update their order to match, but not Chrome"; Chrome "shows the '(chosen)' ones first, with 'Default: Airpods' listed third", and "No `devicechange` is fired" in Chrome for that case. Chrome treats the device picked in its permission prompt as a per-page "UA default". Firefox lists OS default devices first and expects sites to check `track.getSettings().deviceId` — [W3C public-webrtc, J-I Bruaroey, Oct 2025](https://lists.w3.org/Archives/Public/public-webrtc/2025Oct/0012.html)
- **[R]** Spec issue: Chrome shows the default device twice (a "Default" entry plus the real device) and does not fire `devicechange` for it (search-snippet level) — [w3c/mediacapture-main issue 966](https://github.com/w3c/mediacapture-main/issues/966)
- **[R]** 2024 spec thread: in Chrome, `devices.find(d => d.kind == "audiooutput")` returns the entry with `deviceId: "default"`; when AirPods are the OS default output Chrome may expose no separate entry for them (search-snippet level) — [W3C public-webrtc-logs, Aug 2024](https://lists.w3.org/Archives/Public/public-webrtc-logs/2024Aug/0105.html)
- **[R] (pre-2024)** WebKit bug titled "The data on the active microphone is not updated when AirPods are connected" (2022; title only, not opened) — [WebKit bug 239121](https://auto-bugs.webkit.org/show_bug.cgi?id=239121)

Output device APIs
- **[D]** `AudioContext.setSinkId`: Chrome 110+, Edge 110+, Opera 96+; not supported in Firefox (through 163) or Safari (through 27.3; Technology Preview "support unknown") — [caniuse](https://caniuse.com/mdn-api_audiocontext_setsinkid); [Chrome for Developers](https://developer.chrome.com/blog/audiocontext-setsinkid)
- **[D]** `AudioContext.setSinkId` details: needs permission to access audio devices for a non-default output (a `getUserMedia` grant satisfies it); can be blocked by the `speaker-selection` Permissions Policy; rejects with `NotAllowedError`, `NotFoundError` or `InvalidAccessError`; `{type: "none"}` processes audio without playing it; the device can be changed during playback; secure context only; feature-detect with `"setSinkId" in AudioContext.prototype` — [MDN AudioContext.setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId); [Chrome for Developers](https://developer.chrome.com/blog/audiocontext-setsinkid)
- **[D]** `HTMLMediaElement.setSinkId`: Chrome 49+, Edge 17+, Firefox 116+, Safari 18.4+ — [caniuse](https://caniuse.com/mdn-api_htmlmediaelement_setsinkid)
- **[R]** A LiveKit SDK pull request states Apple added `setSinkId` in Safari 26 and that calling it on audio elements backed by WebRTC remote tracks is silently ignored; a July 2026 WebKit bug reports `setSinkId` resolving successfully on iOS Safari while audio keeps playing on the default output (iOS, out of scope, but a maturity signal). The "Safari 26" version conflicts with caniuse's "18.4" (search-snippet level for both) — [LiveKit client-sdk-js PR 1635 mirror](https://gh.r-mj.com/livekit/client-sdk-js/pull/1635); [WebKit bug 320087](https://bugs.webkit.org/show_bug.cgi?id=320087); contradicted on version by [caniuse](https://caniuse.com/mdn-api_htmlmediaelement_setsinkid)
- **[D]** `MediaDevices.selectAudioOutput`: Firefox 116+ only; not supported in Chrome (through 160), Edge (through 156) or Safari (through 27.3) — [caniuse](https://caniuse.com/mdn-api_mediadevices_selectaudiooutput)
- **[D]** `selectAudioOutput` requires transient user activation (else `InvalidStateError`), can be blocked by `speaker-selection`, and resolves with a `MediaDeviceInfo` (`kind`, `label`, `deviceId`); a stored device ID may change between sessions and must pass through `selectAudioOutput()` again before `setSinkId()` accepts it — [MDN selectAudioOutput](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/selectAudioOutput)
- **[D]** `AudioContext.outputLatency` is specified to update when the audio output device changes — [web.dev](https://web.dev/articles/audio-output-latency)

### Inferences
- Pinning recipe (to be validated on device):
  1. On a user gesture and before any playback, call `getUserMedia({audio: true})` once to obtain permission, then stop the track at once.
  2. Call `enumerateDevices()`; among `audioinput` entries ignore any whose `deviceId` is `"default"` or whose label starts with "Default"; pick the entry whose label matches `/MacBook.*Microphone/i` (Chrome shows "MacBook Pro Microphone (Built-in)").
  3. Open the real stream with `deviceId: {exact: id}` plus the processing constraints from section 5.
  4. Confirm with `track.getSettings().deviceId` and `track.label`; if the label contains "AirPods" (or any non-built-in name) show a blocking warning.
  5. Persist the chosen id, but always re-resolve by label on load, since ids can change.
- `devicechange` handling: debounce (several hundred ms), then re-enumerate once; do not assume one event per physical change, and do not assume Chrome fires it when only the OS default changes. Also listen for the mic track's `ended` event. Because the stream is pinned by exact id, an AirPods connect should not move the mic; the handler's job is to refresh the output label and invalidate latency calibration.
- Output selection: in Chrome, leave the context on the system default output (macOS routes to AirPods on connect) and optionally offer `audioCtx.setSinkId(id)`. Safari and Firefox cannot retarget an `AudioContext`; routing there is whatever macOS chooses, unless playback is restructured through a media element.
- Detecting Bluetooth: the device objects returned by these APIs carry only kind/label/id, so the app can only pattern-match the output label (for example "AirPods", "Beats", "Bose") and treat a large `outputLatency` as a secondary hint. Provide a manual "I'm using wireless headphones" toggle as the reliable path.
- Reading the current default output's label in Chrome relies on the `audiooutput` entry with `deviceId: "default"` carrying a "Default - <name>" label. This is reported behaviour, not specified, so the UI must tolerate a missing or generic label.

### Gaps
- Stability of the built-in mic's `deviceId` across sessions/browser restarts on macOS 26+ was not researched.
- Not verified whether Safari 26/27 lists `audiooutput` devices in `enumerateDevices()` on macOS, or how its output labels look.
- Not verified whether an exact-id built-in-mic stream is ever rerouted by Safari when AirPods connect (the 2022 WebKit bug title suggests device-change handling has had problems).
- No primary Chrome documentation found for the current "Default - …" labelling; behaviour is from W3C working-group posts.

---

## 3. AirPods output latency, accuracy of the Web Audio latency APIs, and calibration methods

### Takeaway
The only per-generation measurements found are Stephen Coyle's iPad tap-to-sound figures (274 / 178 / 144–167 / 126 ms for AirPods 1 / AirPods 2 / AirPods Pro 1 / AirPods Pro 2, against 83 ms for the iPad's own speaker); nothing measured on macOS and nothing for AirPods 3, AirPods 4, AirPods Pro 3 or AirPods Max. `AudioContext.outputLatency` now exists in Chrome 102+, Firefox 70+ and Safari 18.4+ but is defined as an estimate with credible reports of under-reporting, so a measured per-route calibration is required.

### Cited Findings
AirPods latency figures
- **[R] (pre-2024; 2018 iPad Pro, iOS 13)** Tap-to-sound latency: AirPods 1st gen 274 ms, AirPods 2nd gen 178 ms, AirPods Pro 144 ms. Method: Apple Pencil taps recorded with a shotgun mic, 19 measurements averaged; the figures include touch-input and software delay, not just Bluetooth — [Stephen Coyle, 21 Dec 2019](https://stephencoyle.net/airpods-pro); [9to5Mac](https://9to5mac.com/2019/12/22/airpods-latency-test/)
- **[R] (pre-2024; iPad Pro)** AirPods Pro 2nd gen 126 ms; AirPods Pro 1st gen re-measured at 167 ms (the earlier 144 ms used a different averaging method); iPad Pro built-in speaker 83 ms, so AirPods Pro 2 are "only 43ms" slower than the built-in speaker. The author estimates up to two-thirds of the delay occurs before Bluetooth data leaves the device — [Stephen Coyle, 10 Nov 2022](https://stephencoyle.net/airpods-pro-2); [9to5Mac](https://9to5mac.com/2022/11/15/airpods-pro-2-latency-test/)
- **[R]** A 2026 aggregator post cites RTINGS for an average of 170.3 ms across six gaming headsets over Bluetooth SBC, and argues a calibration offset can hide a fixed Bluetooth delay but "any reconnection can shift the delay again" (secondary source, weak; search-snippet level) — [voxbooster roundup](https://voxbooster.com/blog/rhythm-game-audio-latency-calibration-statistics-2026/)

Web Audio latency APIs
- **[D]** `AudioContext.outputLatency` support: Chrome 102+, Edge 102+, Firefox 70+, Safari 18.4+ — [caniuse](https://caniuse.com/mdn-api_audiocontext_outputlatency); [web.dev](https://web.dev/articles/audio-output-latency)
- **[D]** It "provides an estimate of audio hardware's output latency", with Bluetooth earbuds and USB interfaces given as examples; Google's demo updates the value in real time when the device changes — [web.dev](https://web.dev/articles/audio-output-latency)
- **[R] (pre-2024)** Chrome's intent-to-ship thread notes the value "does not work properly without an actual audio device", and a Chrome engineer told webkit-dev that accuracy/precision of the served value is at the user agent's discretion (search-snippet level) — [blink-dev intent to ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/dTQniJNVVMY/m/hPFwY1fbBQAJ); [webkit-dev thread](https://lists.webkit.org/archives/list/webkit-dev@lists.webkit.org/thread/Z3KWW3MGU773WLHZRPHYG56DOVNMALRX)
- **[R] (pre-2024)** Measured in 2021 (when only Firefox had it), `outputLatency` returned "implausibly low numbers, less than half of the end-to-end latency"; a commenter adds that Bluetooth headsets "are notorious for reporting much lower latencies than they implement", while noting that a change in the reported number is still a useful "re-measure now" signal — [Jeff Kaufman, Browser Audio Latency, Feb 2021](https://www.lesswrong.com/posts/ooXEzrX7Y9Go6D7st/browser-audio-latency)
- **[R] (pre-2024)** A developer reported being unable to use `getOutputTimestamp()` in Safari while it worked in Chrome on Apple devices — [Apple Developer Forums thread 696356](https://developer.apple.com/forums/thread/696356)
- **[R] (pre-2024, fixed)** WebKit bug: with a Bluetooth speaker connected, `AudioContext.currentTime` advanced 1.09 s per real second and audio would not play (Nov 2021, fixed shortly after) — [WebKit bug 232728](https://bugs.webkit.org/show_bug.cgi?id=232728)
- **[R]** A further WebKit bug covers distorted Web Audio playback after connecting a Bluetooth speaker on macOS (title only, not opened) — [WebKit bug 258864](https://onbugs.webkit.org/show_bug.cgi?id=258864)

Calibration methods and measured round-trip latency
- **[R] (pre-2024)** Acoustic loopback method: play a beep through the speaker and time its arrival in the microphone samples (AudioWorklet test page). Results on a 2016 15" MacBook Pro, macOS 11.1: about 67 ms in Chrome and 55 ms in Firefox with defaults; about 19 ms in Chrome and 14 ms in Firefox with `latencyHint: 0` and echo cancellation, noise suppression and auto gain control disabled — [Jeff Kaufman, Feb 2021](https://www.lesswrong.com/posts/ooXEzrX7Y9Go6D7st/browser-audio-latency)
- **[R] (pre-2024)** Same page, later comments: on a 2022 MacBook Air (macOS 13.2) a reader measured about 70 ms best case in Chrome with the optimisations and about 100 ms without; the author then measured 68 ms in Chrome Canary. These are much higher than the 2021 figures on the same test page — [Jeff Kaufman, comments](https://www.lesswrong.com/posts/ooXEzrX7Y9Go6D7st/browser-audio-latency)
- **[R]** Tap-test calibration as used in a browser drum trainer: measure the player's average signed error over a short tap-along test once, store it as an offset, subtract it from every later judgment (search-snippet level) — [DEV Community post](https://dev.to/joseph_anady_214bacedf939/building-a-real-time-offline-drum-trainer-in-the-browser-with-web-audio-and-web-midi-5clk)
- **[R]** Rhythm-game guidance: prefer wired audio and calibrate last, because Bluetooth adds encode/decode and buffering delay (search-snippet level) — [Rythmagica latency guide](https://www.rythmagica.net/pages/taiko-no-tatsujins-latency-problem-the-ultimate-guide-for-beginners)

### Inferences
- Subtracting Coyle's own speaker baseline gives the Bluetooth-added delay on his iPad rig: about 43 ms for AirPods Pro 2 and about 84 ms for AirPods Pro 1 (2022 test: 126 − 83 and 167 − 83). The 2019 figures cannot be baselined the same way (no speaker value in the text). None of this is a macOS number.
- For timing scoring the app does not need output and input latency separately. The singer hears the track late by the output latency and their voice reaches the worklet late by the input latency; the sum is exactly what an acoustic loopback measures. So a single measured round-trip offset per route, subtracted from mic timestamps, is the right compensation constant.
- Setup A loopback is possible without extra hardware: hold one AirPod against the MacBook's mic grille, play a click or chirp train, cross-correlate the captured signal with the reference in the worklet. At 48 kHz the correlation peak is resolvable to well under a millisecond; real-world error is dominated by acoustic distance (about 3 ms per metre) and run-to-run buffering differences, so take the median of several clicks. This is my reasoning, not a sourced accuracy figure.
- Tap-along tests measure human anticipation as well as latency, so they are a fallback (for users who cannot do the loopback) and need many taps averaged; they should be presented as "fine-tune" rather than ground truth.
- Because nothing was found on within-session drift, treat the calibration as valid only while the route is unchanged, and invalidate it on: `devicechange`, any change in `outputLatency`, a change of sink, AirPods reconnect, or the mic-active (hands-free) switch. Key the stored offset by output label + input label + browser.
- Use `outputLatency` as a sanity check and change detector, not as the compensation value. A reasonable rule: if the measured round trip and `baseLatency + outputLatency` disagree by a wide margin, trust the measurement.
- The large spread between the 2021 (about 19 ms) and 2023 (about 68–70 ms) built-in round-trip measurements means Setup B also needs calibration; do not hard-code a built-in-speaker constant.

### Gaps
- No AirPods latency measurement on macOS found, and none for AirPods 3, AirPods 4, AirPods Pro 3 or AirPods Max on any platform.
- No data on how stable AirPods latency is within a session on macOS.
- No 2024+ validation found of how close Chrome's or Safari's `outputLatency` is to truth for Bluetooth or built-in speakers on macOS; `baseLatency` and `getOutputTimestamp()` accuracy were not covered by any current source I found.
- No sourced accuracy figures for click cross-correlation versus tap tests; DAW practice (loopback "ping" recording-offset tools) was not researched.

---

## 4. Input-side latency for the built-in mic via getUserMedia + AudioWorklet

### Takeaway
No authoritative per-browser input-latency figure for Apple Silicon was found; the only hard numbers are whole speaker-to-mic round trips (about 14–19 ms best case in 2021, about 68–100 ms in 2023 reports). `MediaTrackSettings.latency` should not be trusted: when tested it was Chrome-only and always returned 0.01.

### Cited Findings
- **[R] (pre-2024)** `MediaTrackSettings.latency` was implemented only in Chrome and "always returned 0.01 (10ms), even with a higher-latency microphone"; setting high `latency` values in `getUserMedia` had no apparent effect in Chrome or Firefox — [Jeff Kaufman, Feb 2021](https://www.lesswrong.com/posts/ooXEzrX7Y9Go6D7st/browser-audio-latency)
- **[R] (pre-2024)** Disabling echo cancellation, noise suppression and auto gain control and setting `latencyHint: 0` cut the measured round trip on a MacBook from about 67 ms to about 19 ms in Chrome and from about 55 ms to about 14 ms in Firefox — [Jeff Kaufman, Feb 2021](https://www.lesswrong.com/posts/ooXEzrX7Y9Go6D7st/browser-audio-latency)
- **[R] (pre-2024)** 2023 reader report on a 2022 MacBook Air, Chrome: about 70 ms with those optimisations, about 100 ms without; author measured 68 ms in Chrome Canary — [Jeff Kaufman, comments](https://www.lesswrong.com/posts/ooXEzrX7Y9Go6D7st/browser-audio-latency)

### Inferences
- The voice-processing chain (echo cancellation, noise suppression, gain control) is worth roughly 30–50 ms of round-trip latency on the evidence above, which is a second reason (besides signal integrity) to disable all three for this app.
- Input latency is best treated as an unmeasured component folded into the loopback round trip from section 3. The spec should not depend on a reported input-latency value.
- AudioWorklet itself adds one render quantum (128 frames, about 2.7 ms at 48 kHz); this is standard Web Audio behaviour from background knowledge, not re-checked this session.

### Gaps
- No measured input-only latency for built-in mic capture in Chrome or Safari on Apple Silicon.
- No current data on whether Safari or Firefox expose `MediaTrackSettings.latency`, or whether Chrome's value is still a constant.
- The 2021 vs 2023 round-trip discrepancy is unexplained (different hardware, OS and Chrome versions); no Apple Silicon MacBook Pro measurement was found at all.

---

## 5. Built-in speakers + built-in mic: echo cancellation, constraint handling, pitch tracking through AEC, and Mic Modes

### Takeaway
All three browsers enable echo cancellation by default, and on macOS Safari and Firefox route it through Apple's voice-processing audio unit, which brings ducking, gain changes and input/output format coupling; the consistent advice from engineers and music-app developers is to set `echoCancellation`, `noiseSuppression` and `autoGainControl` to `false` explicitly. No source was found showing that sung pitch can be tracked reliably through echo cancellation with a backing track playing; the available evidence (sustained sung notes being attenuated, duplex gating) points the other way, so speaker bleed has to be handled by the app or avoided with headphones.

### Cited Findings
Safari
- **[R]** Apple engineer (June 2026): "Safari on macOS enables `echoCancellation` by default as part of its WebKit audio processing. When `echoCancellation` is active, any other apps recording audio concurrently can experience a significantly reduced input volume -- this is a known WebKit behavior." Advice: "Try explicitly setting it to false in your getUserMedia constraints" — [Apple Developer Forums thread 832452](https://developer.apple.com/forums/thread/832452)
- **[R]** WebKit bug 294623 (status NEW, filed June 2025; Safari 18.5/macOS 15.5 and Safari 17.3.1/macOS 14.3.1): WebKit engineer Youenn Fablet: "This is the getUserMedia call that is likely triggering audio ducking" and suggests `echoCancellation: false`. Reporter's result: with it false, the first capture after launching Safari still ducked for "2-3 seconds, then came back to regular volume"; later captures did not duck until Safari was restarted. No fix landed — [WebKit bug 294623](https://bugs.webkit.org/show_bug.cgi?id=294623)
- **[R] (pre-2024)** WebKit bug "Can not disable audio processing (lowpass)": even with `echoCancellation` false, high frequencies were filtered out (search-snippet level, not opened) — [WebKit bug 192932](https://bugs.webkit.org/show_bug.cgi?id=192932)

macOS voice processing (the unit Safari and Firefox use)
- **[R] (pre-2024)** When a VoiceProcessingIO unit is initialised, other audio playing on the system "becomes significantly quieter" and returns to normal when the unit is torn down (search-snippet level) — [Apple Developer Forums thread 93995](https://developer.apple.com/forums/thread/93995)
- **[R] (pre-2024)** With AUVoiceProcessing the gain of both the microphone and the speaker is reduced; a reply says AVAudioEngine "works just fine on MacOS 14+ with new audio ducking API" (search-snippet level) — [Apple Developer Forums thread 733733](https://developer.apple.com/forums/thread/733733)

Firefox
- **[R]** Since bug 1404972 Firefox uses macOS's Voice-Processing I/O echo canceller; while the mic is in use, output is aligned with the input format for full-duplex audio. The preference `media.getusermedia.audio.processing.platform.enabled` (set to false) is the suggested way to turn the platform path off — [Mozilla bug 1964935, J-I Bruaroey](https://bugzilla.mozilla.org/show_bug.cgi?id=1964935)
- **[R]** Firefox 131: calling `getUserMedia()` made the system microphone volume "very quiet" (duplicate of bug 1896938); another bug found input over-amplified when VoiceProcessingIO ran in bypass mode with AGC disabled, fixed by no longer using bypass or disabling AGC by default (search-snippet level) — [Mozilla bug 1922313](https://bugzilla.mozilla.org/show_bug.cgi?id=1922313); [Mozilla bug 1890426](https://bugzilla.mozilla.org/show_bug.cgi?id=1890426)
- **[R]** Open regression (status NEW; Firefox 155.0.1–159, macOS 26.5.1, M2 Pro): "while a microphone is open, all page audio is delivered to the input device's own output channels", so playback on the default output goes silent while the track is live and nothing is reported to the page. Reproduced with a USB mic and with BlackHole, with echo cancellation, noise suppression and auto gain all disabled (so not the voice-processing path). "Chrome on the same machine is unaffected (it opens independent input and output units)." Workarounds: create the playback `AudioContext` at a sample rate different from the device's native rate, or set the output `sinkId` explicitly. A related bug is titled "echoCancellation makes WebAudio output sound poor on macOS" — [Mozilla bug 2073800](https://bugzilla.mozilla.org/show_bug.cgi?id=2073800)

Chrome
- **[D] (pre-2024)** In Chrome M66/M67 the macOS native echo canceller was an opt-in experiment (origin trial or `--enable-blink-features=ExperimentalHardwareEchoCancellation`) applied to `getUserMedia` streams with `echoCancellation` enabled — [Chrome for Developers: macOS native echo cancellation](https://developer.chrome.com/blog/macos-native-echo-cancellation)
- **[D] (pre-2024)** Chrome M68 added an experimental `echoCancellationType` constraint (`browser` = Chrome's software canceller, `system` = the OS canceller), readable through `track.getSettings()`; "Without specifying the constraint, Chrome will never chose one of the two experimental echo cancellers"; the earlier macOS implementation "lacked the ability to correctly track which output device was being used" — [Chrome for Developers: More native echo cancellation](https://developer.chrome.com/blog/more-native-echo-cancellation/)
- **[D]** W3C TAG review of "echoCancellation mode" (opened June 9, 2025, closed satisfied July 10, 2025): an app can ask to remove only audio coming from remote peers via peer connections, or to remove all system audio, or let the browser decide. The review page does not state the Chrome version — [W3C TAG design review 1107](https://tag-github-bot.w3.org/gh/w3ctag/design-reviews/1107)

Whether the three constraints are honoured, and effect on singing
- **[R]** WebRTC discussion thread "How to avoid loudness reduction for sustained tones?": a sustained sung note declines steadily in loudness for listeners. Replies blame noise suppression (a sustained note is "easily classified as background noise") or gain control. In Dec 2023 the poster found `noiseSuppression: false` plus `autoGainControl: false` made "no discernable difference"; in May 2024 another developer reported `echoCancellation: {exact: false}` fixed it on the non-Safari browsers tested, including macOS Chrome and Firefox — [discuss-webrtc thread](https://groups.google.com/g/discuss-webrtc/c/PDZYMzAI-_Y)
- **[R] (pre-2024; Chrome 62, Firefox 56, Safari 11)** In 2017 Chrome's auto gain control could not be controlled by the `autoGainControl` constraint and was only switched off by disabling echo cancellation; Firefox honoured `noiseSuppression` and `autoGainControl`; Safari 11 supported neither. Capture sample rate was fixed at 48,000 Hz in Chrome/Firefox and 44,100 Hz in Safari — [Pipe blog, Nov 2017](https://blog.addpipe.com/audio-constraints-getusermedia/)
- **[R] (pre-2024; Linux)** White-noise test: in Chromium, "setting both `echoCancellation` and `noiseSuppression` to `false` yields flat frequency characteristics"; Firefox did not become completely flat (high-frequency gain stayed lower) and echo cancellation behaved unstably — [cat-in-136, Oct 2020](https://cat-in-136.github.io/2020/10/gum-frequency-characteristic-depending-on-audio-parameters.html)
- **[R]** A music app developer on Apple's forum says their recording path calls `getUserMedia` with echo cancellation disabled, and the Apple engineer notes other music web apps "likely already set `echoCancellation: false` explicitly" — [Apple Developer Forums thread 832452](https://developer.apple.com/forums/thread/832452)
- **[D]** Agora's web audio-quality guide lists karaoke among high-quality use cases and its example turns off echo cancellation, gain control and noise reduction together (search-snippet level) — [Agora docs](https://docs.agora.io/en/realtime-media/voice/build/enhance-the-audio-experience/best-practices-sound-quality/web.md)
- **[R]** DXOMARK's lab test of the MacBook Pro 14" (2023) found "Duplex situations induced some gating that may impair voice intelligibility" and that capture in the video-call use case was mono only — [DXOMARK MacBook Pro 14" (2023)](https://www.dxomark.com/apple-macbook-pro-14-2023-laptop-test/)

Mic Modes
- **[D]** Mic Modes are chosen from the menu-bar video/mic control while in "an app that supports Mic Modes, such as FaceTime": Standard, Voice Isolation ("filter out background sounds"), Wide Spectrum ("include the sounds around you"); "Options vary by app" — [Apple Mac User Guide](https://support.apple.com/guide/mac-help/mchle82b42f0/mac)
- **[R]** Apple Community guide: Mic Modes are available on Mac models from 2018 and later (search-snippet level) — [Apple Community: Mic Modes on the Mac](https://discussions.apple.com/docs/DOC-250008346)
- **[R]** Mozilla Connect thread: Safari triggers the macOS Mic Mode panel (Voice Isolation) on sites like Google Meet; after Mozilla hooked up macOS's built-in voice processing, a tester reported Firefox Nightly offering Voice Isolation and Wide Spectrum on macOS 14.5.1; a later user says Google Meet cannot detect Voice Isolation (search-snippet level; page returned HTTP 403 when opened) — [Mozilla Connect: Voice isolation on macOS](https://connect.mozilla.org/t5/ideas/voice-isolation-on-macos/idc-p/59117)

### Inferences
- With continuous backing music from the speakers, an echo canceller is in permanent "double-talk", which is the hardest case for it; combined with the reports of gating in duplex and of held sung notes being faded, enabling echo cancellation is likely to damage exactly the long sustained notes the app scores. The app should therefore run with all three processing constraints false in both setups and treat bleed as its own problem.
- Options for speaker bleed in Setup B, in rough order of practicality (design reasoning, not sourced evidence): (1) strongly recommend headphones and present speakers as a degraded mode; (2) keep the reference-melody guide out of the speaker mix (or very quiet) while scoring, so the bleed does not contain the target pitch; (3) constrain the pitch tracker to the expected vocal range and to continuity around the target note; (4) exploit the fact that the app knows the exact playback signal: after loopback calibration, run its own adaptive filter (reference-based subtraction) in the AudioWorklet, or at minimum mask frames where the mic signal correlates strongly with the delayed reference; (5) lower speaker volume and ask the user to sing close to the laptop.
- Mic Modes appear to be offered only when the capturing app uses Apple's voice-processing path. With `echoCancellation: false` in Safari and Firefox, and in Chrome generally, the capture is probably outside Mic Modes. No web API was found to read or set the mode, so the app can neither detect nor change it; the help text should tell users to choose Standard if the menu shows a Mic Mode for the browser.
- Safari's first-capture ducking (2–3 s after browser launch, even with echo cancellation off) means the app should open the mic stream before starting playback and keep one stream open for the session rather than reopening per song.
- The Firefox routing regression was reproduced with devices that have both input and output channels (USB mic with headphone out, BlackHole). The MacBook's built-in mic is a separate input-only device, so it may not be affected, but this is untested and it is a reason not to make Firefox a supported target.

### Gaps
- No primary source found for which echo canceller current Chrome (150s–160) uses by default on macOS, whether the experimental `echoCancellationType` constraint still exists, or whether Chrome ducks other audio when echo cancellation is on. The Chrome material found is from 2018.
- No Chrome version found for the shipped "echoCancellation mode" values.
- No study or project write-up found that measures sung-pitch accuracy through echo cancellation with a backing track, and no web karaoke or tuner project documenting a speaker-bleed strategy beyond "disable processing / use headphones".
- Whether each of the three constraints is individually honoured in current Chrome, Safari and Firefox on macOS 26+ was not confirmed by a current primary source; the per-constraint evidence is from 2017–2020. Verify at runtime with `track.getSettings()` and by ear.
- Whether Safari still band-limits capture with echo cancellation off (2018 bug) is unknown.
- Mic Mode applicability to Chrome capture, and to any browser when echo cancellation is off, is unconfirmed.

---

## 6. MacBook Pro (2021–2026) built-in three-microphone array: frequency response and low-frequency behaviour

### Takeaway
No published numeric frequency-response curve or low-frequency roll-off figure was found for any Apple Silicon MacBook Pro microphone. The only lab evaluation located (DXOMARK, 14" 2023) describes voice capture as having "good, if slightly boomy, tonal balance" with noise reduction off by default and mono capture, which suggests no aggressive bass cut at speech frequencies but says nothing specific about 65–130 Hz.

### Cited Findings
- **[R]** DXOMARK MacBook Pro 14" (2023): manufacturer spec quoted as "3-microphone array with beamforming"; capture score 122 (best in class 133); "Audio capture of voices featured good, if slightly boomy, tonal balance"; "Noise reduction is disabled by default, so noise levels were quite high. (The device relies more on videoconferencing apps to handle noise reduction.)"; "Envelopes were sharp and well preserved"; "mono-only audio capture" in video calls. The page includes a 1/12-octave capture frequency-response graph measured at 1 m in an anechoic environment, but the values are in an image, not the text. Scores are "based on an older laptop testing protocol" — [DXOMARK](https://www.dxomark.com/apple-macbook-pro-14-2023-laptop-test/)
- **[D]** Apple markets the 14" and 16" models as having a "studio-quality" three-microphone array with a high signal-to-noise ratio (marketing claim; search-snippet level via trade press) — [Mixdown](https://mixdownmag.com.au/news/apple-macbook-pro-14-inch-and-16-inch-a-new-best-for-music-producers/)
- **[R]** A measurement forum thread reports attenuation above roughly 10 kHz on macOS that appeared with both the internal mic and a calibrated USB measurement mic, i.e. not specific to the built-in mic (search-snippet level, not opened) — [AV NIRVANA thread](https://www.avnirvana.com/posts/110922)

### Inferences
- "Slightly boomy" voice capture is weak evidence that the raw path does not apply a steep high-pass in the 100–200 Hz region. It does not establish response down to 65 Hz (C2), and small MEMS capsules in a laptop chassis commonly roll off below roughly 100 Hz, so the lowest fundamentals may arrive attenuated.
- This matters less than it seems for scoring, because pitch trackers that work on periodicity can recover a fundamental from its harmonics even when the fundamental itself is weak (covered by the earlier pitch-detection research). The risk is octave errors on the lowest notes when the fundamental is both attenuated and masked by speaker bleed or fan/handling noise.
- DXOMARK's "noise reduction is disabled by default" plus the browsers' behaviour in section 5 suggests that with all processing constraints off the app gets a largely unprocessed mono signal. Whether Apple's beamforming is applied on that path is unknown.
- The spec should include a one-off device check: have the user sustain a low note (or play a slow sine sweep from the speakers at low volume), and inspect the captured spectrum at 65–130 Hz to confirm usable signal-to-noise before relying on the built-in mic for the lowest notes.

### Gaps
- No numeric frequency response, roll-off corner, or self-noise figure for the built-in mic array from Apple, reviewers or audio engineers.
- Unknown whether beamforming or any fixed high-pass is always on for non-voice-processing capture, and which of the three capsules feed a browser `getUserMedia` stream.
- No differences between 2021, 2023 and 2024–2026 MacBook Pro generations were found.

---

## 7. Best desktop browser target on macOS as of late 2026, and recommended configuration per setup

### Takeaway
Chrome (or another Chromium browser) is the best target: it is the only engine with `AudioContext.setSinkId`, it is reported to open input and output as independent devices (avoiding the aggregate-device and voice-processing coupling seen in Firefox and Safari), and disabling echo cancellation is reported to work there. Safari is a workable second target if processing is disabled and the mic is opened before playback; Firefox currently has an open macOS regression that can silence page audio while a mic is open.

### Cited Findings
- **[D]** Chromium is the only engine with `AudioContext.setSinkId` (Chrome/Edge 110+); Firefox and Safari do not support it through Firefox 163 and Safari 27.3 — [caniuse](https://caniuse.com/mdn-api_audiocontext_setsinkid)
- **[D]** `AudioContext.outputLatency` is available in all three engines: Chrome 102+, Firefox 70+, Safari 18.4+ — [caniuse](https://caniuse.com/mdn-api_audiocontext_outputlatency)
- **[R]** Chrome "opens independent input and output units" on macOS, and was unaffected by the Firefox aggregate-device regression — [Mozilla bug 2073800](https://bugzilla.mozilla.org/show_bug.cgi?id=2073800)
- **[R]** `echoCancellation: {exact: false}` was reported to stop sustained-note attenuation in macOS Chrome and Firefox (May 2024) — [discuss-webrtc thread](https://groups.google.com/g/discuss-webrtc/c/PDZYMzAI-_Y)
- **[R]** Chrome's device list quirks: non-standard "Default - …" entry, bursts of `devicechange` events on AirPods connect, and no reorder or event when only the OS default changes — [W3C public-webrtc-logs, 2023](https://lists.w3.org/Archives/Public/public-webrtc-logs/2023Sep/0172.html); [W3C public-webrtc, Oct 2025](https://lists.w3.org/Archives/Public/public-webrtc/2025Oct/0012.html)
- **[R]** Safari: echo cancellation on by default via WebKit audio processing; open bug where `getUserMedia` triggers ducking, with a 2–3 s ducking episode on first capture after launch even when echo cancellation is disabled — [Apple Developer Forums thread 832452](https://developer.apple.com/forums/thread/832452); [WebKit bug 294623](https://bugs.webkit.org/show_bug.cgi?id=294623)
- **[R]** Firefox: uses macOS voice processing for echo cancellation, which aligns the output format to the input format while the mic is open (AirPods example: 48 kHz to 24 kHz) — [Mozilla bug 1964935](https://bugzilla.mozilla.org/show_bug.cgi?id=1964935)
- **[R]** Firefox: open regression on macOS 26 in Firefox 155–159 where page audio is misrouted and goes silent while a mic on a different device is open, with echo cancellation disabled — [Mozilla bug 2073800](https://bugzilla.mozilla.org/show_bug.cgi?id=2073800)

### Inferences
Browser ranking
- **Chrome/Chromium: primary target.** Reasons: output device control from Web Audio, independent input/output streams, the most-tested `getUserMedia` + AudioWorklet path, `outputLatency` available since 2022. Known costs: non-standard default-device entries and noisy `devicechange`; current default echo-canceller behaviour on macOS not confirmed (irrelevant if all processing is disabled).
- **Safari: secondary, "should work" target.** Requires explicit `echoCancellation: false`; open the mic before playback to absorb first-capture ducking; no Web Audio sink selection; older reports of capture low-pass and `getOutputTimestamp` problems are unverified for Safari 26/27.
- **Firefox: unsupported for now.** Voice-processing path couples output format to the mic; open routing regression on macOS 26; no `AudioContext.setSinkId`. It does have the only `selectAudioOutput` implementation, which does not offset the above.

Recommended configuration, Setup A (AirPods + built-in mic), Chrome
- Mic constraints: `{ deviceId: {exact: builtInId}, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }`. Verify each with `track.getSettings()` and log the result.
- Permission flow: obtain permission before any audio plays; stop the throwaway default-device track immediately (it may be the AirPods mic and will briefly drop playback quality); then open the pinned stream once and keep it for the whole session.
- Audio graph: one `AudioContext({ latencyHint: "interactive" })` for both playback and the capture worklet so both share a clock; schedule playback against `currentTime`.
- Output: leave on system default (AirPods) and show the detected label; optionally offer `setSinkId`. Guard: if the live mic track's label is not the built-in mic, block scoring and explain why.
- Latency: require a loopback calibration (AirPod held to the mic grille, click/chirp train, cross-correlation, median of several) and store the round-trip offset keyed by output label + input label; offer a tap-along fine-tune as fallback. Invalidate on `devicechange`, sink change, or `outputLatency` change.
- User-facing notes: close System Settings > Sound and any call apps while practising; if music suddenly sounds muffled or mono, something has opened the AirPods mic.

Recommended configuration, Setup B (built-in speakers + built-in mic), Chrome
- Same mic constraints (all processing off) and same single-context graph.
- Do not enable browser echo cancellation by default; at most expose it as an experimental toggle for A/B testing on the actual machine.
- Bleed handling in-app: keep the melody guide out of (or very low in) the speaker mix during scored passages, bound the pitch search to the expected vocal range around the target, and consider reference-based subtraction or correlation gating in the worklet using the known playback signal and the calibrated delay.
- Latency: run the same loopback calibration (speaker to mic directly); do not hard-code a constant, given reported round trips from about 19 ms to about 70 ms across machines and Chrome versions.
- Product stance: label speaker mode as lower-accuracy and recommend headphones for scored practice.

### Gaps
- No head-to-head 2026 test of the three browsers for this exact workload (AudioWorklet pitch tracking on Apple Silicon) was found; the ranking is assembled from compatibility data and bug reports.
- Chrome-specific open bugs for macOS audio capture or Bluetooth output were not found in this pass (the Chromium issue tracker was not searched directly), so "no reported problems" for Chrome is partly absence of evidence.
- Every item marked for on-device verification above (constraint echo-back via `getSettings()`, default-device labels, what happens to playback when the AirPods mic opens, measured round-trip latency for each route) should be run on the target MacBook Pro before the spec is frozen.
