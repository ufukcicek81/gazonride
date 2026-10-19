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
import android.widget.Toast;
import android.view.WindowManager;
import android.view.View;
import android.content.res.Configuration;
import android.os.Build;
import android.provider.Settings;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import org.json.JSONObject;
import org.json.JSONArray;
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
    // Only native Android changes need an APK. The WebView always opens the live
    // GitHub Pages site, with browser storage preserved across app updates.
    private static final long NATIVE_UPDATE_CHECK_INTERVAL_MS = 6L * 60 * 60 * 1000;
    private static final long NATIVE_UPDATE_REMIND_INTERVAL_MS = 24L * 60 * 60 * 1000;
    private android.content.SharedPreferences prefs;
    private String pendingOAuthUrl = null;
    private PermissionRequest pendingWebPermission = null;
    private GeolocationPermissions.Callback pendingGeolocationCallback = null;
    private String pendingGeolocationOrigin = null;
    private boolean locationPermissionRequestInFlight = false;
    private ValueCallback<Uri[]> pendingFileChooser = null;
    private static final int FILE_CHOOSER_REQ = 44;

    private long updateDownloadId = -1L;
    private Uri pendingInstallUri = null;
    private boolean downloadReceiverRegistered = false;
    private volatile boolean nativeUpdateCheckRunning = false;
    // Set only for the duration of one openNativeRouteToken bridge call.
    private volatile String pendingRouteToken = "";
    private volatile String pendingRouteNote = "";
    private int safeTopPx = 0, safeBottomPx = 0;
    // Native GPS feed: some WebViews never deliver navigator.geolocation
    // fixes even with permission granted. Android's LocationManager does.
    private LocationManager locationManager;
    private boolean nativeLocationOn = false;
    private final LocationListener nativeLocationListener = new LocationListener() {
        @Override public void onLocationChanged(Location l) { pushNativeFix(l); }
        @Override public void onStatusChanged(String p, int s, Bundle b) {}
        @Override public void onProviderEnabled(String p) {}
        @Override public void onProviderDisabled(String p) {}
    };

    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private Sensor accelerometerSensor;
    private float leanZeroDeg = Float.NaN;
    // {upX,upY,upZ, axisX,axisY,axisZ}: upright gravity and bike long axis
    // (screen normal made horizontal) captured at calibration.
    private float[] leanRef = null;
    private static float[] leanBasis(float gx, float gy, float gz){
        float n = (float)Math.sqrt(gx*gx+gy*gy+gz*gz); if (n < 1e-6f) n = 1f;
        gx/=n; gy/=n; gz/=n;
        // Screen normal (0,0,1) minus its vertical part; if the phone lies
        // flat, use the phone's long axis instead.
        float ax = -gz*gx, ay = -gz*gy, az = 1f - gz*gz;
        float an = (float)Math.sqrt(ax*ax+ay*ay+az*az);
        if (an < .15f) { ax = -gy*gx; ay = 1f - gy*gy; az = -gy*gz; an = (float)Math.sqrt(ax*ax+ay*ay+az*az); }
        return new float[]{gx, gy, gz, ax/an, ay/an, az/an};
    }
    private float leanFilteredDeg = 0f;
    private float leanMaxLeftDeg = 0f;
    private float leanMaxRightDeg = 0f;
    private long leanLastUiMs = 0L;
    private boolean leanTracking = false;

    private final SensorEventListener leanSensorListener = new SensorEventListener() {
        @Override public void onSensorChanged(SensorEvent event) {
            if (!leanTracking || event == null) return;
            float rawDeg;
            try {
                if (event.sensor.getType() == Sensor.TYPE_ROTATION_VECTOR || event.sensor.getType() == Sensor.TYPE_GAME_ROTATION_VECTOR) {
                    float[] rotation = new float[9];
                    SensorManager.getRotationMatrixFromVector(rotation, event.values);
                    // "Up" expressed in phone coordinates (third row of R).
                    float gx = rotation[6], gy = rotation[7], gz = rotation[8];
                    // Lean = rotation of gravity around the bike's long axis.
                    // Measured against the calibrated upright pose, so it works
                    // for portrait AND landscape mounts and any tilt of the mount
                    // (the old roll angle was unstable for an upright phone).
                    if (leanRef == null) leanRef = leanBasis(gx, gy, gz);
                    float[] r = leanRef;
                    float cx = r[1]*gz - r[2]*gy, cy = r[2]*gx - r[0]*gz, cz = r[0]*gy - r[1]*gx;
                    float sin = cx*r[3] + cy*r[4] + cz*r[5];
                    float cos = r[0]*gx + r[1]*gy + r[2]*gz;
                    rawDeg = (float) Math.toDegrees(Math.atan2(sin, cos));
                } else {
                    return;
                }
            } catch(Exception e) {
                return;
            }
            if (Float.isNaN(leanZeroDeg)) leanZeroDeg = rawDeg;
            float lean = rawDeg - leanZeroDeg;
            while (lean > 180f) lean -= 360f;
            while (lean < -180f) lean += 360f;
            if (lean > 90f) lean = 90f;
            if (lean < -90f) lean = -90f;

            // Motorcycle vibration can create one-frame spikes. Ignore impossible jumps,
            // then apply a stronger low-pass filter for a stable lean display.
            float delta = lean - leanFilteredDeg;
            if (Math.abs(delta) > 22f) return;
            float alpha = Math.abs(delta) > 8f ? 0.10f : 0.07f;
            leanFilteredDeg = leanFilteredDeg + alpha * delta;
            if (Math.abs(leanFilteredDeg) < 0.7f) leanFilteredDeg = 0f;
            if (leanFilteredDeg < 0f) leanMaxLeftDeg = Math.max(leanMaxLeftDeg, -leanFilteredDeg);
            else leanMaxRightDeg = Math.max(leanMaxRightDeg, leanFilteredDeg);

            long now = System.currentTimeMillis();
            if (now - leanLastUiMs >= 90L) {
                leanLastUiMs = now;
                final float a = leanFilteredDeg;
                final float l = leanMaxLeftDeg;
                final float r = leanMaxRightDeg;
                runOnUiThread(() -> {
                    if (webView != null) {
                        String js = "if(window.GaZonLean&&GaZonLean.onSensor){GaZonLean.onSensor("+
                            String.format(java.util.Locale.US,"%.2f",a)+","+
                            String.format(java.util.Locale.US,"%.2f",l)+","+
                            String.format(java.util.Locale.US,"%.2f",r)+")}";
                        webView.evaluateJavascript(js,null);
                    }
                });
            }
        }
        @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
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
                leanZeroDeg = Float.NaN;
                leanRef = null;
                leanFilteredDeg = 0f;
                leanMaxLeftDeg = 0f;
                leanMaxRightDeg = 0f;
                startLeanSensors(true);
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
        @JavascriptInterface public boolean openNativeNavigation(double latitude,double longitude,String destination,boolean avoidTolls,boolean avoidHighways){
            if(!Double.isFinite(latitude)||!Double.isFinite(longitude)
                    ||Math.abs(latitude)>90||Math.abs(longitude)>180)return false;
            final String safeTitle=destination==null?"Hedef":
                    destination.length()>140?destination.substring(0,140):destination;
            runOnUiThread(() -> {
                try {
                    Intent intent=new Intent(MainActivity.this,NativeNavigationActivity.class);
                    intent.putExtra("destination_lat",latitude);
                    intent.putExtra("destination_lng",longitude);
                    intent.putExtra("destination_title",safeTitle);
                    intent.putExtra("avoid_tolls",avoidTolls);
                    intent.putExtra("avoid_highways",avoidHighways);
                    startActivity(intent);
                } catch(Exception e){
                    Toast.makeText(MainActivity.this,
                            "Google navigasyon ekranı açılamadı.",Toast.LENGTH_LONG).show();
                }
            });
            return true;
        }
        // Preserve the chosen route as ordered Google Navigation SDK stops.
        // Waypoints come from actual Google road geometry, not freehand lines.
        // The SDK remains responsible for legal roads, rerouting, ETA and voice.
        @JavascriptInterface public boolean openNativeRoute(
                String json,String title,boolean avoidTolls,boolean avoidHighways){
            if(json==null || json.length()>3500)return false;
            try {
                JSONArray points=new JSONArray(json);
                if(points.length()<1 || points.length()>8)return false;
                for(int i=0;i<points.length();i++){
                    JSONObject point=points.getJSONObject(i);
                    double lat=point.getDouble("lat"), lon=point.getDouble("lon");
                    if(!Double.isFinite(lat)||!Double.isFinite(lon)
                            ||Math.abs(lat)>90 || Math.abs(lon)>180)return false;
                }
                JSONObject last=points.getJSONObject(points.length()-1);
                double lat=last.getDouble("lat"),lon=last.getDouble("lon");
                final String validated=points.toString();
                final String token=pendingRouteToken==null?"":pendingRouteToken;
                final String note=pendingRouteNote==null?"":pendingRouteNote;
                pendingRouteNote="";
                final String safeTitle=title==null?"Hedef":title.length()>140?
                        title.substring(0,140):title;
                runOnUiThread(() -> {
                    try {
                        Intent intent=new Intent(MainActivity.this,NativeNavigationActivity.class);
                        intent.putExtra("route_waypoints",validated);
                        if(!token.isEmpty()) intent.putExtra("route_token",token);
                        intent.putExtra("route_token_note",note);
                        intent.putExtra("destination_lat",lat);
                        intent.putExtra("destination_lng",lon);
                        intent.putExtra("destination_title",safeTitle);
                        intent.putExtra("avoid_tolls",avoidTolls);
                        intent.putExtra("avoid_highways",avoidHighways);
                        startActivity(intent);
                    } catch(Exception e) {
                        Toast.makeText(MainActivity.this,
                                "GazOnRide navigasyon ekranı açılamadı.",Toast.LENGTH_LONG).show();
                    }
                });
                return true;
            } catch(Exception e){return false;}
        }
        // Same stops as openNativeRoute plus an optional Routes API token so
        // Google Navigation SDK drives exactly the road previewed in the app.
        @JavascriptInterface public boolean openNativeRouteToken(
                String json,String title,boolean avoidTolls,boolean avoidHighways,String token){
            if(token!=null && token.length()>12000) token="";
            pendingRouteToken=token==null?"":token;
            try { return openNativeRoute(json,title,avoidTolls,avoidHighways); }
            finally { pendingRouteToken=""; }
        }
        // Why the exact (token) route was unavailable; shown on the nav screen.
        @JavascriptInterface public void setRouteTokenNote(String note){
            pendingRouteNote=note==null?"":(note.length()>200?note.substring(0,200):note);
        }
        // Intercom audio route. WebRTC puts Android into call mode, which
        // plays on the EARPIECE when no headset is connected (riders heard
        // nothing). Route to helmet/headset when present, else loudspeaker.
        @JavascriptInterface public void prepareIntercom(){ runOnUiThread(() -> routeIntercomAudio(true)); }
        @JavascriptInterface public void stopIntercom(){ runOnUiThread(() -> { routeIntercomAudio(false); intercomService(false); }); }
        // Called once the microphone is open: keeps it alive in the background.
        @JavascriptInterface public void startIntercomService(){ runOnUiThread(() -> intercomService(true)); }
        @JavascriptInterface public void setIntercomSpeaker(boolean speaker){
            prefs.edit().putBoolean("intercom_speaker",speaker).apply();
            runOnUiThread(() -> routeIntercomAudio(true));
        }
        @JavascriptInterface public String getIntercomRoute(){ return intercomRoute; }
        @JavascriptInterface public String getWebChannel(){
            return prefs.getString("web_channel",getString(R.string.default_web_channel));
        }
        // Beta channel: tested development builds published at /beta/.
        @JavascriptInterface public void setWebChannel(String channel){
            final String next="beta".equals(channel)?"beta":"stable";
            prefs.edit().putString("web_channel",next).apply();
            runOnUiThread(() -> { if(webView!=null) webView.loadUrl(startUrl()); });
        }
        @JavascriptInterface public boolean openNativeTour(String json){
            try {
                JSONArray points=new JSONArray(json);
                if(points.length()!=3)return false;
                return openNativeRoute(json,"Tur başlangıcına dönüş",false,false);
            } catch(Exception e){return false;}
        }
        // System share sheet (WhatsApp, Instagram, Telegram, …): the WebView has
        // no navigator.share and cannot open whatsapp:// links by itself.
        // Ride story video: the WebView renders it, then hands it over in
        // base64 chunks (a single multi-MB string over the bridge is fragile).
        @JavascriptInterface public boolean fileBegin(String name){
            try{ java.io.File f=new java.io.File(ShareProvider.dir(MainActivity.this),safeName(name)); if(f.exists())f.delete(); return f.createNewFile(); }catch(Exception e){ return false; }
        }
        @JavascriptInterface public boolean fileAppend(String name,String base64){
            try(java.io.FileOutputStream o=new java.io.FileOutputStream(new java.io.File(ShareProvider.dir(MainActivity.this),safeName(name)),true)){
                o.write(android.util.Base64.decode(base64,android.util.Base64.DEFAULT)); return true;
            }catch(Exception e){ return false; }
        }
        @JavascriptInterface public void shareFile(String name,String mime,String text){
            runOnUiThread(() -> {
                try{
                    Uri uri=Uri.parse("content://"+ShareProvider.AUTHORITY+"/"+safeName(name));
                    Intent send=new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM,uri);
                    if(text!=null&&!text.isEmpty())send.putExtra(Intent.EXTRA_TEXT,text);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(android.content.ClipData.newRawUri("",uri));
                    Intent chooser=Intent.createChooser(send,"Sürüş videosunu paylaş");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(chooser);
                }catch(Exception e){
                    Toast.makeText(MainActivity.this,"Video paylaşılamadı.",Toast.LENGTH_LONG).show();
                }
            });
        }
        // Copies the video into the gallery (Movies/GazOnRide). Android 10+.
        @JavascriptInterface public boolean saveToGallery(String name,String mime){
            if(android.os.Build.VERSION.SDK_INT<29)return false;
            try{
                android.content.ContentValues v=new android.content.ContentValues();
                v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,safeName(name));
                v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,mime);
                v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,"Movies/GazOnRide");
                Uri dest=getContentResolver().insert(android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI,v);
                if(dest==null)return false;
                try(java.io.InputStream in=new java.io.FileInputStream(new java.io.File(ShareProvider.dir(MainActivity.this),safeName(name)));
                    java.io.OutputStream out=getContentResolver().openOutputStream(dest)){
                    byte[] b=new byte[65536];int n;while((n=in.read(b))>0)out.write(b,0,n);
                }
                return true;
            }catch(Exception e){ return false; }
        }
        // Markers left on the native navigation screen; returned once, then cleared.
        @JavascriptInterface public String takeNativeMarks(){
            String v=prefs.getString("native_marks","[]");
            prefs.edit().remove("native_marks").apply();
            return v;
        }
        @JavascriptInterface public void shareText(String title,String text){
            runOnUiThread(() -> {
                try {
                    Intent send=new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_SUBJECT,title==null?"GazOnRide":title);
                    send.putExtra(Intent.EXTRA_TEXT,text==null?"":text);
                    Intent chooser=Intent.createChooser(send,"Sürüşü paylaş");
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(chooser);
                } catch(Exception e) {
                    Toast.makeText(MainActivity.this,"Paylaşım açılamadı.",Toast.LENGTH_LONG).show();
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
        // GazOnRide is used as a motorcycle navigation screen: keep display awake
        // while the application is in the foreground.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applySystemTheme();
        webView=new WebView(this); setContentView(webView);
        WebSettings s=webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setGeolocationEnabled(true);
        // index.html is always fetched fresh (?v=timestamp); scripts and styles
        // carry version query strings, so the HTTP cache is safe and makes
        // start-up much faster than LOAD_NO_CACHE.
        s.setDatabaseEnabled(true); s.setMediaPlaybackRequiresUserGesture(false); s.setSupportZoom(false); s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Edge-to-edge (Android 15+): tell the web UI how tall the status and
        // navigation bars are, because env(safe-area-inset-*) is 0 in WebView.
        webView.setOnApplyWindowInsetsListener((v, insets) -> {
            safeTopPx=insets.getSystemWindowInsetTop();
            safeBottomPx=insets.getSystemWindowInsetBottom();
            pushSafeArea();
            return insets;
        });
        webView.setBackgroundColor(isSystemDarkMode() ? Color.rgb(8,10,14) : Color.rgb(245,246,248));
        webView.addJavascriptInterface(new AndroidBridge(),"AndroidBridge");
        webView.setWebViewClient(new WebViewClient(){
            // Only the app's own site loads inside the WebView; any other page
            // (photo credits, Wikipedia, WhatsApp…) opens outside the app so
            // the rider can always come back with the back button.
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request){
                Uri u=request.getUrl();
                String host=u.getHost()==null?"":u.getHost();
                String scheme=u.getScheme()==null?"":u.getScheme();
                Uri current=Uri.parse(view.getUrl()==null?"":view.getUrl());
                if(("https".equals(scheme)||"http".equals(scheme))&&host.equals(current.getHost()))return false;
                if("about".equals(scheme)||"data".equals(scheme)||"blob".equals(scheme)||"javascript".equals(scheme))return false;
                try{
                    Intent i=new Intent(Intent.ACTION_VIEW,u);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                }catch(Exception e){
                    Toast.makeText(MainActivity.this,"Bağlantı açılamadı.",Toast.LENGTH_SHORT).show();
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url){
                super.onPageFinished(view,url);
                pushSafeArea();
                stopNativeLocation();
                startNativeLocation();
                deliverPendingOAuth();
            }
        });
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback){
                if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
                        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED){
                    callback.invoke(origin,true,false);
                    return;
                }
                // Don't approve WebView GPS before Android grants permission,
                // and don't reload the page after the user chooses an option.
                if(pendingGeolocationCallback!=null&&pendingGeolocationOrigin!=null){
                    pendingGeolocationCallback.invoke(pendingGeolocationOrigin,false,false);
                }
                pendingGeolocationCallback=callback;
                pendingGeolocationOrigin=origin;
                if(!locationPermissionRequestInFlight){
                    locationPermissionRequestInFlight=true;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQ);
                }
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
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
            locationPermissionRequestInFlight=true;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQ);
        }
        webView.loadUrl(startUrl());
        new Handler(Looper.getMainLooper()).postDelayed(this::checkForNativeUpdate, 1800);
        new Handler(Looper.getMainLooper()).postDelayed(this::checkForBetaUpdate, 2500);
    }

    private void startNativeLocation(){
        if(nativeLocationOn) return;
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) return;
        if(locationManager==null) locationManager=(LocationManager)getSystemService(LOCATION_SERVICE);
        if(locationManager==null) return;
        try{
            Location last=null;
            for(String provider:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER}){
                try{
                    Location l=locationManager.getLastKnownLocation(provider);
                    if(l!=null&&(last==null||l.getTime()>last.getTime())) last=l;
                }catch(Exception ignored){}
            }
            // A recent cached fix shows the rider on the map immediately.
            if(last!=null&&System.currentTimeMillis()-last.getTime()<10*60*1000L) pushNativeFix(last);
            if(locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER))
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,1000,0,nativeLocationListener,Looper.getMainLooper());
            if(locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,4000,0,nativeLocationListener,Looper.getMainLooper());
            nativeLocationOn=true;
        }catch(SecurityException ignored){}
    }

    private void stopNativeLocation(){
        if(!nativeLocationOn||locationManager==null) return;
        try{locationManager.removeUpdates(nativeLocationListener);}catch(Exception ignored){}
        nativeLocationOn=false;
    }

    private void pushNativeFix(Location l){
        if(webView==null||l==null) return;
        String js=String.format(java.util.Locale.US,
            "window.GaZonNativeFix&&GaZonNativeFix(%.7f,%.7f,%.1f,%s,%s,%s,%d,%s)",
            l.getLatitude(),l.getLongitude(),l.hasAccuracy()?l.getAccuracy():50f,
            l.hasSpeed()?String.format(java.util.Locale.US,"%.2f",l.getSpeed()):"null",
            l.hasBearing()?String.format(java.util.Locale.US,"%.1f",l.getBearing()):"null",
            l.hasAltitude()?String.format(java.util.Locale.US,"%.1f",l.getAltitude()):"null",
            l.getTime(),JSONObject.quote(String.valueOf(l.getProvider())));
        webView.evaluateJavascript(js,null);
    }

    private volatile String intercomRoute = "";
    private void intercomService(boolean on){
        Intent i=new Intent(this,IntercomService.class);
        try{
            if(!on){ stopService(i); return; }
            // A microphone foreground service without the permission crashes on Android 14.
            if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) return;
            if(Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i);
        }catch(Exception e){ android.util.Log.w("GazOnRide","Intercom service",e); }
    }
    private void routeIntercomAudio(boolean on){
        AudioManager am=(AudioManager)getSystemService(AUDIO_SERVICE);
        if(am==null) return;
        try{
            if(!on){
                if(Build.VERSION.SDK_INT>=31) am.clearCommunicationDevice();
                else { am.setSpeakerphoneOn(false); if(am.isBluetoothScoOn()){ am.stopBluetoothSco(); am.setBluetoothScoOn(false);} }
                am.setMode(AudioManager.MODE_NORMAL);
                intercomRoute="";
                return;
            }
            boolean speaker=prefs.getBoolean("intercom_speaker",true);
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if(Build.VERSION.SDK_INT>=31){
                AudioDeviceInfo headset=null,spk=null,ear=null;
                for(AudioDeviceInfo d:am.getAvailableCommunicationDevices()){
                    int t=d.getType();
                    if(t==AudioDeviceInfo.TYPE_BLUETOOTH_SCO||t==AudioDeviceInfo.TYPE_BLE_HEADSET||t==AudioDeviceInfo.TYPE_WIRED_HEADSET
                            ||t==AudioDeviceInfo.TYPE_WIRED_HEADPHONES||t==AudioDeviceInfo.TYPE_USB_HEADSET){ if(headset==null) headset=d; }
                    else if(t==AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) spk=d;
                    else if(t==AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) ear=d;
                }
                AudioDeviceInfo target=headset!=null?headset:(speaker?spk:ear);
                if(target!=null) am.setCommunicationDevice(target);
                intercomRoute=headset!=null?"headset":(speaker?"speaker":"earpiece");
            }else{
                if(am.isBluetoothScoAvailableOffCall()){ am.startBluetoothSco(); am.setBluetoothScoOn(true); }
                boolean wired=am.isWiredHeadsetOn();
                am.setSpeakerphoneOn(speaker&&!wired);
                intercomRoute=wired?"headset":(speaker?"speaker":"earpiece");
            }
        }catch(Exception ignored){}
    }

    private String startUrl(){
        String base="beta".equals(prefs.getString("web_channel",getString(R.string.default_web_channel))) ? URL + "beta/" : URL;
        return base + "?theme=" + (isSystemDarkMode() ? "dark" : "light") + "&v=" + System.currentTimeMillis();
    }

    private void pushSafeArea(){
        if(webView==null) return;
        float density=getResources().getDisplayMetrics().density;
        if(density<=0) density=1f;
        String js=String.format(java.util.Locale.US,
            "(function(r){r.style.setProperty('--gr-safe-top','%.1fpx');r.style.setProperty('--gr-safe-bottom','%.1fpx');r.classList.add('gr-native-insets')})(document.documentElement)",
            safeTopPx/density, safeBottomPx/density);
        webView.evaluateJavascript(js,null);
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

    private static String safeName(String n){
        String s=n==null?"video.mp4":n.replaceAll("[^A-Za-z0-9._-]","_");
        return s.length()>80?s.substring(s.length()-80):s;
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

    // Compare the VERSION NAME (1.0.112) to release tags (v1.0.113).
    // Earlier builds compared the short release number 113 against versionCode
    // 1113 (=1000+run), so update notifications never appeared.
    private static int parseReleaseNumber(String tag){
        if(tag==null || !tag.matches("v?1\\.0\\.[0-9]+")) return -1;
        try { return Integer.parseInt(tag.substring(tag.lastIndexOf('.')+1)); }
        catch (NumberFormatException ignored){ return -1; }
    }

    private void checkForNativeUpdate(){
        if(prefs==null || prefs.getBoolean("ride_active",false) || nativeUpdateCheckRunning) return;
        long now=System.currentTimeMillis();
        if(now-prefs.getLong("native_update_last_check_ms",0L)<NATIVE_UPDATE_CHECK_INTERVAL_MS) return;
        nativeUpdateCheckRunning=true;
        prefs.edit().putLong("native_update_last_check_ms",now).apply();
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
                int remoteCode=parseReleaseNumber(o.optString("tag_name",""));
                String installedVersion=getPackageManager().getPackageInfo(getPackageName(),0).versionName;
                int localCode=parseReleaseNumber(installedVersion);
                if(remoteCode<=0 || localCode<0 || remoteCode<=localCode) return;

                String assetUrl="";
                if(o.has("assets")){
                    for(int i=0;i<o.getJSONArray("assets").length();i++){
                        JSONObject a=o.getJSONArray("assets").getJSONObject(i);
                        String candidate=a.optString("browser_download_url","");
                        if(a.optString("name","").endsWith(".apk")
                                && candidate.startsWith("https://github.com/ufukcicek81/gazonride/releases/download/")){
                            assetUrl=candidate;break;
                        }
                    }
                }
                if(assetUrl.isEmpty()) return; // Never send a release HTML page to DownloadManager.
                long promptedAt=prefs.getLong("native_update_prompt_ms",0L);
                int promptedCode=prefs.getInt("native_update_prompt_code",-1);
                if(promptedCode==remoteCode &&
                        System.currentTimeMillis()-promptedAt<NATIVE_UPDATE_REMIND_INTERVAL_MS) return;
                final int newCode=remoteCode;
                final String apkUrl=assetUrl;
                runOnUiThread(() -> {
                    if(isFinishing() || (Build.VERSION.SDK_INT>=17 && isDestroyed())
                            || prefs.getBoolean("ride_active",false)) return;
                    new AlertDialog.Builder(this)
                        .setTitle("GazOnRide v1.0."+newCode)
                        .setMessage("Android navigasyon veya telefon özellikleri için yeni sürüm hazır. Sürüş kayıtların korunacak. Güncellemeyi uygulama içinden indirmek ister misin?")
                        .setNegativeButton("Daha sonra",(d,w)->{
                            prefs.edit().putInt("native_update_prompt_code",newCode)
                                .putLong("native_update_prompt_ms",System.currentTimeMillis()).apply();
                        })
                        .setPositiveButton("Güncelle",(d,w)->{
                            prefs.edit().putInt("native_update_prompt_code",newCode)
                                .putLong("native_update_prompt_ms",System.currentTimeMillis()).apply();
                            startNativeUpdateDownload(apkUrl);
                        }).show();
                });
            }catch(Exception ignored){} finally {
                if(c!=null)c.disconnect();
                nativeUpdateCheckRunning=false;
            }
        }).start();
    }

    // Test builds only: offer the newest beta-latest APK in one tap.
    // The pre-release body contains the commit it was built from; the APK
    // knows its own commit (build_commit), so equal commits = up to date.
    private static final String BETA_RELEASE_API = "https://api.github.com/repos/ufukcicek81/gazonride/releases/tags/beta-latest";
    private static final String BETA_APK_URL = "https://github.com/ufukcicek81/gazonride/releases/download/beta-latest/GaZonRide-beta.apk";
    private volatile boolean betaCheckRunning = false;
    private void checkForBetaUpdate(){
        String own=getString(R.string.build_commit);
        if(prefs==null || betaCheckRunning || own.isEmpty() || !"beta".equals(getString(R.string.default_web_channel))) return;
        if(prefs.getBoolean("ride_active",false)) return;
        long now=System.currentTimeMillis();
        if(now-prefs.getLong("beta_update_last_check_ms",0L)<10L*60*1000) return;
        betaCheckRunning=true;
        prefs.edit().putLong("beta_update_last_check_ms",now).apply();
        new Thread(() -> {
            HttpURLConnection c=null;
            try{
                c=(HttpURLConnection)new URL(BETA_RELEASE_API).openConnection();
                c.setConnectTimeout(7000); c.setReadTimeout(7000);
                c.setRequestProperty("Accept","application/vnd.github+json");
                c.setRequestProperty("User-Agent","GazonRide-Android");
                if(c.getResponseCode()!=200) return;
                BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream()));
                StringBuilder b=new StringBuilder(); String line;
                while((line=r.readLine())!=null)b.append(line);
                r.close();
                String body=new JSONObject(b.toString()).optString("body","");
                java.util.regex.Matcher m=java.util.regex.Pattern.compile("@ ([0-9a-f]{40})").matcher(body);
                if(!m.find()) return;
                final String remote=m.group(1);
                if(remote.equals(own) || remote.equals(prefs.getString("beta_update_skipped",""))) return;
                runOnUiThread(() -> {
                    if(isFinishing() || prefs.getBoolean("ride_active",false)) return;
                    new AlertDialog.Builder(this)
                        .setTitle("Yeni test sürümü hazır")
                        .setMessage("GazOnRide BETA güncellendi. Sürüşlerin ve ayarların korunur. Şimdi indirilip kurulsun mu?")
                        .setNegativeButton("Daha sonra",(d,w)->prefs.edit().putString("beta_update_skipped",remote).apply())
                        .setPositiveButton("Güncelle",(d,w)->startNativeUpdateDownload(BETA_APK_URL))
                        .show();
                });
            }catch(Exception ignored){} finally {
                if(c!=null)c.disconnect();
                betaCheckRunning=false;
            }
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
            req.setTitle("GazOnRide güncellemesi");
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
                Toast.makeText(this,"GazOnRide güncellemesi için 'Bu kaynaktan izin ver' seçeneğini aç.",Toast.LENGTH_LONG).show();
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
        // Background ride points come from RideLocationService.
        stopNativeLocation();
        if(!activeRide && sensorManager!=null) sensorManager.unregisterListener(leanSensorListener);
    }
    @Override protected void onResume(){
        super.onResume();
        prefs.edit().putBoolean("background",false).apply();
        startNativeLocation();
        if(pendingInstallUri==null){
            String pending=prefs.getString("pending_install_uri",null);
            if(pending!=null&&!pending.isEmpty()) pendingInstallUri=Uri.parse(pending);
        }
        if(pendingInstallUri!=null && canInstallDownloadedApks()) installDownloadedApk(pendingInstallUri);
        if(updateDownloadId!=-1L) new Handler(Looper.getMainLooper()).postDelayed(() -> handleDownloadedApk(updateDownloadId),700);
        // Check again when the user comes back later, but never during an active ride.
        checkForNativeUpdate();
        checkForBetaUpdate();
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
        if(requestCode==LOCATION_REQ){
            locationPermissionRequestInFlight=false;
            boolean granted=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
            if(pendingGeolocationCallback!=null){
                pendingGeolocationCallback.invoke(pendingGeolocationOrigin,granted,false);
                pendingGeolocationCallback=null;
                pendingGeolocationOrigin=null;
            }
            // Keep the current destination, route selection and riding state;
            // a location permission dialog must never reload the WebView.
            if(granted) startNativeLocation();
            if(webView!=null)webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('gazon-location-permission-changed'));",null);
        }
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
        stopNativeLocation();
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
