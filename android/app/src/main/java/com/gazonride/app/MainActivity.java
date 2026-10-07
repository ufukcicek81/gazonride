package com.gazonride.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;
import android.view.WindowManager;
import android.view.View;
import android.content.res.Configuration;
import android.os.Build;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private WebView webView;
    private static final int LOCATION_REQ = 42;
    private static final String URL = "https://ufukcicek81.github.io/gazonride/";
    private static final String RELEASES_API = "https://api.github.com/repos/ufukcicek81/gazonride/releases/latest";
    private android.content.SharedPreferences prefs;

    public class AndroidBridge {
        @JavascriptInterface public void startRide(){
            prefs.edit().putBoolean("background",false).putString("buffer","[]").apply();
            Intent i=new Intent(MainActivity.this,RideLocationService.class);
            if(android.os.Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i);
        }
        @JavascriptInterface public void stopRide(){
            stopService(new Intent(MainActivity.this,RideLocationService.class));
            prefs.edit().putBoolean("background",false).apply();
        }
        @JavascriptInterface public String getBufferedPoints(){return prefs.getString("buffer","[]");}
        @JavascriptInterface public void clearBufferedPoints(){prefs.edit().putString("buffer","[]").apply();}
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs=getSharedPreferences("gazonride",MODE_PRIVATE);
        // GaZonRide is used as a motorcycle navigation screen: keep display awake
        // while the application is in the foreground.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applySystemTheme();
        webView=new WebView(this); setContentView(webView);
        WebSettings s=webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setGeolocationEnabled(true);
        s.setDatabaseEnabled(true); s.setMediaPlaybackRequiresUserGesture(false); s.setSupportZoom(false); s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.setBackgroundColor(Color.rgb(8,10,14));
        webView.addJavascriptInterface(new AndroidBridge(),"AndroidBridge");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient(){
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback){
                if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) callback.invoke(origin,true,false);
                else {requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQ); callback.invoke(origin,true,false);}
            }
            @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->request.grant(request.getResources()));}
        });
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQ);
        webView.loadUrl(URL + "?v=" + System.currentTimeMillis());
        new Handler(Looper.getMainLooper()).postDelayed(this::checkForNativeUpdate, 1800);
    }

    private void applySystemTheme(){
        boolean dark=(getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;
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
                        .setPositiveButton("Güncelle", (d,w)->{
                            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(openUrl))); }
                            catch(Exception e){ Toast.makeText(this,"Güncelleme sayfası açılamadı.",Toast.LENGTH_LONG).show(); }
                        }).show());
                }
            }catch(Exception ignored){} finally { if(c!=null)c.disconnect(); }
        }).start();
    }

    @Override protected void onPause(){super.onPause();prefs.edit().putBoolean("background",true).apply();}
    @Override protected void onResume(){super.onResume();prefs.edit().putBoolean("background",false).apply(); if(webView!=null) webView.evaluateJavascript("if(window.AndroidBridge&&window.AndroidBridge.getBufferedPoints){try{var bg=JSON.parse(window.AndroidBridge.getBufferedPoints()||'[]');if(bg.length){bg.forEach(function(p){applyPosition({coords:{latitude:p.lat,longitude:p.lon,accuracy:p.accuracy||20,altitude:p.altitude,speed:p.speed,timestamp:p.time}});});window.AndroidBridge.clearBufferedPoints();}}catch(e){}",null);}
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==LOCATION_REQ&&webView!=null)webView.reload();}
    @Override public void onBackPressed(){if(webView.canGoBack())webView.goBack();else super.onBackPressed();}
}
