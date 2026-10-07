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
import org.json.JSONArray;
import org.json.JSONObject;

public class RideLocationService extends Service {
    private static final String CHANNEL_ID="gazonride_tracking";
    private LocationManager lm;
    private final LocationListener listener=new LocationListener(){
        @Override public void onLocationChanged(Location location){
            getSharedPreferences("gazonride",MODE_PRIVATE).edit().putString("last_lat",String.valueOf(location.getLatitude())).apply();
            boolean bg=getSharedPreferences("gazonride",MODE_PRIVATE).getBoolean("background",false);
            if(!bg) return;
            try{
                String old=getSharedPreferences("gazonride",MODE_PRIVATE).getString("buffer","[]");
                JSONArray arr=new JSONArray(old);
                JSONObject o=new JSONObject();
                o.put("lat",location.getLatitude()); o.put("lon",location.getLongitude());
                o.put("accuracy",location.hasAccuracy()?location.getAccuracy():20);
                o.put("altitude",location.hasAltitude()?location.getAltitude():JSONObject.NULL);
                o.put("speed",location.hasSpeed()?location.getSpeed():JSONObject.NULL);
                o.put("time",location.getTime());
                arr.put(o);
                while(arr.length()>2500) arr.remove(0);
                getSharedPreferences("gazonride",MODE_PRIVATE).edit().putString("buffer",arr.toString()).apply();
            }catch(Exception ignored){}
        }
    };

    @Override public void onCreate(){
        super.onCreate();
        createChannel();
        Notification n;
        if(Build.VERSION.SDK_INT>=26) n=new Notification.Builder(this,CHANNEL_ID).setContentTitle("GazonRide").setContentText("Sürüş GPS takibi aktif").setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build();
        else n=new Notification.Builder(this).setContentTitle("GazonRide").setContentText("Sürüş GPS takibi aktif").setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build();
        startForeground(1001,n);
        lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        try{lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,2000,5,listener);}catch(SecurityException ignored){}
        try{lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,3000,10,listener);}catch(SecurityException ignored){}
    }
    private void createChannel(){
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel c=new NotificationChannel(CHANNEL_ID,"GazonRide GPS",NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
        }
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){return START_STICKY;}
    @Override public void onDestroy(){
        if(lm!=null)try{lm.removeUpdates(listener);}catch(Exception ignored){}
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent){return null;}
}