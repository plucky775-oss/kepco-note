package kr.kepconote.input;

import android.content.Context;
import android.view.MotionEvent;
import android.webkit.WebView;

/**
 * Keep barrel-button strokes out of Chromium's native StylusTextSelector.
 * This adds no JavaScript interface, permissions or network access.
 */
public final class SpenWebView extends WebView {
    // Android M+ BUTTON_STYLUS_PRIMARY; legacy devices use BUTTON_SECONDARY.
    private static final int BARREL_BUTTONS = 32 | 2;

    private final java.util.HashSet<Integer> eraserContacts = new java.util.HashSet<Integer>();
    private NativeYouTube youtube;
    public SpenWebView(Context context) { super(context); youtube = new NativeYouTube(this); }
    @Override protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(visibility); if (visibility != VISIBLE && youtube != null) youtube.hide();
    }
    @Override public void destroy() { if (youtube != null) youtube.destroy(); super.destroy(); }
    @Override protected void onDetachedFromWindow() { if (youtube != null) youtube.hide(); super.onDetachedFromWindow(); }

    @Override public boolean onTouchEvent(MotionEvent event) {
        final int action = event.getAction() & 255;
        if (action == 0) eraserContacts.clear(); // a fresh contact, not hover
        final boolean contact = action == 0 || action == 2 || action == 5;
        if (contact && (event.getButtonState() & BARREL_BUTTONS) != 0) {
            for (int i = 0; i < event.getPointerCount(); i++) {
                MotionEvent.PointerCoords c = new MotionEvent.PointerCoords();
                MotionEvent.PointerProperties p = new MotionEvent.PointerProperties();
                event.getPointerCoords(i, c); event.getPointerProperties(i, p);
                if (p.toolType == MotionEvent.TOOL_TYPE_STYLUS && c.pressure > 0)
                    eraserContacts.add(p.id);
            }
        }
        // Do not change eraser -> pen on UP: Chromium can synthesize a new
        // pointer-down when tool identity changes at lift-off.
        MotionEvent adapted = adapt(event, eraserContacts);
        if (action == 1 || action == 3) eraserContacts.clear();
        else if (action == 6) {
            int index = (event.getAction() >> 8) & 255;
            MotionEvent.PointerProperties p = new MotionEvent.PointerProperties();
            event.getPointerProperties(index, p); eraserContacts.remove(p.id);
        }
        if (adapted == event) return super.onTouchEvent(event);
        try { return super.onTouchEvent(adapted); }
        finally { adapted.recycle(); }
    }

    /** Return original for non-barrel/finger/mouse input; never mutate it. */
    static MotionEvent adapt(MotionEvent event) {
        return adapt(event, java.util.Collections.<Integer>emptySet());
    }
    static MotionEvent adapt(MotionEvent event, java.util.Set<Integer> latched) {
        if ((event.getButtonState() & BARREL_BUTTONS) == 0 && latched.isEmpty()) return event;
        final int count = event.getPointerCount();
        boolean stylus = false;
        for (int i = 0; i < count; i++) {
            if (event.getToolType(i) == MotionEvent.TOOL_TYPE_STYLUS) stylus = true;
        }
        if (!stylus) return event;
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[count];
        MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[count];
        for (int i = 0; i < count; i++) {
            properties[i] = new MotionEvent.PointerProperties();
            event.getPointerProperties(i, properties[i]);
            if (properties[i].toolType == MotionEvent.TOOL_TYPE_STYLUS &&
                (((event.getButtonState() & BARREL_BUTTONS) != 0) || latched.contains(properties[i].id))) {
                properties[i].toolType = MotionEvent.TOOL_TYPE_ERASER;
            }
            coords[i] = new MotionEvent.PointerCoords();
        }
        // Retain batched pressure/tilt/position samples and timestamps.
        final int history = event.getHistorySize();
        for (int i = 0; i < count; i++) {
            if (history > 0) event.getHistoricalPointerCoords(i, 0, coords[i]);
            else event.getPointerCoords(i, coords[i]);
        }
        MotionEvent adapted = MotionEvent.obtain(event.getDownTime(),
            history > 0 ? event.getHistoricalEventTime(0) : event.getEventTime(),
            event.getAction(), count, properties, coords, event.getMetaState(),
            event.getButtonState() & ~BARREL_BUTTONS, event.getXPrecision(),
            event.getYPrecision(), event.getDeviceId(), event.getEdgeFlags(),
            event.getSource(), event.getFlags());
        for (int h = 1; h <= history; h++) {
            for (int i = 0; i < count; i++) {
                if (h < history) event.getHistoricalPointerCoords(i, h, coords[i]);
                else event.getPointerCoords(i, coords[i]);
            }
            adapted.addBatch(h < history ? event.getHistoricalEventTime(h) : event.getEventTime(),
                coords, event.getMetaState());
        }
        return adapted;
    }
}
