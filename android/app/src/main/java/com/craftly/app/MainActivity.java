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
 @Override public void onCreate(Bundle saved){super.onCreate(saved);web=new WebView(this);setContentView(web);web.setBackgroundColor(0xfff8f9fc);WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportZoom(false);s.setMediaPlaybackRequiresUserGesture(true);web.addJavascriptInterface(new Bridge(),"CraftlyNative");
 web.setWebViewClient(new WebViewClient(){
  @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){Uri u=req.getUrl();if(!HOST.equals(u.getHost())||!"https".equals(u.getScheme()))return null;String p=u.getPath();if(p==null||p.equals("/"))p="/index.html";if(p.contains(".."))return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",null,null);try{String mime=p.endsWith(".js")?"application/javascript":p.endsWith(".css")?"text/css":p.endsWith(".png")?"image/png":p.endsWith(".svg")?"image/svg+xml":"text/html";return new WebResourceResponse(mime,"UTF-8",getAssets().open("public"+p));}catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,null);}}
  @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !HOST.equals(r.getUrl().getHost());}
 });
 web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams p){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=cb;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");try{startActivityForResult(i,101);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}return true;}});
 web.loadUrl("https://"+HOST+"/index.html"+(BuildConfig.IS_ADMIN?"?admin=1":""));}
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);if(req==101&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);fileCallback=null;}}
 public class Bridge {
  @JavascriptInterface public boolean isAdmin(){return BuildConfig.IS_ADMIN;}
  @JavascriptInterface public void download(String url,String filename){worker.execute(()->fetchMod(url,filename));}
 }
 private void callback(boolean success,String message){runOnUiThread(()->{if(!isDestroyed())web.evaluateJavascript("window.craftlyDownloadDone && window.craftlyDownloadDone("+success+","+JSONObject.quote(message)+")",null);});}
 private void fetchMod(String address,String name){File partial=null;HttpURLConnection conn=null;try{
  URL url=new URL(address);if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null||!url.getPath().matches("/api/download/[a-f0-9]{48}"))throw new IOException("Invalid download URL");
  if(!name.matches("[A-Za-z0-9_-]{1,100}\\.(mcaddon|mcpack|mcworld)"))throw new IOException("Unsupported package");
  File dir=new File(getFilesDir(),"mods");dir.mkdirs();partial=new File(dir,name+".part");File result=new File(dir,name);
  conn=(HttpURLConnection)url.openConnection();conn.setConnectTimeout(20000);conn.setReadTimeout(60000);conn.setInstanceFollowRedirects(false);if(conn.getResponseCode()!=200)throw new IOException("Server returned "+conn.getResponseCode());long total=0;
  try(InputStream in=conn.getInputStream();OutputStream out=new FileOutputStream(partial)){byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1){total+=n;if(total>100L*1024*1024)throw new IOException("File exceeds 100 MB");out.write(buffer,0,n);}}
  try(InputStream check=new FileInputStream(partial)){if(check.read()!=80||check.read()!=75)throw new IOException("Invalid Minecraft package");}
  if(!partial.renameTo(result))throw new IOException("Could not save file");
  boolean publicSaved=saveToDownloads(result);
  callback(true,tr("Download complete.","اكتمل التحميل."));
  runOnUiThread(()->{if(isFinishing()||isDestroyed())return;new AlertDialog.Builder(this).setTitle(tr("Your next adventure is ready","مغامرتك القادمة واجدة")).setMessage(tr("Add this pack to Minecraft now? Confirm the import in the game, then enable it in your world settings."+(publicSaved?" A copy is saved in Downloads/Craftly.":" Your file is saved inside Craftly. Use Share to export it."),"واش بغيتي تزيد المود لماينكرافت دابا؟ أكد الاستيراد في اللعبة وفعل الحزمة من إعدادات العالم.")).setPositiveButton(tr("Open in Minecraft","فتح في ماينكرافت"),(d,w)->openMinecraft(result)).setNegativeButton(tr("Later","من بعد"),null).setNeutralButton(tr("Share / save","مشاركة / حفظ"),(d,w)->share(result)).show();});
 }catch(Exception e){if(partial!=null)partial.delete();callback(false,tr("Download failed. Check your connection and try again.","تعذر التحميل. تأكد من الاتصال وحاول مرة أخرى."));}finally{if(conn!=null)conn.disconnect();}}
 private boolean saveToDownloads(File f){if(Build.VERSION.SDK_INT<29)return false;Uri uri=null;try{ContentValues v=new ContentValues();v.put(MediaStore.Downloads.DISPLAY_NAME,f.getName());v.put(MediaStore.Downloads.MIME_TYPE,"application/octet-stream");v.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/Craftly");v.put(MediaStore.Downloads.IS_PENDING,1);uri=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,v);if(uri==null)return false;try(InputStream in=new FileInputStream(f);OutputStream out=getContentResolver().openOutputStream(uri)){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}v.clear();v.put(MediaStore.Downloads.IS_PENDING,0);getContentResolver().update(uri,v,null,null);return true;}catch(Exception e){if(uri!=null)getContentResolver().delete(uri,null,null);return false;}}
 private Uri uri(File f){return new Uri.Builder().scheme("content").authority(getPackageName()+".files").appendPath(f.getName()).build();}
 private void openMinecraft(File f){Intent i=new Intent(Intent.ACTION_VIEW);i.setDataAndType(uri(f),"application/octet-stream");i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);i.setClipData(ClipData.newRawUri("Minecraft pack",uri(f)));i.setPackage("com.mojang.minecraftpe");try{startActivity(i);}catch(Exception e){new AlertDialog.Builder(this).setTitle(tr("Minecraft is needed","خاص تكون ماينكرافت مثبتة")).setMessage(tr("Install Minecraft Bedrock, or use Share to select an app that supports this package. The file has been downloaded successfully.","ثبت ماينكرافت Bedrock أو استعمل المشاركة لاختيار تطبيق يدعم الملف. التحميل تم بنجاح.")).setPositiveButton(tr("Share file","مشاركة الملف"),(d,w)->share(f)).setNegativeButton(tr("Close","إغلاق"),null).show();}}
 private void share(File f){Intent i=new Intent(Intent.ACTION_SEND);i.setType("application/octet-stream");i.putExtra(Intent.EXTRA_STREAM,uri(f));i.setClipData(ClipData.newRawUri("Minecraft pack",uri(f)));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);try{startActivity(Intent.createChooser(i,tr("Open or save your pack","فتح أو حفظ الحزمة")));}catch(Exception e){Toast.makeText(this,tr("No compatible application found.","ما كاين حتى تطبيق متوافق."),Toast.LENGTH_LONG).show();}}
 @Override public void onBackPressed(){web.evaluateJavascript("document.querySelector('.modal') ? (document.querySelector('[data-action=close]').click(), true) : false",r->{if(!"true".equals(r))super.onBackPressed();});}
 @Override protected void onDestroy(){worker.shutdown();web.removeJavascriptInterface("CraftlyNative");web.destroy();super.onDestroy();}
}
