package kr.kepconote.input;
import android.content.Context;
import android.view.MotionEvent;
import android.webkit.WebView;
public final class SpenWebViewTest {
 static int checks=0;
 static void check(boolean ok,String message){checks++;if(!ok)throw new AssertionError(message);}
 static MotionEvent sample(int button,int... types){
  MotionEvent.PointerProperties[] p=new MotionEvent.PointerProperties[types.length];
  MotionEvent.PointerCoords[] c=new MotionEvent.PointerCoords[types.length];
  for(int i=0;i<types.length;i++){p[i]=new MotionEvent.PointerProperties();p[i].id=7+i;p[i].toolType=types[i];c[i]=new MotionEvent.PointerCoords();c[i].x=100+i;c[i].y=200;c[i].pressure=.7f;c[i].orientation=.4f;}
  return MotionEvent.obtain(1000,1005,2,types.length,p,c,1,button,.1f,.2f,4,5,0x4002,6);
 }
 public static void main(String[] args){
  for(int button:new int[]{32,2,34,33}){
   MotionEvent e=sample(button,2),a=SpenWebView.adapt(e);
   check(a!=e,"copy");check(a.getToolType(0)==4,"native eraser");check((a.getButtonState()&34)==0,"no Chromium selector");check(e.getToolType(0)==2&&e.getButtonState()==button,"input immutable");
   check(a.props[0].id==7&&a.coords[0].pressure==.7f&&a.coords[0].orientation==.4f,"identity pressure tilt");
   check(a.down==e.down&&a.time==e.time&&a.action==e.action&&a.source==e.source&&a.meta==e.meta&&a.flags==e.flags&&a.device==e.device&&a.edge==e.edge&&a.xp==e.xp&&a.yp==e.yp,"metadata");
  }
  for(int type:new int[]{1,3,4}){MotionEvent e=sample(2,type);check(SpenWebView.adapt(e)==e,"finger mouse physical eraser unchanged");}
  MotionEvent plain=sample(0,2);check(SpenWebView.adapt(plain)==plain,"release returns pen");
  MotionEvent mixed=sample(32,2,1),a=SpenWebView.adapt(mixed);check(a.getToolType(0)==4&&a.getToolType(1)==1,"palm retained");
  MotionEvent hist=sample(32,2);MotionEvent.PointerCoords[] c=MotionEvent.cloneCoords(hist.coords);
  c[0].x=110;c[0].pressure=.8f;hist.addBatch(1010,c,1);c[0].x=120;c[0].pressure=.9f;hist.addBatch(1015,c,1);
  a=SpenWebView.adapt(hist);check(a.getHistorySize()==2,"history count");check(a.getHistoricalEventTime(0)==1005&&a.getHistoricalEventTime(1)==1010&&a.time==1015,"history timing");check(a.samples.get(0)[0].x==100&&a.samples.get(1)[0].x==110&&a.coords[0].x==120,"history coordinates");check(a.coords[0].pressure==.9f,"current pressure");
  SpenWebView view=new SpenWebView(new Context());check(view.onTouchEvent(hist),"dispatch result");check(WebView.last.recycled&&!hist.recycled,"recycles only clone");
  WebView.fail=true;try{view.onTouchEvent(hist);}catch(RuntimeException expected){}check(WebView.last.recycled,"exception recycle");
  System.out.println("S Pen native adapter: "+checks+" host checks passed (not Android device verification).");
 }
}
