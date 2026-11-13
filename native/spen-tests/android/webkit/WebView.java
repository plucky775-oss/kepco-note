package android.webkit;
import android.content.Context;
import android.view.MotionEvent;
public class WebView {
 public static final int VISIBLE=0;
 protected void onWindowVisibilityChanged(int visibility) {}
 protected void onDetachedFromWindow() {}
 public void destroy() {}
 public static MotionEvent last;
 public static boolean fail;
 public WebView(Context c) {}
 public boolean onTouchEvent(MotionEvent e) { last=e; if(fail)throw new RuntimeException("dispatch"); return true; }
}
