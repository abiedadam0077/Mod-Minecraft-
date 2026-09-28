package com.craftly.app;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ClipData;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.*;
import android.view.View;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
public class MainActivity extends Activity {
 private WebView web;
 private ValueCallback<Uri[]> fileCallback;
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private static final String HOST="appassets.androidplatform.net";
 private boolean ar(){return Locale.getDefault().getLanguage().equals("ar");}
 private String tr(String en,String arabic){return ar()?arabic:en;}
 @Override public void onCreate(Bundle saved){super.onCreate(saved);web=new WebView(this);setContentView(web);web.setBackgroundColor(0xff100b23);applySystemBars(true);WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setCacheMode(WebSettings.LOAD_DEFAULT);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportZoom(false);s.setMediaPlaybackRequiresUserGesture(true);web.addJavascriptInterface(new Bridge(),"CraftlyNative");
 web.setWebViewClient(new WebViewClient(){
  @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){Uri u=req.getUrl();if(!HOST.equals(u.getHost())||!"https".equals(u.getScheme()))return null;String p=u.getPath();if(p==null||p.equals("/"))p="/index.html";if(p.contains(".."))return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",null,null);try{String mime=p.endsWith(".js")?"application/javascript":p.endsWith(".css")?"text/css":p.endsWith(".webp")?"image/webp":p.endsWith(".png")?"image/png":p.endsWith(".svg")?"image/svg+xml":"text/html";return new WebResourceResponse(mime,"UTF-8",getAssets().open("public"+p));}catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,null);}}
  @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !HOST.equals(r.getUrl().getHost());}
 });
 web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams p){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=cb;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");try{startActivityForResult(i,101);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}return true;}});
 web.loadUrl("https://"+HOST+"/index.html"+(BuildConfig.IS_ADMIN?"?admin=1":""));}
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);if(req==101&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);fileCallback=null;}}
 private static class Transfer {
  final String id,address,name; volatile boolean paused=false,canceled=false; volatile String status="queued";
  volatile HttpURLConnection connection; long bytes=0,total=0; double speed=0;
  Transfer(String i,String a,String n){id=i;address=a;name=n;}
 }
 private final java.util.concurrent.ConcurrentHashMap<String,Transfer> transfers=new java.util.concurrent.ConcurrentHashMap<>();
 private boolean validName(String name){return name!=null&&name.matches("[A-Za-z0-9_-]{1,100}\\.(mcaddon|mcpack|mcworld)");}
 private File modDir(){File dir=new File(getFilesDir(),"mods");dir.mkdirs();return dir;}
 private boolean activeDownloads(){for(Transfer j:transfers.values())if(j.status.equals("running")||j.status.equals("queued")||j.status.equals("paused"))return true;return false;}
 private void applySystemBars(boolean dark){getWindow().setStatusBarColor(dark?0xff100b23:0xfff7f7fc);getWindow().setNavigationBarColor(dark?0xff100b23:0xffffffff);getWindow().getDecorView().setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);}
 public class Bridge {
  @JavascriptInterface public void openExternal(String address){try{Uri uri=Uri.parse(address);String host=uri.getHost();if(!"https".equals(uri.getScheme())||host==null||!host.contains(".")||uri.getUserInfo()!=null||(uri.getPort()!=-1&&uri.getPort()!=443)||host.matches("[0-9.]+")||host.contains(":")||host.endsWith(".local")||host.endsWith(".internal"))return;runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));}catch(Exception e){Toast.makeText(MainActivity.this,tr("No browser available","لا يوجد متصفح"),Toast.LENGTH_LONG).show();}});}catch(Exception ignored){}}

  @JavascriptInterface public void setDarkAppearance(boolean dark){runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())applySystemBars(dark);});}
  @JavascriptInterface public boolean isAdmin(){return BuildConfig.IS_ADMIN;}
  @JavascriptInterface public void startDownload(String id,String address,String name,boolean resume){
   if(!validName(name)||id==null||!id.matches("[A-Za-z0-9_-]{1,80}"))return;
   Transfer old=transfers.get(id);if(old!=null&&(old.status.equals("running")||old.status.equals("queued")))return;
   Transfer job=new Transfer(id,address,name);transfers.put(id,job);
   worker.execute(()->fetchMod(job,resume));
  }
  @JavascriptInterface public void pauseDownload(String id){Transfer j=transfers.get(id);if(j==null)return;j.paused=true;j.status="paused";if(j.connection!=null)j.connection.disconnect();emit(j,"");}
  @JavascriptInterface public void cancelDownload(String id){Transfer j=transfers.get(id);if(j==null)return;j.canceled=true;j.status="canceled";if(j.connection!=null)j.connection.disconnect();worker.execute(()->new File(modDir(),j.name+".part").delete());emit(j,"");}
  @JavascriptInterface public boolean hasDownload(String name){return validName(name)&&new File(modDir(),name).isFile();}
  @JavascriptInterface public void openDownload(String name){if(!validName(name))return;runOnUiThread(()->{File f=new File(modDir(),name);if(f.isFile())openMinecraft(f);else Toast.makeText(MainActivity.this,tr("File no longer available. Download it again.","الملف غير متوفر. أعد تنزيله."),Toast.LENGTH_LONG).show();});}
  @JavascriptInterface public long downloadStorageBytes(){long size=0;File[] files=modDir().listFiles();if(files!=null)for(File f:files)if(f.isFile())size+=f.length();return size;}
  @JavascriptInterface public boolean clearDownloads(){if(activeDownloads())return false;boolean ok=true;File[] files=modDir().listFiles();if(files!=null)for(File f:files)if(f.isFile()&&!f.delete())ok=false;return ok;}
 }
 private void callback(boolean success,String message){runOnUiThread(()->{if(!isDestroyed())web.evaluateJavascript("window.craftlyDownloadDone && window.craftlyDownloadDone("+success+","+JSONObject.quote(message)+")",null);});}
 private void emit(Transfer j,String error){if(transfers.get(j.id)!=j)return;try{JSONObject event=new JSONObject();event.put("id",j.id);event.put("status",j.status);event.put("bytes",j.bytes);event.put("total",j.total);event.put("speed",j.status.equals("running")?j.speed:0);event.put("error",error);String data=event.toString();runOnUiThread(()->{if(!isDestroyed()&&transfers.get(j.id)==j)web.evaluateJavascript("window.craftlyTransferEvent && window.craftlyTransferEvent("+data+")",null);});}catch(Exception ignored){}}
 private void fetchMod(Transfer job,boolean resume){File partial=new File(modDir(),job.name+".part");HttpURLConnection conn=null;
  try{
   if(job.canceled)return;
   URL url=new URL(job.address);
   if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null||!"vvypjqmskdtajkeogzmu.supabase.co".equals(url.getHost())||(url.getPort()!=-1&&url.getPort()!=443)||!url.getPath().matches("/storage/v1/object/sign/craftly-packages/[0-9a-f-]{36}/[A-Za-z0-9_-]+[.](mcaddon|mcpack|mcworld)")||url.getQuery()==null||!url.getQuery().contains("token="))throw new IOException("Invalid download URL");
   if(!resume)partial.delete();job.bytes=partial.isFile()?partial.length():0;
   conn=(HttpURLConnection)url.openConnection();job.connection=conn;conn.setConnectTimeout(20000);conn.setReadTimeout(30000);conn.setInstanceFollowRedirects(false);
   if(job.bytes>0)conn.setRequestProperty("Range","bytes="+job.bytes+"-");
   int code=conn.getResponseCode();if(code!=200&&code!=206)throw new IOException("Download link unavailable. Retry to get a new link.");
   if(code==206){String range=conn.getHeaderField("Content-Range");if(range==null||!range.startsWith("bytes "+job.bytes+"-"))throw new IOException("Invalid download range");}else job.bytes=0;
   long length=conn.getContentLengthLong();job.total=length>0?job.bytes+length:0;if(job.total>50L*1024*1024)throw new IOException("File exceeds 50 MB");
   if(job.paused||job.canceled)return;job.status="running";emit(job,"");
   long lastTime=System.nanoTime(),lastBytes=job.bytes;
   try(InputStream in=conn.getInputStream();OutputStream out=new FileOutputStream(partial,job.bytes>0)){
    byte[] buffer=new byte[32768];int n;
    while((n=in.read(buffer))!=-1){if(job.canceled||job.paused)break;job.bytes+=n;if(job.bytes>50L*1024*1024)throw new IOException("File exceeds 50 MB");out.write(buffer,0,n);long now=System.nanoTime();if(now-lastTime>=250000000L){job.speed=(job.bytes-lastBytes)/((now-lastTime)/1000000000.0);lastTime=now;lastBytes=job.bytes;emit(job,"");}}
   }
   if(job.canceled){partial.delete();return;}if(job.paused)return;
   if(job.total>0&&job.bytes!=job.total)throw new IOException("Incomplete download. Resume to continue.");
   try(InputStream check=new FileInputStream(partial)){if(check.read()!=80||check.read()!=75){partial.delete();job.bytes=0;throw new IOException("Invalid Minecraft package");}}
   File result=new File(modDir(),job.name);if(!partial.renameTo(result))throw new IOException("Could not save file");
   boolean publicSaved=saveToDownloads(result);job.total=job.bytes;job.status="complete";job.speed=0;emit(job,"");
   runOnUiThread(()->{if(job.canceled||isFinishing()||isDestroyed())return;new AlertDialog.Builder(this).setTitle(tr("Your next adventure is ready","مغامرتك القادمة واجدة")).setMessage(tr("Open this pack in Minecraft? Confirm the import in the game, then enable it in your world settings."+(publicSaved?" A copy is saved in Downloads/Craftly.":" Use Share to save a copy outside Craftly."),"واش بغيتي تفتح المود في ماينكرافت؟ أكد الاستيراد في اللعبة وفعل الحزمة من إعدادات العالم.")).setPositiveButton(tr("Open in Minecraft","فتح في ماينكرافت"),(d,w)->openMinecraft(result)).setNegativeButton(tr("Later","من بعد"),null).setNeutralButton(tr("Share / save","مشاركة / حفظ"),(d,w)->share(result)).show();});
  }catch(Exception e){if(!job.paused&&!job.canceled){job.status="failed";emit(job,tr("Download interrupted. Tap resume to retry.","انقطع التنزيل. اضغط الاستئناف للمحاولة."));}}
  finally{if(conn!=null)conn.disconnect();job.connection=null;if(job.canceled)partial.delete();if(job.paused||job.canceled){job.bytes=partial.isFile()?partial.length():0;emit(job,"");}}
 }
 private boolean saveToDownloads(File f){if(Build.VERSION.SDK_INT<29)return false;Uri uri=null;try{ContentValues v=new ContentValues();v.put(MediaStore.Downloads.DISPLAY_NAME,f.getName());v.put(MediaStore.Downloads.MIME_TYPE,"application/octet-stream");v.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/Craftly");v.put(MediaStore.Downloads.IS_PENDING,1);uri=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,v);if(uri==null)return false;try(InputStream in=new FileInputStream(f);OutputStream out=getContentResolver().openOutputStream(uri)){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}v.clear();v.put(MediaStore.Downloads.IS_PENDING,0);getContentResolver().update(uri,v,null,null);return true;}catch(Exception e){if(uri!=null)getContentResolver().delete(uri,null,null);return false;}}
 private Uri uri(File f){return new Uri.Builder().scheme("content").authority(getPackageName()+".files").appendPath(f.getName()).build();}
 private void openMinecraft(File f){Intent i=new Intent(Intent.ACTION_VIEW);i.setDataAndType(uri(f),"application/octet-stream");i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);i.setClipData(ClipData.newRawUri("Minecraft pack",uri(f)));i.setPackage("com.mojang.minecraftpe");try{startActivity(i);}catch(Exception e){new AlertDialog.Builder(this).setTitle(tr("Minecraft is needed","خاص تكون ماينكرافت مثبتة")).setMessage(tr("Install Minecraft Bedrock, or use Share to select an app that supports this package. The file has been downloaded successfully.","ثبت ماينكرافت Bedrock أو استعمل المشاركة لاختيار تطبيق يدعم الملف. التحميل تم بنجاح.")).setPositiveButton(tr("Share file","مشاركة الملف"),(d,w)->share(f)).setNegativeButton(tr("Close","إغلاق"),null).show();}}
 private void share(File f){Intent i=new Intent(Intent.ACTION_SEND);i.setType("application/octet-stream");i.putExtra(Intent.EXTRA_STREAM,uri(f));i.setClipData(ClipData.newRawUri("Minecraft pack",uri(f)));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);try{startActivity(Intent.createChooser(i,tr("Open or save your pack","فتح أو حفظ الحزمة")));}catch(Exception e){Toast.makeText(this,tr("No compatible application found.","ما كاين حتى تطبيق متوافق."),Toast.LENGTH_LONG).show();}}
 @Override public void onBackPressed(){web.evaluateJavascript("window.craftlyBack ? window.craftlyBack() : false",r->{if(!"true".equals(r))super.onBackPressed();});}
 @Override protected void onDestroy(){for(Transfer j:transfers.values()){j.canceled=true;if(j.connection!=null)j.connection.disconnect();}worker.shutdownNow();web.removeJavascriptInterface("CraftlyNative");web.destroy();super.onDestroy();}
}
