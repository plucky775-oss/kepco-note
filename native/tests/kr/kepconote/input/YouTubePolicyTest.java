package kr.kepconote.input;
public final class YouTubePolicyTest {
 private static void check(boolean value){if(!value)throw new AssertionError();}
 public static void main(String[] ignored){
  check(NativeYouTube.valid(0,100,400,300,900,1200,100));
  check(!NativeYouTube.valid(0,90,400,300,900,1200,100));
  check(!NativeYouTube.valid(800,100,400,300,900,1200,100));
  check(!NativeYouTube.valid(0,100,Double.NaN,300,900,1200,100));
  check(!NativeYouTube.valid(0,100,400,300,0,1200,100));
  check(NativeYouTube.embedNavigation("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=0"));
  for(String u:new String[]{"https://youtube-nocookie.com.evil.test/embed/dQw4w9WgXcQ","https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ","file:///etc/a","javascript:alert(1)","https://appassets.androidplatform.net/index.html","https://user@www.youtube-nocookie.com/embed/dQw4w9WgXcQ","https://www.youtube-nocookie.com:443/embed/dQw4w9WgXcQ"})check(!NativeYouTube.embedNavigation(u));
  check(NativeYouTube.allowed("https://rr1.googlevideo.com/videoplayback"));check(NativeYouTube.allowed("https://www.youtube.com/youtubei/v1/player"));
  for(String u:new String[]{"https://youtube.com.evil.test/","file:///notes","content://secret","http://youtube.com/","https://appassets.androidplatform.net/","https://user@youtube.com/","https://youtube.com:443/"})check(!NativeYouTube.allowed(u));
  System.out.println("YouTube native bounds/navigation/resource policy checks passed");
 }
}
