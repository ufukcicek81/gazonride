package com.gazonride.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.widget.Toast;
import android.view.WindowManager;
import android.view.View;
import android.content.res.Configuration;
import android.os.Build;
import android.provider.Settings;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private WebView webView;
    private MusicController musicController;
    private static final int LOCATION_REQ = 42;
    private static final int MIC_REQ = 43;
    private static final String URL = "https://ufukcicek81.github.io/gazonride/";
    private static final String RELEASES_API = "https://api.github.com/repos/ufukcicek81/gazonride/releases/latest";
    private android.content.SharedPreferences prefs;
    private String pendingOAuthUrl = null;
    private PermissionRequest pendingWebPermission = null;
    private ValueCallback<Uri[]> pendingFileChooser = null;
    private static final int FILE_CHOOSER_REQ = 44;

    private long updateDownloadId = -1L;
    private Uri pendingInstallUri = null;
    private boolean downloadReceiverRegistered = false;

    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private Sensor accelerometerSensor;
    // Relative gravity from the rotation-vector fusion (no Euler-angle gimbal lock).
    // A calibration baseline is valid only for a fixed phone/motorcycle mount.
    private float[] leanZeroGravity = null;
    private float[] leanPreviousGravity = null;
    private float[] leanCalibrationSum = new float[3];
    private boolean leanCalibrating = false;
    private int leanCalibrationSamples = 0;
    private long leanCalibrationBeginMs = 0L;
    private long leanCalibrationStableSinceMs = 0L;
    private long leanLastSampleMs = 0L;
    private float leanFilteredDeg = 0f;
    private float leanMaxLeftDeg = 0f;
    private float leanMaxRightDeg = 0f;
    private long leanLastUiMs = 0L;
    private boolean leanTracking = false;

    private void leanJs(String javascript) {
        runOnUiThread(() -> {
            if(webView!=null) webView.evaluateJavascript("if(window.GaZonLean){" + javascript + "}",null);
        });
    }

    private void beginLeanCalibration(){
        leanPreviousGravity=leanZeroGravity;
        leanZeroGravity=null;
        leanCalibrating=true;
        leanCalibrationSamples=0;
        leanCalibrationSum=new float[3];
        leanCalibrationBeginMs=SystemClock.elapsedRealtime();
        leanCalibrationStableSinceMs=0L;
        leanLastSampleMs=0L;
        leanFilteredDeg=0f;
        leanJs("if(GaZonLean.onCalibrating)GaZonLean.onCalibrating()");
    }

    private void finishLeanCalibration(){
        float len=(float)Math.sqrt(
            leanCalibrationSum[0]*leanCalibrationSum[0]+
            leanCalibrationSum[1]*leanCalibrationSum[1]+
            leanCalibrationSum[2]*leanCalibrationSum[2]);
        if(len<0.001f){failLeanCalibration();return;}
        leanZeroGravity=new float[]{leanCalibrationSum[0]/len,leanCalibrationSum[1]/len,leanCalibrationSum[2]/len};
        leanCalibrating=false;
        leanPreviousGravity=null;
        leanFilteredDeg=0f;
        leanMaxLeftDeg=0f;leanMaxRightDeg=0f;
        prefs.edit().putBoolean("lean_calibrated_v2",true)
            .putFloat("lean_v2_gx",leanZeroGravity[0])
            .putFloat("lean_v2_gy",leanZeroGravity[1])
            .putFloat("lean_v2_gz",leanZeroGravity[2]).apply();
        leanJs("if(GaZonLean.onCalibrated)GaZonLean.onCalibrated()");
    }

    private void failLeanCalibration(){
        leanZeroGravity=leanPreviousGravity;
        leanPreviousGravity=null;
        leanCalibrating=false;
        leanJs("if(GaZonLean.onCalibrationFailed)GaZonLean.onCalibrationFailed()");
    }

    private final SensorEventListener leanSensorListener = new SensorEventListener() {
        @Override public void onSensorChanged(SensorEvent event) {
            if(!leanTracking||event==null)return;
            int type=event.sensor.getType();
            if(type!=Sensor.TYPE_ROTATION_VECTOR&&type!=Sensor.TYPE_GAME_ROTATION_VECTOR)return;
            float[] rotation=new float[9];
            try{SensorManager.getRotationMatrixFromVector(rotation,event.values);}
            catch(Exception ignored){return;}
            // The third ROW points to world-up, expressed in phone coordinates.
            float gx=rotation[6],gy=rotation[7],gz=rotation[8];
            float norm=(float)Math.sqrt(gx*gx+gy*gy+gz*gz);
            if(norm<0.2f||!Float.isFinite(norm))return;
            gx/=norm;gy/=norm;gz/=norm;
            long now=SystemClock.elapsedRealtime();
            if(leanCalibrating){
                if(now-leanCalibrationBeginMs>9000L){failLeanCalibration();return;}
                if(leanCalibrationSamples>0){
                    float inv=1f/leanCalibrationSamples;
                    float ax=leanCalibrationSum[0]*inv,ay=leanCalibrationSum[1]*inv,az=leanCalibrationSum[2]*inv;
                    float alen=(float)Math.sqrt(ax*ax+ay*ay+az*az);
                    float dot=alen>0?Math.min(1f,Math.max(-1f,(ax*gx+ay*gy+az*gz)/alen)):1f;
                    if(dot<0.9945f){
                        // Motor/phone moved more than ~6 degrees. Collect a fresh stable window.
                        leanCalibrationSamples=0;
                        leanCalibrationSum=new float[3];
                        leanCalibrationStableSinceMs=now;
                    }
                }
                if(leanCalibrationSamples==0)leanCalibrationStableSinceMs=now;
                leanCalibrationSum[0]+=gx;leanCalibrationSum[1]+=gy;leanCalibrationSum[2]+=gz;
                leanCalibrationSamples++;
                if(leanCalibrationSamples>=25&&now-leanCalibrationStableSinceMs>=1100L)finishLeanCalibration();
                return;
            }
            if(leanZeroGravity==null)return; // Never call a random first frame "0 degrees".
            float[] base=leanZeroGravity;
            float dot=Math.max(-1f,Math.min(1f,base[0]*gx+base[1]*gy+base[2]*gz));
            float crossY=base[2]*gx-base[0]*gz;
            float crossZ=base[0]*gy-base[1]*gx;
            // The vehicle-forward axis is in the phone's Y/Z plane, depending on mount tilt.
            float axisY=base[2],axisZ=-base[1];
            float axisNorm=(float)Math.sqrt(axisY*axisY+axisZ*axisZ);
            if(axisNorm<0.1f)return;
            float signed=(crossY*axisY+crossZ*axisZ)/axisNorm;
            float raw=(float)Math.toDegrees(Math.atan2(signed,dot));
            if(!Float.isFinite(raw))return;
            raw=Math.max(-85f,Math.min(85f,raw));
            // Do NOT reject a change only because it exceeds 22 degrees:
            // that made the previous sensor stay stuck at an old lean.
            float elapsed=leanLastSampleMs>0?Math.min(0.15f,Math.max(0.01f,(now-leanLastSampleMs)/1000f)):0.025f;
            leanLastSampleMs=now;
            float alpha=1f-(float)Math.exp(-elapsed/0.17f);
            float delta=raw-leanFilteredDeg;
            leanFilteredDeg+=Math.max(-12f,Math.min(12f,delta))*alpha;
            if(Math.abs(raw)<1.6f&&Math.abs(leanFilteredDeg)<1.6f)leanFilteredDeg=0f;
            if(leanFilteredDeg<-1.5f)leanMaxLeftDeg=Math.max(leanMaxLeftDeg,-leanFilteredDeg);
            else if(leanFilteredDeg>1.5f)leanMaxRightDeg=Math.max(leanMaxRightDeg,leanFilteredDeg);
            if(now-leanLastUiMs>=100L){
                leanLastUiMs=now;
                final float a=leanFilteredDeg,l=leanMaxLeftDeg,r=leanMaxRightDeg;
                leanJs("if(GaZonLean.onSensor)GaZonLean.onSensor("+
                    String.format(java.util.Locale.US,"%.2f",a)+","+
                    String.format(java.util.Locale.US,"%.2f",l)+","+
                    String.format(java.util.Locale.US,"%.2f",r)+")");
            }
        }
        @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
    };

    private final BroadcastReceiver updateDownloadReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            if (id == updateDownloadId) handleDownloadedApk(id);
        }
    };

    public class AndroidBridge {
        @JavascriptInterface public void startRide(){
            long now=System.currentTimeMillis();
            prefs.edit()
                .putBoolean("background",false)
                .putBoolean("ride_active",true)
                .putLong("ride_started_at",now)
                .putString("buffer","[]")
                .apply();
            Intent i=new Intent(MainActivity.this,RideLocationService.class);
            if(android.os.Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i);
        }
        @JavascriptInterface public void stopRide(){
            stopService(new Intent(MainActivity.this,RideLocationService.class));
            prefs.edit().putBoolean("background",false).putBoolean("ride_active",false).apply();
        }
        @JavascriptInterface public boolean isRideActive(){return prefs.getBoolean("ride_active",false);}
        @JavascriptInterface public long getRideStartedAt(){return prefs.getLong("ride_started_at",0L);}
        @JavascriptInterface public void startLeanTracking(){
            runOnUiThread(() -> startLeanSensors(false));
        }
        @JavascriptInterface public void stopLeanTracking(){
            runOnUiThread(() -> stopLeanSensors());
        }
        @JavascriptInterface public void calibrateLean(){
            runOnUiThread(() -> {
                startLeanSensors(false);
                beginLeanCalibration();
            });
        }
        @JavascriptInterface public void resetLeanSession(){
            runOnUiThread(() -> {
                leanFilteredDeg = 0f;
                leanMaxLeftDeg = 0f;
                leanMaxRightDeg = 0f;
                startLeanSensors(false);
            });
        }
        @JavascriptInterface public boolean hasLeanSensor(){
            return rotationSensor != null;
        }
        @JavascriptInterface public String getBufferedPoints(){return prefs.getString("buffer","[]");}
        @JavascriptInterface public void clearBufferedPoints(){prefs.edit().putString("buffer","[]").apply();}
        @JavascriptInterface public String getSystemTheme(){
            return isSystemDarkMode() ? "dark" : "light";
        }
        @JavascriptInterface public void openOAuth(String url){
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(i);
                } catch(Exception e) {
                    Toast.makeText(MainActivity.this,"Giriş sayfası açılamadı.",Toast.LENGTH_LONG).show();
                }
            });
        }
        @JavascriptInterface public void openExternal(String url){
            runOnUiThread(() -> {
                try {
                    Intent i=new Intent(Intent.ACTION_VIEW,Uri.parse(url));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch(Exception e) {
                    Toast.makeText(MainActivity.this,"Harita açılamadı.",Toast.LENGTH_LONG).show();
                }
            });
        }
        // Media sessions are exposed only after the user enables Android notification access.
        @JavascriptInterface public String getMusicStatus(){
            return musicController != null ? musicController.status() : "{\"native\":true,\"access\":false}";
        }
        @JavascriptInterface public void musicCommand(String command){
            if(musicController != null) musicController.command(command);
        }
        @JavascriptInterface public void requestMusicAccess(){
            if(musicController != null) musicController.requestAccess();
        }
        @JavascriptInterface public void openMusicApp(String provider){
            if(musicController != null) musicController.openPlayer(provider);
        }
        @JavascriptInterface public boolean speakNavigation(String text){
            return musicController != null && musicController.speakNavigation(text);
        }
        @JavascriptInterface public void stopNavigationSpeech(){
            if(musicController != null) musicController.stopNavigationSpeech();
        }
        @JavascriptInterface public void beginNavSpeech(){
            if(musicController != null) musicController.beginNarration();
        }
        @JavascriptInterface public void endNavSpeech(){
            if(musicController != null) musicController.endNarration();
        }
        @JavascriptInterface public void setMusicDuckingEnabled(boolean enabled){
            if(musicController != null) musicController.setDuckingEnabled(enabled);
        }
        @JavascriptInterface public String getGoogleMapsApiKey(){
            try {
                java.io.BufferedReader r = new java.io.BufferedReader(
                    new java.io.InputStreamReader(getAssets().open("google_maps_api_key.txt"))
                );
                String key = r.readLine();
                r.close();
                return key == null ? "" : key.trim();
            } catch(Exception e) {
                return "";
            }
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs=getSharedPreferences("gazonride",MODE_PRIVATE);
        if(prefs.getBoolean("lean_calibrated_v2",false)){
            float x=prefs.getFloat("lean_v2_gx",0f),y=prefs.getFloat("lean_v2_gy",0f),z=prefs.getFloat("lean_v2_gz",0f);
            float length=(float)Math.sqrt(x*x+y*y+z*z);
            if(length>0.8f&&length<1.2f)leanZeroGravity=new float[]{x/length,y/length,z/length};
        }
        musicController=new MusicController(this);
        sensorManager=(SensorManager)getSystemService(SENSOR_SERVICE);
        if(sensorManager!=null){
            rotationSensor=sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
            if(rotationSensor==null) rotationSensor=sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            accelerometerSensor=sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        }
        updateDownloadId=prefs.getLong("update_download_id",-1L);
        String pendingUri=prefs.getString("pending_install_uri",null);
        if(pendingUri!=null&&!pendingUri.isEmpty()) pendingInstallUri=Uri.parse(pendingUri);
        registerUpdateDownloadReceiver();
        captureOAuthIntent(getIntent());
        // GaZonRide is used as a motorcycle navigation screen: keep display awake
        // while the application is in the foreground.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applySystemTheme();
        webView=new WebView(this); setContentView(webView);
        WebSettings s=webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setGeolocationEnabled(true);
        s.setDatabaseEnabled(true); s.setMediaPlaybackRequiresUserGesture(false); s.setSupportZoom(false); s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.setBackgroundColor(isSystemDarkMode() ? Color.rgb(8,10,14) : Color.rgb(245,246,248));
        webView.addJavascriptInterface(new AndroidBridge(),"AndroidBridge");
        webView.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView view, String url){
                super.onPageFinished(view,url);
                deliverPendingOAuth();
            }
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback){
                if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) callback.invoke(origin,true,false);
                else {requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQ); callback.invoke(origin,true,false);}
            }
            @Override public void onPermissionRequest(PermissionRequest request){
                runOnUiThread(() -> {
                    boolean wantsAudio=false;
                    for(String r:request.getResources()) if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsAudio=true;
                    if(wantsAudio && checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
                        pendingWebPermission=request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC_REQ);
                    } else request.grant(request.getResources());
                });
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams){
                if(pendingFileChooser!=null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser=filePathCallback;
                try{
                    Intent intent=fileChooserParams.createIntent();
                    intent.setType("image/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
                    startActivityForResult(Intent.createChooser(intent,"Fotoğraf seç"),FILE_CHOOSER_REQ);
                    return true;
                }catch(Exception e){
                    pendingFileChooser=null;
                    Toast.makeText(MainActivity.this,"Fotoğraf seçici açılamadı.",Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQ);
        webView.loadUrl(URL + "?theme=" + (isSystemDarkMode() ? "dark" : "light") + "&v=" + System.currentTimeMillis());
        new Handler(Looper.getMainLooper()).postDelayed(this::checkForNativeUpdate, 1800);
    }

    private void startLeanSensors(boolean resetMax){
        if(sensorManager==null || rotationSensor==null) {
            if(webView!=null) webView.evaluateJavascript("if(window.GaZonLean&&GaZonLean.onUnavailable){GaZonLean.onUnavailable()}",null);
            return;
        }
        if(resetMax){
            leanMaxLeftDeg=0f;
            leanMaxRightDeg=0f;
        }
        leanTracking=true;
        if(!leanCalibrating)leanJs(leanZeroGravity!=null
            ? "if(GaZonLean.onCalibrated)GaZonLean.onCalibrated()"
            : "if(GaZonLean.onNeedsCalibration)GaZonLean.onNeedsCalibration()");
        sensorManager.unregisterListener(leanSensorListener);
        sensorManager.registerListener(leanSensorListener,rotationSensor,SensorManager.SENSOR_DELAY_GAME);
    }

    private void stopLeanSensors(){
        leanTracking=false;
        if(sensorManager!=null) sensorManager.unregisterListener(leanSensorListener);
    }

    private boolean isSystemDarkMode(){
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;
    }

    private void applySystemTheme(){
        boolean dark=isSystemDarkMode();
        int bg=dark ? Color.rgb(8,10,14) : Color.rgb(247,248,250);
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        if(Build.VERSION.SDK_INT>=23){
            int flags=dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if(Build.VERSION.SDK_INT>=26 && !dark) flags|=View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        if(webView!=null) webView.setBackgroundColor(bg);
    }

    @Override public void onConfigurationChanged(Configuration newConfig){
        super.onConfigurationChanged(newConfig);
        applySystemTheme();
        if(webView!=null){
            webView.setBackgroundColor(isSystemDarkMode() ? Color.rgb(8,10,14) : Color.rgb(245,246,248));
            webView.evaluateJavascript("if(window.applyAppTheme){window.applyAppTheme();}",null);
        }
    }

    private void captureOAuthIntent(Intent intent){
        if(intent==null || intent.getData()==null) return;
        Uri data=intent.getData();
        if("gazonride".equalsIgnoreCase(data.getScheme()) && "auth".equalsIgnoreCase(data.getHost())){
            pendingOAuthUrl=data.toString();
        }
    }

    private void deliverPendingOAuth(){
        if(webView==null || pendingOAuthUrl==null) return;
        final String callback=pendingOAuthUrl;
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if(webView==null || callback==null) return;
            String js="if(window.GaZonAuth&&GaZonAuth.completeOAuthCallback){GaZonAuth.completeOAuthCallback("+JSONObject.quote(callback)+");true}else{false}";
            webView.evaluateJavascript(js, value -> {
                if(value!=null && value.contains("true")) pendingOAuthUrl=null;
                else new Handler(Looper.getMainLooper()).postDelayed(this::deliverPendingOAuth,600);
            });
        },350);
    }

    @Override protected void onNewIntent(Intent intent){
        super.onNewIntent(intent);
        setIntent(intent);
        captureOAuthIntent(intent);
        deliverPendingOAuth();
    }

    private void checkForNativeUpdate(){
        new Thread(() -> {
            HttpURLConnection c=null;
            try{
                c=(HttpURLConnection)new URL(RELEASES_API).openConnection();
                c.setRequestMethod("GET");
                c.setConnectTimeout(7000);
                c.setReadTimeout(7000);
                c.setRequestProperty("Accept","application/vnd.github+json");
                c.setRequestProperty("User-Agent","GazonRide-Android");
                if(c.getResponseCode()!=200) return;
                BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream()));
                StringBuilder b=new StringBuilder(); String line;
                while((line=r.readLine())!=null)b.append(line);
                r.close();
                JSONObject o=new JSONObject(b.toString());
                String tag=o.optString("tag_name","");
                int remoteCode=0;
                if(tag.startsWith("v")) {
                    String[] p=tag.substring(1).split("\\.");
                    if(p.length>2) remoteCode=Integer.parseInt(p[p.length-1]);
                }
                int localCode=getPackageManager().getPackageInfo(getPackageName(),0).versionCode;
                if(remoteCode>localCode){
                    String html=o.optString("html_url","https://github.com/ufukcicek81/gazonride/releases/latest");
                    String assetUrl="";
                    if(o.has("assets")){
                        for(int i=0;i<o.getJSONArray("assets").length();i++){
                            JSONObject a=o.getJSONArray("assets").getJSONObject(i);
                            if(a.optString("name","").endsWith(".apk")) { assetUrl=a.optString("browser_download_url",""); break; }
                        }
                    }
                    final String openUrl=assetUrl.isEmpty()?html:assetUrl;
                    runOnUiThread(() -> new AlertDialog.Builder(this)
                        .setTitle("GazonRide güncellemesi")
                        .setMessage("Yeni Android sürümü hazır. Güncellemek ister misin?")
                        .setNegativeButton("Daha sonra",null)
                        .setPositiveButton("Güncelle", (d,w)-> startNativeUpdateDownload(openUrl))
                        .show());
                }
            }catch(Exception ignored){} finally { if(c!=null)c.disconnect(); }
        }).start();
    }


    private void registerUpdateDownloadReceiver(){
        if(downloadReceiverRegistered) return;
        IntentFilter filter=new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if(Build.VERSION.SDK_INT>=33) registerReceiver(updateDownloadReceiver,filter,Context.RECEIVER_EXPORTED);
        else registerReceiver(updateDownloadReceiver,filter);
        downloadReceiverRegistered=true;
    }

    private void startNativeUpdateDownload(String apkUrl){
        try{
            DownloadManager dm=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);
            if(dm==null) throw new IllegalStateException("DownloadManager unavailable");
            DownloadManager.Request req=new DownloadManager.Request(Uri.parse(apkUrl));
            req.setTitle("GaZonRide güncellemesi");
            req.setDescription("Yeni sürüm indiriliyor");
            req.setMimeType("application/vnd.android.package-archive");
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            updateDownloadId=dm.enqueue(req);
            prefs.edit().putLong("update_download_id",updateDownloadId).apply();
            Toast.makeText(this,"Güncelleme indiriliyor. Bitince kurulum açılacak.",Toast.LENGTH_LONG).show();
        }catch(Exception e){
            try{
                startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(apkUrl)));
            }catch(Exception ignored){
                Toast.makeText(this,"Güncelleme indirilemedi.",Toast.LENGTH_LONG).show();
            }
        }
    }

    private void handleDownloadedApk(long id){
        DownloadManager dm=(DownloadManager)getSystemService(DOWNLOAD_SERVICE);
        if(dm==null) return;
        Cursor cursor=null;
        try{
            cursor=dm.query(new DownloadManager.Query().setFilterById(id));
            if(cursor==null||!cursor.moveToFirst()) return;
            int status=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if(status==DownloadManager.STATUS_SUCCESSFUL){
                Uri apkUri=dm.getUriForDownloadedFile(id);
                prefs.edit().remove("update_download_id").apply();
                updateDownloadId=-1L;
                if(apkUri!=null) installDownloadedApk(apkUri);
                else Toast.makeText(this,"APK indirildi ama dosya açılamadı.",Toast.LENGTH_LONG).show();
            }else if(status==DownloadManager.STATUS_FAILED){
                int reason=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                prefs.edit().remove("update_download_id").apply();
                updateDownloadId=-1L;
                Toast.makeText(this,"Güncelleme indirilemedi ("+reason+").",Toast.LENGTH_LONG).show();
            }
        }catch(Exception e){
            Toast.makeText(this,"Güncelleme dosyası kontrol edilemedi.",Toast.LENGTH_LONG).show();
        }finally{
            if(cursor!=null) cursor.close();
        }
    }

    private boolean canInstallDownloadedApks(){
        return Build.VERSION.SDK_INT<26 || getPackageManager().canRequestPackageInstalls();
    }

    private void installDownloadedApk(Uri apkUri){
        pendingInstallUri=apkUri;
        if(Build.VERSION.SDK_INT>=26 && !canInstallDownloadedApks()){
            prefs.edit().putString("pending_install_uri",apkUri.toString()).apply();
            try{
                Intent settingsIntent=new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName()));
                startActivity(settingsIntent);
                Toast.makeText(this,"GaZonRide güncellemesi için 'Bu kaynaktan izin ver' seçeneğini aç.",Toast.LENGTH_LONG).show();
            }catch(Exception e){
                Toast.makeText(this,"Uygulama yükleme izni açılamadı.",Toast.LENGTH_LONG).show();
            }
            return;
        }
        try{
            Intent install=new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri,"application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);
            prefs.edit().remove("pending_install_uri").apply();
            pendingInstallUri=null;
            startActivity(install);
        }catch(Exception e){
            Toast.makeText(this,"APK kurulum ekranı açılamadı.",Toast.LENGTH_LONG).show();
        }
    }

    @Override protected void onPause(){
        super.onPause();
        prefs.edit().putBoolean("background",true).apply();
        boolean activeRide=prefs.getBoolean("ride_active",false);
        if(!activeRide && sensorManager!=null) sensorManager.unregisterListener(leanSensorListener);
    }
    @Override protected void onResume(){
        super.onResume();
        prefs.edit().putBoolean("background",false).apply();
        if(pendingInstallUri==null){
            String pending=prefs.getString("pending_install_uri",null);
            if(pending!=null&&!pending.isEmpty()) pendingInstallUri=Uri.parse(pending);
        }
        if(pendingInstallUri!=null && canInstallDownloadedApks()) installDownloadedApk(pendingInstallUri);
        if(leanTracking && sensorManager!=null && rotationSensor!=null){
            sensorManager.registerListener(leanSensorListener,rotationSensor,SensorManager.SENSOR_DELAY_GAME);
        }
        if(webView!=null) webView.evaluateJavascript("if(window.AndroidBridge&&window.AndroidBridge.getBufferedPoints){try{var bg=JSON.parse(window.AndroidBridge.getBufferedPoints()||'[]');if(bg.length){bg.forEach(function(p){applyPosition({coords:{latitude:p.lat,longitude:p.lon,accuracy:p.accuracy||20,altitude:p.altitude,speed:p.speed,timestamp:p.time}});});window.AndroidBridge.clearBufferedPoints();}}catch(e){}",null);
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==FILE_CHOOSER_REQ && pendingFileChooser!=null){
            Uri[] result=null;
            if(resultCode==Activity.RESULT_OK){
                if(data!=null && data.getClipData()!=null){
                    int count=data.getClipData().getItemCount();
                    result=new Uri[count];
                    for(int i=0;i<count;i++) result[i]=data.getClipData().getItemAt(i).getUri();
                }else if(data!=null && data.getData()!=null){
                    result=new Uri[]{data.getData()};
                }
            }
            pendingFileChooser.onReceiveValue(result);
            pendingFileChooser=null;
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==LOCATION_REQ&&webView!=null)webView.reload();
        if(requestCode==MIC_REQ&&pendingWebPermission!=null){
            if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED){
                pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            }else pendingWebPermission.deny();
            pendingWebPermission=null;
        }
    }
    @Override protected void onDestroy(){
        if(downloadReceiverRegistered){
            try{unregisterReceiver(updateDownloadReceiver);}catch(Exception ignored){}
            downloadReceiverRegistered=false;
        }
        stopLeanSensors();
        if(musicController!=null)musicController.release();
        super.onDestroy();
    }
    @Override public void onBackPressed(){
        if(webView==null){super.onBackPressed();return;}
        webView.evaluateJavascript(
            "(function(){try{return !!(window.GaZonBack&&window.GaZonBack())}catch(e){return false}})()",
            value -> {
                boolean handled="true".equalsIgnoreCase(String.valueOf(value));
                if(handled) return;
                if(webView.canGoBack()) webView.goBack();
                else MainActivity.super.onBackPressed();
            }
        );
    }
}
