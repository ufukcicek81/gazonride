package com.gazonride.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

public class RideLocationService extends Service {
    private static final String CHANNEL_ID="gazonride_tracking";
    private LocationManager lm;
    private PowerManager.WakeLock wakeLock;
    private SharedPreferences prefs;
    private long lastGpsFixAt=0;
    private final LocationListener listener=new LocationListener(){
        @Override public void onLocationChanged(Location location){
            if(prefs==null) prefs=getSharedPreferences("gazonride",MODE_PRIVATE);
            // Network (cell/Wi-Fi) fixes can be hundreds of metres off and carry
            // stale times; mixed into the GPS track they drew detours in the
            // replay. Use them only when GPS has been silent for 20 s (tunnel).
            boolean gps=LocationManager.GPS_PROVIDER.equals(location.getProvider());
            long now=android.os.SystemClock.elapsedRealtime();
            if(gps) lastGpsFixAt=now;
            else if(lastGpsFixAt>0&&now-lastGpsFixAt<20000) return;
            prefs.edit().putString("last_lat",String.valueOf(location.getLatitude())).apply();
            if(!prefs.getBoolean("ride_active",false)) return;
            try{
                String old=prefs.getString("buffer","[]");
                JSONArray arr=new JSONArray(old);
                JSONObject o=new JSONObject();
                o.put("lat",location.getLatitude()); o.put("lon",location.getLongitude());
                o.put("accuracy",location.hasAccuracy()?location.getAccuracy():20);
                o.put("altitude",location.hasAltitude()?location.getAltitude():JSONObject.NULL);
                o.put("speed",location.hasSpeed()?location.getSpeed():JSONObject.NULL);
                o.put("time",location.getTime());
                o.put("provider",gps?"gps":"network");
                arr.put(o);
                while(arr.length()>2500) arr.remove(0);
                prefs.edit().putString("buffer",arr.toString()).apply();
            }catch(Exception ignored){}
        }
    };

    @Override public void onCreate(){
        super.onCreate();
        prefs=getSharedPreferences("gazonride",MODE_PRIVATE);
        createChannel();
        PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
        if(pm!=null){
            wakeLock=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"GazOnRide:RideTracking");
            wakeLock.setReferenceCounted(false);
            try{wakeLock.acquire(8L*60L*60L*1000L);}catch(Exception ignored){}
        }
        Notification n;
        if(Build.VERSION.SDK_INT>=26) n=new Notification.Builder(this,CHANNEL_ID).setContentTitle("GazOnRide").setContentText("Sürüş GPS takibi aktif").setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build();
        else n=new Notification.Builder(this).setContentTitle("GazOnRide").setContentText("Sürüş GPS takibi aktif").setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build();
        startForeground(1001,n);
        lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        try{lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,2000,5,listener);}catch(SecurityException ignored){}
        try{lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,3000,10,listener);}catch(SecurityException ignored){}
    }
    private void createChannel(){
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel c=new NotificationChannel(CHANNEL_ID,"GazOnRide GPS",NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
        }
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){return START_STICKY;}
    @Override public void onDestroy(){
        if(lm!=null)try{lm.removeUpdates(listener);}catch(Exception ignored){}
        if(wakeLock!=null&&wakeLock.isHeld())try{wakeLock.release();}catch(Exception ignored){}
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent){return null;}
}