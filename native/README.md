# Native input and isolated video helpers

`SpenWebView` replaces only the `new WebView(context)` allocation in the existing
`MainActivity`. It preserves the original app identity, native save/calendar
code, bridge setup and surrounding layout. `NativeYouTube` is a separate
bridge-free playback overlay; see its implementation and web integration for
origin and bounds checks. No signing credentials belong in this repository.

## Why the previous S Pen JavaScript fix was insufficient

Chromium's `StylusTextSelector` can consume the entire Android touch sequence
when a stylus touches down while `BUTTON_STYLUS_PRIMARY` (32) or legacy
`BUTTON_SECONDARY` (2) is held. JavaScript cannot recover an event it never
receives. The native adapter changes only barrel-held stylus pointer properties
to `TOOL_TYPE_ERASER` and removes those two button flags **before** passing the
copied event into WebView. Chromium exposes this as a pen pointer with eraser
button bit 32. Other pointers, IDs, pressure, orientation, timing, historical
samples and metadata are retained. Original `MotionEvent` objects are never
mutated or recycled by the adapter. Releasing the button passes ordinary pen
input through again; existing JS splits the stroke at each tool transition.

- [Chromium native stylus selection](https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/renderer_host/input/stylus_text_selector.cc)
- [Chromium eraser-to-pointer mapping](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/events/pointer_event_factory.cc)

The JS recovery also accepts contact `pointermove` with `button=-1` after a
missing first down, while rejecting hover. Pen settings and toolbar selection
are not changed. Finger/mouse input is not remapped.

## Reproduction

The input APK must use the reviewed single-DEX `MainActivity` layout; unknown
layouts fail closed. Apply the web-asset/version overlay first. Then run:

```sh
python3 patch_native_input.py asset-update-UNSIGNED.apk native-update-UNSIGNED.apk \
  --tools /private/tool-cache --download-tools
```

Tools come only from pinned Maven Central or Google Maven artifact URLs and are
SHA-256 checked. The compiler's AndroidX dependency matches the existing APK
(1.13.0). AndroidX and JSON jars are compile-only and are **not** repackaged.
All original classes are compared after DEX reassembly. Only the two planned
MainActivity references may change; omitted static zero/null defaults are
normalized because their DEX semantics are identical. The script writes a
native verification JSON report. Its APK is unsigned and must be ZIP-aligned
and signed using the same private key as the installed edition.

## Host regression tests

```sh
java -jar /private/tool-cache/ecj-3.33.0.jar -8 -d /tmp/kepco-input-tests \
  $(find native/spen-tests -name '*.java') native/src/kr/kepconote/input/SpenWebView.java
java -cp /tmp/kepco-input-tests kr.kepconote.input.SpenWebViewTest
node --test tests/spen-eraser.test.mjs tests/finger-regression.test.mjs
```

The Java tests use explicit host stubs; none are compiled into the APK. These
verify transformation, non-mutation, pressure/history retention, pass-through,
and exception-safe recycling. They do not replace Android WebView or physical
Galaxy Tab S8+ validation. Physical button erasure, release-to-pen, undo,
background/resume and Samsung Air command interactions still require device
verification. The app does not alter global S Pen/Air command settings.
