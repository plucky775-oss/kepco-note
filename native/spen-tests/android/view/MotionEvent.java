package android.view;
import java.util.ArrayList;
public class MotionEvent {
 public static final int TOOL_TYPE_STYLUS=2, TOOL_TYPE_ERASER=4;
 public static class PointerProperties { public int id,toolType; }
 public static class PointerCoords { public float x,y,pressure,orientation; }
 public int buttonState, action, meta, device, edge,source,flags;
 public long down,time;
 public float xp,yp;
 public boolean recycled;
 public PointerProperties[] props;
 public PointerCoords[] coords;
 public ArrayList<Long> times=new ArrayList<>();
 public ArrayList<PointerCoords[]> samples=new ArrayList<>();
 public int getButtonState(){return buttonState;}
 public int getPointerCount(){return props.length;}
 public int getToolType(int i){return props[i].toolType;}
 public void getPointerProperties(int i,PointerProperties p){p.id=props[i].id;p.toolType=props[i].toolType;}
 static void copy(PointerCoords a,PointerCoords b){b.x=a.x;b.y=a.y;b.pressure=a.pressure;b.orientation=a.orientation;}
 public static PointerCoords[] cloneCoords(PointerCoords[] p){PointerCoords[] out=new PointerCoords[p.length];for(int i=0;i<p.length;i++){out[i]=new PointerCoords();copy(p[i],out[i]);}return out;}
 public void getPointerCoords(int i,PointerCoords p){copy(coords[i],p);}
 public void getHistoricalPointerCoords(int i,int h,PointerCoords p){copy(samples.get(h)[i],p);}
 public int getHistorySize(){return times.size();}
 public long getHistoricalEventTime(int h){return times.get(h);}
 public long getDownTime(){return down;} public long getEventTime(){return time;}
 public int getAction(){return action;}public int getMetaState(){return meta;}
 public float getXPrecision(){return xp;}public float getYPrecision(){return yp;}
 public int getDeviceId(){return device;}public int getEdgeFlags(){return edge;}
 public int getSource(){return source;}public int getFlags(){return flags;}
 public static MotionEvent obtain(long d,long t,int a,int n,PointerProperties[] pp,PointerCoords[] pc,int m,int b,float x,float y,int dev,int e,int s,int f){
  MotionEvent v=new MotionEvent();v.down=d;v.time=t;v.action=a;v.meta=m;v.buttonState=b;v.xp=x;v.yp=y;v.device=dev;v.edge=e;v.source=s;v.flags=f;
  v.props=new PointerProperties[n];for(int i=0;i<n;i++){v.props[i]=new PointerProperties();v.props[i].id=pp[i].id;v.props[i].toolType=pp[i].toolType;}v.coords=cloneCoords(pc);return v;
 }
 public void addBatch(long t,PointerCoords[] c,int m){times.add(time);samples.add(cloneCoords(coords));time=t;coords=cloneCoords(c);meta=m;}
 public void recycle(){recycled=true;}
}
