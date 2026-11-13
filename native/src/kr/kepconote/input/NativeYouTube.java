package kr.kepconote.input;

import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.SslErrorHandler;
import android.widget.FrameLayout;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.JavaScriptReplyProxy;
import org.json.JSONObject;
import java.util.Collections;
import java.io.ByteArrayInputStream;

/** A separate, bridge-free player. The privileged notes WebView never embeds a remote page. */
public final class NativeYouTube {
 private final WebView notes;
 private WebView player;
 private String active="";
 private boolean destroyed=false;
 private long lease=0;
 private final Runnable expiry=new Runnable(){public void run(){if(player!=null&&android.os.SystemClock.uptimeMillis()-lease>1200)hide();else if(player!=null)notes.postDelayed(this,500);}};
 public NativeYouTube(final WebView notes){
  this.notes=notes;
  if(!WebViewFeature.isFeatureSupported("WEB_MESSAGE_LISTENER"))return;
  WebViewCompat.addWebMessageListener(notes,"KepcoYouTube",Collections.singleton("https://appassets.androidplatform.net"),new WebViewCompat.WebMessageListener(){
   public void onPostMessage(WebView view,WebMessageCompat message,Uri origin,boolean mainFrame,JavaScriptReplyProxy reply){
    if(view!=notes||!mainFrame||!"https://appassets.androidplatform.net".equals(origin.toString()))return;
    final String data;try{data=message.getData();}catch(Exception invalid){return;}if(data==null||data.length()>2048)return;
    notes.post(new Runnable(){public void run(){receive(data);}});
   }
  });
 }
 private void receive(String data){
  if(destroyed)return;
  try{
   JSONObject m=new JSONObject(data);String op=m.getString("op");
   if("hide".equals(op)){hide();return;}
   if(!"show".equals(op))return;
   String id=m.getString("id"),key=m.getString("key");int start=m.getInt("start");
   if(!id.matches("[A-Za-z0-9_-]{11}")||!key.matches("[A-Za-z0-9_-]{1,200}")||start<0||start>86400)return;
   double x=m.getDouble("x"),y=m.getDouble("y"),w=m.getDouble("w"),h=m.getDouble("h"),vw=m.getDouble("vw"),vh=m.getDouble("vh"),top=m.getDouble("top");
   if(!valid(x,y,w,h,vw,vh,top)){hide();return;}
   if(notes.getWindowVisibility()!=View.VISIBLE||!notes.isShown()||!(notes.getParent() instanceof FrameLayout)){hide();return;}
   float scale=(notes.getWidth()-notes.getPaddingLeft()-notes.getPaddingRight())/(float)vw;
   FrameLayout root=(FrameLayout)notes.getParent();int[] n=new int[2],r=new int[2];notes.getLocationInWindow(n);root.getLocationInWindow(r);
   int width=Math.max(1,Math.round((float)w*scale)),height=Math.max(1,Math.round((float)h*scale));
   int left=n[0]-r[0]+notes.getPaddingLeft()+Math.round((float)x*scale),ytop=n[1]-r[1]+notes.getPaddingTop()+Math.round((float)y*scale);
   if(left<0||ytop<0||left+width>root.getWidth()+2||ytop+height>root.getHeight()+2){hide();return;}
   String identity=key+":"+id+":"+start;
   if(player==null||!identity.equals(active)){hide();player=createPlayer();active=identity;root.addView(player);String src="https://www.youtube-nocookie.com/embed/"+id+"?playsinline=1&start="+start+"&rel=0&fs=0";
    String html="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='referrer' content='strict-origin-when-cross-origin'><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;overflow:hidden;background:#000}</style></head><body><iframe src='"+src+"' allow='encrypted-media; autoplay; picture-in-picture' referrerpolicy='strict-origin-when-cross-origin'></iframe></body></html>";
    player.loadDataWithBaseURL("https://kr.kepconote.standalone.v307/",html,"text/html","UTF-8",null);
   }
   FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(width,height);p.leftMargin=left;p.topMargin=ytop;player.setLayoutParams(p);player.setVisibility(View.VISIBLE);lease=android.os.SystemClock.uptimeMillis();notes.removeCallbacks(expiry);notes.postDelayed(expiry,1500);
  }catch(Exception invalid){hide();}
 }
 static boolean valid(double x,double y,double w,double h,double vw,double vh,double top){
  double[] a={x,y,w,h,vw,vh,top};for(double v:a)if(Double.isNaN(v)||Double.isInfinite(v)||Math.abs(v)>20000)return false;
  return vw>0&&vh>0&&w>=40&&h>=30&&x>=0&&y>=Math.max(0,top)&&x+w<=vw+1&&y+h<=vh+1;
 }
 private WebView createPlayer(){
  WebView v=new WebView(notes.getContext());WebSettings s=v.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);s.setGeolocationEnabled(false);
  // Android API 17/21 methods, called reflectively to keep this patch buildable against its pinned SDK stub.
  setting(s,"setMediaPlaybackRequiresUserGesture",boolean.class,Boolean.TRUE);setting(s,"setMixedContentMode",int.class,Integer.valueOf(1));
  v.removeJavascriptInterface("searchBoxJavaBridge_");v.removeJavascriptInterface("accessibility");v.removeJavascriptInterface("accessibilityTraversal");
  try{Object cookies=android.webkit.CookieManager.getInstance();android.webkit.CookieManager.class.getMethod("setAcceptThirdPartyCookies",WebView.class,boolean.class).invoke(cookies,v,false);}catch(Exception ignored){}
  v.setHorizontalScrollBarEnabled(false);v.setVerticalScrollBarEnabled(false);v.setBackgroundColor(Color.BLACK);v.setWebChromeClient(new WebChromeClient());
  v.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return !embedNavigation(url);}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,String url){return allowed(url)?null:new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();}
  });return v;
 }
 static boolean embedNavigation(String url){try{java.net.URI u=new java.net.URI(url);return "https".equals(u.getScheme())&&"www.youtube-nocookie.com".equals(u.getHost())&&u.getUserInfo()==null&&u.getPort()==-1&&u.getPath()!=null&&u.getPath().matches("/embed/[A-Za-z0-9_-]{11}");}catch(Exception e){return false;}}
 static boolean allowed(String url){try{java.net.URI u=new java.net.URI(url);if(!"https".equals(u.getScheme())||u.getUserInfo()!=null||u.getPort()!=-1)return false;String h=u.getHost();if(h==null)return false;String[] domains={"youtube-nocookie.com","youtube.com","googlevideo.com","ytimg.com","gstatic.com","google.com","googleusercontent.com"};for(String d:domains)if(h.equals(d)||h.endsWith("."+d))return true;return false;}catch(Exception e){return false;}}
 private static void setting(Object object,String method,Class<?> type,Object value){try{WebSettings.class.getMethod(method,type).invoke(object,value);}catch(Exception ignored){}}
 public void hide(){notes.removeCallbacks(expiry);if(player!=null){WebView old=player;player=null;active="";if(old.getParent() instanceof ViewGroup)((ViewGroup)old.getParent()).removeView(old);old.stopLoading();old.loadUrl("about:blank");old.destroy();}}
 public void destroy(){destroyed=true;hide();}
}
