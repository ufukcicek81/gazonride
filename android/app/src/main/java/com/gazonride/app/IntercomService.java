package com.gazonride.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps the intercom microphone alive while the app is in the background or
 * the screen is off. Since Android 9 a backgrounded app only hears silence
 * from the microphone unless a foreground service of type "microphone" runs;
 * the WebRTC call itself stays in the WebView. Started from the intercom join
 * (app in the foreground, as Android 11+ requires) and stopped on leave.
 */
public class IntercomService extends Service {
    private static final String CHANNEL_ID="gazonride_intercom";
    private PowerManager.WakeLock wakeLock;

    @Override public void onCreate(){
        super.onCreate();
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel c=new NotificationChannel(CHANNEL_ID,"GazOnRide Intercom",NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
        }
        Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL_ID):new Notification.Builder(this);
        Notification n=b.setContentTitle("GazOnRide Intercom")
                .setContentText("Intercom açık · mikrofon ekran kapalıyken de çalışır")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(pi).setOngoing(true).build();
        try{
            if(Build.VERSION.SDK_INT>=30) startForeground(1002,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(1002,n);
        }catch(Exception e){ stopSelf(); return; }
        PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
        if(pm!=null){
            wakeLock=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"GazOnRide:Intercom");
            wakeLock.setReferenceCounted(false);
            try{wakeLock.acquire(6L*60L*60L*1000L);}catch(Exception ignored){}
        }
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){ return START_NOT_STICKY; }
    @Override public void onDestroy(){
        if(wakeLock!=null&&wakeLock.isHeld())try{wakeLock.release();}catch(Exception ignored){}
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent){ return null; }
}
