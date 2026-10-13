package com.gazonride.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.ArrayList;
import java.util.List;

import com.google.android.gms.maps.GoogleMap;
import com.google.android.libraries.navigation.CustomRoutesOptions;
import com.google.android.libraries.navigation.ListenableResultFuture;
import com.google.android.libraries.navigation.NavigationApi;
import com.google.android.libraries.navigation.NavigationView;
import com.google.android.libraries.navigation.Navigator;
import com.google.android.libraries.navigation.RoutingOptions;
import com.google.android.libraries.navigation.TimeAndDistance;
import com.google.android.libraries.navigation.Waypoint;

/**
 * Native in-app Google navigation. Runs as a second screen of GaZonRide so the
 * original WebView, motorcycle tracking service, music player and 3D replay
 * remain intact. No Google Maps application or third-party WebView is opened.
 *
 * Navigation SDK displays Google's own maneuver banner, road-snapped location,
 * rerouting and ETA card. This activity never starts the SDK simulator in a
 * real drive and never uses the web page's approximate ETA calculation.
 */
public final class NativeNavigationActivity extends Activity {
    private static final int LOCATION_REQUEST = 622;
    private NavigationView navigationView;
    private Navigator navigator;
    private TextView statusText;
    private LinearLayout diagnosticPanel;
    private Button diagnosticRetry;
    private TextView progressText;
    private TextView trackText;
    private Button musicToggle;
    private Button musicFab;
    private View musicPanel;
    private MusicController musicController;
    private boolean closed;
    private boolean routeStarted;
    private int tourStopsRemaining = 0;
    private boolean exactRoute;
    private String routeNote = "";
    private TextView totalText;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Navigator.RemainingTimeOrDistanceChangedListener progressListener;
    private Navigator.ArrivalListener arrivalListener;

    private final Runnable musicRefresh = new Runnable() {
        @Override public void run() {
            if (closed) return;
            refreshMusic();
            ui.postDelayed(this, 2500L);
        }
    };

    private int dp(float px) {
        return (int) (px * getResources().getDisplayMetrics().density + .5f);
    }

    private GradientDrawable shape(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radius));
        return d;
    }

    private TextView label(String text, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(Color.WHITE);
        view.setTextSize(size);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }

    private Button control(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setTextSize(15);
        button.setPadding(dp(8), 0, dp(8), 0);
        button.setBackground(shape(Color.rgb(35, 42, 55), 14));
        return button;
    }

    private void message(String text) {
        if (closed) return;
        runOnUiThread(() -> {
            if (statusText != null) statusText.setText(text);
            boolean error = text != null && (text.contains("başlatılamadı") ||
                    text.contains("oluşturamadı") || text.contains("yetkisiz") ||
                    text.contains("Geçersiz") || text.contains("izin") ||
                    text.contains("internet") || text.contains("bulunamadı") ||
                    text.contains("kapalı") || text.contains("hata") ||
                    text.contains("kabul edilmedi") || text.contains("kabul etmelisin"));
            // Google renders its own directions. The diagnostic card is only
            // shown while waiting or after a failure, never over active guidance.
            if (diagnosticPanel != null)
                diagnosticPanel.setVisibility(routeStarted && !error ? View.GONE : View.VISIBLE);
            if (diagnosticRetry != null) diagnosticRetry.setVisibility(error ? View.VISIBLE : View.GONE);
        });
    }
    private void retryNavigation() {
        if (closed) return;
        routeStarted = false;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            message("Navigasyon için hassas konum izni gerekli.");
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION_REQUEST);
        } else if (navigator == null) {
            initializeNavigator();
        } else {
            planNativeRoute();
        }
    }
    private String navigationError(@NavigationApi.ErrorCode int code) {
        switch (code) {
            case NavigationApi.ErrorCode.NOT_AUTHORIZED:
                return "Google Navigation SDK yetkisiz (hata 1). Google Cloud'da Navigation SDK etkinliğini, Android paket adını ve imza SHA-1 kısıtlamasını kontrol et.";
            case NavigationApi.ErrorCode.TERMS_NOT_ACCEPTED:
                return "Google Navigasyon kullanım koşulları kabul edilmedi (hata 2). Tekrar dene ve açılan koşulları onayla.";
            case NavigationApi.ErrorCode.NETWORK_ERROR:
                return "Google navigasyon için internet bağlantısı bulunamadı (hata 3). İnterneti kontrol edip tekrar dene.";
            case NavigationApi.ErrorCode.LOCATION_PERMISSION_MISSING:
                return "Navigasyon için hassas konum izni gerekli (hata 4). Uygulama konum iznini aç.";
            default:
                return "Google navigasyon başlatılamadı. SDK hata kodu: " + code;
        }
    }
    private String routeError(Navigator.RouteStatus code) {
        // Google SDK 7.3 does not expose every status of recent versions.
        // Switch on the name so diagnostics compile across SDK upgrades.
        switch (String.valueOf(code)) {
            case "LOCATION_DISABLED":
                return "Telefonun konum servisi kapalı. GPS'i açıp tekrar dene.";
            case "LOCATION_UNKNOWN":
                return "Konum bulunamadı. Açık alanda GPS sinyalini bekleyip tekrar dene.";
            case "NETWORK_ERROR":
                return "Rota için internet bağlantısı bulunamadı. Bağlantıyı kontrol et.";
            case "QUOTA_CHECK_FAILED":
                return "Google Navigation kota hatası. Cloud Console'daki kotayı kontrol et.";
            case "WAYPOINT_ERROR":
                return "Rotadaki bir ara nokta kabul edilmedi. Farklı güzergâh dene.";
            case "NO_ROUTE_FOUND":
                return "Google bu güzergâh için yol bulamadı. Farklı rota seç.";
            case "ROUTING_TIMEOUT":
                return "Rota hesaplaması zaman aşımına uğradı. Tekrar dene.";
            default:
                return "Google rota oluşturamadı. Rota hata kodu: " + code;
        }
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(12, 18, 27));
        getWindow().setNavigationBarColor(Color.rgb(12, 18, 27));
        musicController = new MusicController(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(12, 18, 27));
        // Android 15+ draws edge-to-edge for targetSdk 35+. Keep Google's
        // maneuver banner and ETA card clear of the status and gesture bars.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        navigationView = new NavigationView(this);
        root.addView(navigationView, new FrameLayout.LayoutParams(-1, -1));

        // Keep Google's turn-by-turn banner unobstructed. Exit remains
        // available as a small one-tap control above the native ETA card.
        Button back = control("✕");
        back.setTextSize(22);
        back.setContentDescription("Navigasyonu bitir ve GaZonRide'a dön");
        back.setBackground(shape(0xEC151D2B, 32));
        back.setOnClickListener(v -> exitNavigation());
        FrameLayout.LayoutParams backParams =
                new FrameLayout.LayoutParams(dp(64), dp(64), Gravity.BOTTOM | Gravity.END);
        backParams.setMargins(0, 0, dp(10), dp(10));
        root.addView(back, backParams);

        // The Navigation SDK already shows remaining distance, travel time,
        // destination time, and spoken maneuvers. Never duplicate these in a
        // custom overlay (which used to block the road and native controls).
        progressText = label("", 14, true);
        statusText = label("Google navigasyonu hazırlanıyor…", 15, true);
        statusText.setMaxLines(5);
        diagnosticPanel = new LinearLayout(this);
        diagnosticPanel.setOrientation(LinearLayout.VERTICAL);
        diagnosticPanel.setPadding(dp(18), dp(15), dp(18), dp(15));
        diagnosticPanel.setBackground(shape(0xF3192637, 18));
        diagnosticPanel.addView(statusText,
                new LinearLayout.LayoutParams(-1, -2));
        diagnosticRetry = control("Tekrar dene");
        diagnosticRetry.setContentDescription("Google navigasyon bağlantısını yeniden dene");
        diagnosticRetry.setBackground(shape(0xFF1A73E8, 12));
        diagnosticRetry.setOnClickListener(v -> retryNavigation());
        LinearLayout.LayoutParams retryParams =
                new LinearLayout.LayoutParams(-1, dp(46));
        retryParams.topMargin = dp(12);
        diagnosticPanel.addView(diagnosticRetry, retryParams);
        diagnosticRetry.setVisibility(View.GONE);
        FrameLayout.LayoutParams diagnosticParams = new FrameLayout.LayoutParams(
                -1, -2, Gravity.CENTER_VERTICAL);
        diagnosticParams.setMargins(dp(22), 0, dp(22), 0);
        root.addView(diagnosticPanel, diagnosticParams);

        // Spotify/YouTube Music remains available without leaving navigation.
        LinearLayout music = new LinearLayout(this);
        music.setOrientation(LinearLayout.HORIZONTAL);
        music.setGravity(Gravity.CENTER_VERTICAL);
        music.setPadding(dp(8), dp(5), dp(8), dp(5));
        music.setBackground(shape(0xEC151D2B, 15));
        Button play = control("▶ / Ⅱ");
        play.setContentDescription("Müziği oynat veya duraklat");
        play.setOnClickListener(v -> {
            if (musicController != null) musicController.command("toggle");
            ui.postDelayed(this::refreshMusic, 350);
        });
        Button next = control("⏭");
        next.setContentDescription("Sonraki şarkı");
        next.setOnClickListener(v -> {
            if (musicController != null) musicController.command("next");
            ui.postDelayed(this::refreshMusic, 350);
        });
        trackText = label("Müzik", 11, true);
        trackText.setSingleLine(true);
        trackText.setEllipsize(android.text.TextUtils.TruncateAt.END);
        music.addView(trackText, new LinearLayout.LayoutParams(0, dp(52), 1));
        music.addView(play, new LinearLayout.LayoutParams(dp(76), dp(52)));
        LinearLayout.LayoutParams nextParams = new LinearLayout.LayoutParams(dp(56), dp(52));
        nextParams.leftMargin = dp(6);
        music.addView(next, nextParams);
        // Compact music control: hidden panel until the rider asks for it.
        // It no longer obscures Google's bottom ETA or any maneuver banner.
        Button closeMusic = control("✕");
        closeMusic.setContentDescription("Müzik denetimini küçült");
        closeMusic.setOnClickListener(v -> {
            music.setVisibility(View.GONE);
            musicFab.setVisibility(View.VISIBLE);
        });
        music.addView(closeMusic, new LinearLayout.LayoutParams(dp(52), dp(52)));
        FrameLayout.LayoutParams musicParams =
                new FrameLayout.LayoutParams(dp(320), dp(64), Gravity.CENTER_VERTICAL | Gravity.END);
        musicParams.setMargins(0, 0, dp(12), 0);
        root.addView(music, musicParams);
        music.setVisibility(View.GONE);
        musicPanel = music;
        musicToggle = play;
        musicFab = control("♫");
        musicFab.setTextSize(26);
        musicFab.setContentDescription("Müzik kontrolünü aç");
        musicFab.setBackground(shape(0xEC151D2B, 32));
        musicFab.setOnClickListener(v -> {
            musicFab.setVisibility(View.GONE);
            music.setVisibility(View.VISIBLE);
            refreshMusic();
        });
        FrameLayout.LayoutParams musicFabParams =
                new FrameLayout.LayoutParams(dp(64), dp(64), Gravity.CENTER_VERTICAL | Gravity.END);
        musicFabParams.setMargins(0, 0, dp(12), 0);
        root.addView(musicFab, musicFabParams);

        // One-tap ride markers on the left edge (same types as the web app):
        // no menu while riding; "Diğer" opens the full list. Saved here and
        // picked up by the WebView (AndroidBridge.takeNativeMarks) later.
        LinearLayout quick = new LinearLayout(this);
        quick.setOrientation(LinearLayout.VERTICAL);
        String[][] quickTypes={{"bad_road","Kötü asfalt","Kötü","#DC2626"},{"danger","Tehlike","Tehlike","#D97706"},{"rest","Mola yeri","Mola","#EA580C"}};
        for(String[] q:quickTypes){
            Button b=control(q[2]);
            b.setTextSize(13);
            b.setTypeface(Typeface.DEFAULT_BOLD);
            GradientDrawable bg=shape(Color.parseColor(q[3]),18);
            bg.setStroke(dp(2),Color.WHITE);
            b.setBackground(bg);
            b.setContentDescription(q[1]+" işaretle");
            b.setOnClickListener(v -> saveMark(q[0],q[1]));
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(dp(64),dp(64));
            lp.setMargins(0,0,0,dp(10));
            quick.addView(b,lp);
        }
        Button more=control("＋📍");
        more.setTextSize(15);
        more.setBackground(shape(0xEC151D2B,18));
        more.setContentDescription("Diğer işaretler: iyi asfalt, su, WC, yer işaretle");
        more.setOnClickListener(v -> showMarkPicker());
        quick.addView(more,new LinearLayout.LayoutParams(dp(64),dp(64)));
        FrameLayout.LayoutParams quickParams =
                new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_VERTICAL | Gravity.START);
        quickParams.setMargins(dp(10), 0, 0, 0);
        root.addView(quick, quickParams);

        totalText = label("Rota hesaplanıyor…", 18, true);
        totalText.setSingleLine(true);
        totalText.setEllipsize(android.text.TextUtils.TruncateAt.END);
        totalText.setGravity(Gravity.CENTER);
        totalText.setBackground(shape(0xF0121821, 20));
        totalText.setPadding(dp(16), 0, dp(76), 0);
        totalText.setContentDescription("Kalan toplam mesafe, süre ve varış saati");
        FrameLayout.LayoutParams totalParams =
                new FrameLayout.LayoutParams(-1, dp(64), Gravity.BOTTOM);
        totalParams.setMargins(dp(10), 0, dp(10), dp(10));
        root.addView(totalText, totalParams);
        back.bringToFront();
        setContentView(root);
        navigationView.onCreate(saved);
        // Google's ETA card counts only to the NEXT stop on multi-stop tours.
        // Our bar shows the whole remaining route instead.
        navigationView.setEtaCardEnabled(false);
        navigationView.setHeaderEnabled(true);

        double lat = getIntent().getDoubleExtra("destination_lat", Double.NaN);
        double lng = getIntent().getDoubleExtra("destination_lng", Double.NaN);
        if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) {
            message("Geçersiz hedef konumu. GaZonRide'a dönüp hedef seç.");
            return;
        }

        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION_REQUEST);
        } else {
            initializeNavigator();
        }
    }

    private void initializeNavigator() {
        if (closed) return;
        message("Google Navigation SDK bağlantısı kuruluyor…");
        try {
            NavigationApi.getNavigator(this, new NavigationApi.NavigatorListener() {
                @Override public void onNavigatorReady(Navigator ready) {
                    if (closed) return;
                    navigator = ready;
                    try {
                        navigationView.getMapAsync(map -> {
                            // Keep the rider arrow ABOVE our bottom bar: map padding
                            // moves the follow-camera centre (and puck) upwards.
                            map.setPadding(0, 0, 0, dp(110));
                            map.followMyLocation(GoogleMap.CameraPerspective.TILTED);
                        });
                    } catch (Exception ignored) { }
                    planNativeRoute();
                }
                @Override public void onError(@NavigationApi.ErrorCode int code) {
                    if (!closed) message(navigationError(code));
                }
            });
        } catch (Exception e) {
            message("Google Navigasyon başlatılamadı: " + e.getClass().getSimpleName());
        }
    }

    private void planNativeRoute() {
        if (navigator == null || closed) return;
        double lat = getIntent().getDoubleExtra("destination_lat", Double.NaN);
        double lng = getIntent().getDoubleExtra("destination_lng", Double.NaN);
        String title = getIntent().getStringExtra("destination_title");
        if (title == null || title.isEmpty()) title = "Hedef";
        try {
            String routeJson = getIntent().getStringExtra("route_waypoints");
            if (routeJson == null) routeJson = getIntent().getStringExtra("tour_waypoints");
            List<Waypoint> routeStops = new ArrayList<>();
            if (routeJson != null) {
                JSONArray stops = new JSONArray(routeJson);
                if (stops.length()<1 || stops.length()>8)
                    throw new IllegalArgumentException("Invalid waypoint count");
                for (int i=0;i<stops.length();i++) {
                    JSONObject p = stops.getJSONObject(i);
                    double stopLat=p.getDouble("lat"),stopLon=p.getDouble("lon");
                    if (!Double.isFinite(stopLat)||!Double.isFinite(stopLon)
                            ||Math.abs(stopLat)>90||Math.abs(stopLon)>180)
                        throw new IllegalArgumentException("Invalid waypoint coordinate");
                    String name=i==stops.length()-1?title:("Güzergâh noktası "+(i+1));
                    routeStops.add(Waypoint.builder().setLatLng(stopLat,stopLon)
                            .setTitle(name).build());
                }
            }
            tourStopsRemaining=routeStops.size();
            Waypoint waypoint = Waypoint.builder()
                    .setLatLng(lat, lng).setTitle(title).build();
            RoutingOptions options = new RoutingOptions();
            // TWO_WHEELER is not available in every country. For Turkey,
            // use Google driving routes rather than promising motorcycle-only roads.
            options.travelMode(RoutingOptions.TravelMode.DRIVING);
            options.avoidTolls(getIntent().getBooleanExtra("avoid_tolls",false));
            options.avoidHighways(getIntent().getBooleanExtra("avoid_highways",false));
            message("Google güzergâhı hesaplanıyor…");
            if (routeStops.isEmpty()) routeStops.add(waypoint);
            // Preferred: the exact road previewed in GaZonRide (Routes API
            // token for the identical stop list). Otherwise Google computes
            // a route through the same stops.
            String token = getIntent().getStringExtra("route_token");
            ListenableResultFuture<Navigator.RouteStatus> request = null;
            if (routeNote.isEmpty()) {
                String note = getIntent().getStringExtra("route_token_note");
                routeNote = note == null ? "" : note;
            }
            if (token != null && !token.isEmpty()) request = setDestinationsWithToken(routeStops, token);
            exactRoute = request != null;
            if (request == null) request = navigator.setDestinations(routeStops, options);
            request.setOnResultListener(code -> runOnUiThread(() -> {
                if (closed || navigator == null) return;
                if (code != Navigator.RouteStatus.OK) {
                    if (exactRoute) {
                        // Token expired or the rider moved: same stops, Google route.
                        routeNote = "token reddedildi (" + code + ")";
                        getIntent().removeExtra("route_token");
                        exactRoute = false;
                        planNativeRoute();
                        return;
                    }
                    message(routeError(code));
                    return;
                }
                try {
                    // SDK 7.3 uses integer audio flags (the newer
                    // AudioGuidanceSettings API was added only in SDK 7.8).
                    navigator.setAudioGuidance(
                            Navigator.AudioGuidance.VOICE_ALERTS_AND_GUIDANCE
                            | Navigator.AudioGuidance.BLUETOOTH_AUDIO
                            | Navigator.AudioGuidance.VIBRATION);
                    progressListener = () -> updateProgress();
                    navigator.addRemainingTimeOrDistanceChangedListener(15, 25, progressListener);
                    arrivalListener = event -> runOnUiThread(() -> {
                        if (closed || navigator == null) return;
                        if (!event.isFinalDestination()) {
                            tourStopsRemaining--;
                            try {
                                // Route corners are pass-through points for the
                                // rider: continue silently, keep the map clear.
                                navigator.continueToNextDestination();
                                navigator.startGuidance();
                            } catch (Exception e) {
                                message("Sonraki tur durağı açılamadı: "+e.getClass().getSimpleName());
                            }
                        } else {
                            tourStopsRemaining = 0;
                            message("Hedefe ulaştın. Güvenli bir yerde navigasyonu bitirebilirsin.");
                            if (progressText != null) progressText.setText("Varış noktasına ulaştın");
                        }
                    });
                    navigator.addArrivalListener(arrivalListener);
                    navigator.startGuidance();
                    routeStarted = true;
                    updateProgress();
                    message("Google canlı yönlendirme ve sesli komutlar aktif.");
                    // Visible confirmation: does guidance follow the previewed road?
                    Toast.makeText(this, exactRoute
                            ? "✓ Seçtiğin rota birebir aktarıldı"
                            : "Google rotayı kendisi hesapladı" + (routeNote.isEmpty() ? "" : " · " + routeNote),
                            Toast.LENGTH_LONG).show();
                } catch (Exception error) {
                    message("Yol tarifi başlatılamadı: " + error.getClass().getSimpleName());
                }
            }));
        } catch (Exception error) {
            message("Hedef işlenemedi: " + error.getClass().getSimpleName());
        }
    }

    /** Exact previewed road: Routes API token for the identical stop list. */
    private ListenableResultFuture<Navigator.RouteStatus> setDestinationsWithToken(
            List<Waypoint> stops, String token) {
        try {
            CustomRoutesOptions custom = CustomRoutesOptions.builder()
                    .setRouteToken(token)
                    .setTravelMode(RoutingOptions.TravelMode.DRIVING)
                    .build();
            return navigator.setDestinations(stops, custom);
        } catch (Exception e) {
            routeNote = "SDK: " + e.getClass().getSimpleName();
            return null;
        }
    }

    /** Remaining distance/time to the FINAL stop (whole tour, not next corner). */
    private void updateProgress() {
        if (closed || navigator == null || totalText == null) return;
        try {
            TimeAndDistance result = null;
            List<TimeAndDistance> list = navigator.getTimeAndDistanceList();
            if (list != null && !list.isEmpty()) result = list.get(list.size() - 1);
            if (result == null) result = navigator.getCurrentTimeAndDistance();
            if (result == null) return;
            int meters = Math.max(0, result.getMeters());
            int seconds = Math.max(0, result.getSeconds());
            int minutes = (int) Math.ceil(seconds / 60d);
            java.util.Locale tr = java.util.Locale.forLanguageTag("tr-TR");
            String distance = meters >= 1000 ? String.format(tr, "%.1f km", meters / 1000d) : meters + " m";
            String duration = minutes >= 60 ? (minutes / 60) + " sa " + (minutes % 60) + " dk" : minutes + " dk";
            String eta = new java.text.SimpleDateFormat("HH:mm", tr)
                    .format(new java.util.Date(System.currentTimeMillis() + seconds * 1000L));
            totalText.setText(distance + " · " + duration + " · " + eta);
            if (progressText != null) progressText.setText(distance + " · " + duration);
        } catch (Exception ignored) {}
    }

    private void refreshMusic() {
        if (musicController == null || trackText == null) return;
        try {
            JSONObject state = new JSONObject(musicController.status());
            boolean session = state.optBoolean("hasSession",false);
            String song = state.optString("title","");
            String provider = state.optString("provider","");
            trackText.setText(session
                    ? (song.isEmpty() ? provider : song)
                    : "Müzik · Spotify / YouTube");
            if (musicToggle != null) musicToggle.setEnabled(session);
        } catch (Exception ignored) {}
    }

    private static final String[][] MARK_TYPES={
            {"good_road","İyi asfalt"},{"bad_road","Kötü asfalt"},{"danger","Tehlike"},
            {"rest","Mola yeri"},{"water","Su"},{"wc","WC"},{"pin","Yer işaretle"}};
    private void showMarkPicker(){
        String[] labels=new String[MARK_TYPES.length];
        for(int i=0;i<MARK_TYPES.length;i++)labels[i]=MARK_TYPES[i][1];
        new android.app.AlertDialog.Builder(this)
                .setTitle("Buraya işaret bırak")
                .setItems(labels,(d,which)->saveMark(MARK_TYPES[which][0],MARK_TYPES[which][1]))
                .setNegativeButton("Vazgeç",null)
                .show();
    }
    private android.location.Location freshestLocation(){
        android.location.Location best=null;
        try{
            android.location.LocationManager lm=(android.location.LocationManager)getSystemService(LOCATION_SERVICE);
            for(String p:lm.getProviders(true)){
                android.location.Location l=lm.getLastKnownLocation(p);
                if(l!=null&&(best==null||l.getTime()>best.getTime()))best=l;
            }
        }catch(SecurityException ignored){}
        return best;
    }
    private void saveMark(String type,String label){
        android.location.Location l=freshestLocation();
        if(l==null||System.currentTimeMillis()-l.getTime()>120000){
            Toast.makeText(this,"Konum henüz yok · GPS bekleniyor",Toast.LENGTH_SHORT).show();
            return;
        }
        try{
            android.content.SharedPreferences prefs=getSharedPreferences("gazonride",MODE_PRIVATE);
            JSONArray a=new JSONArray(prefs.getString("native_marks","[]"));
            JSONObject m=new JSONObject();
            long now=System.currentTimeMillis();
            m.put("id","n"+Long.toString(now,36));
            m.put("type",type);m.put("lat",l.getLatitude());m.put("lng",l.getLongitude());m.put("ts",now);
            a.put(m);
            prefs.edit().putString("native_marks",a.toString()).apply();
            Toast.makeText(this,label+" işaretlendi",Toast.LENGTH_SHORT).show();
        }catch(Exception e){
            Toast.makeText(this,"İşaret kaydedilemedi",Toast.LENGTH_SHORT).show();
        }
    }

    private void exitNavigation() {
        if (closed) return;
        closed = true;
        ui.removeCallbacks(musicRefresh);
        if (navigator != null) {
            try {
                if (progressListener != null)
                    navigator.removeRemainingTimeOrDistanceChangedListener(progressListener);
                if (arrivalListener != null) navigator.removeArrivalListener(arrivalListener);
                navigator.stopGuidance();
                navigator.clearDestinations();
            } catch (Exception ignored) {}
        }
        // Never stop the ongoing GaZonRide motorcycle ride on an accidental
        // navigation exit. The user can finish their ride on the main screen.
        finish();
    }

    @Override public void onBackPressed() { exitNavigation(); }
    @Override protected void onStart() {
        super.onStart();
        if (navigationView != null) navigationView.onStart();
    }
    @Override protected void onResume() {
        super.onResume();
        if (navigationView != null) navigationView.onResume();
        ui.removeCallbacks(musicRefresh);
        ui.post(musicRefresh);
    }
    @Override protected void onPause() {
        ui.removeCallbacks(musicRefresh);
        if (navigationView != null) navigationView.onPause();
        super.onPause();
    }
    @Override protected void onStop() {
        if (navigationView != null) navigationView.onStop();
        super.onStop();
    }
    @Override protected void onDestroy() {
        ui.removeCallbacks(musicRefresh);
        if (!closed) exitNavigation();
        if (musicController != null) musicController.release();
        if (navigationView != null) navigationView.onDestroy();
        super.onDestroy();
    }
    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        if (navigationView != null) navigationView.onConfigurationChanged(config);
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        if (navigationView != null) navigationView.onSaveInstanceState(out);
        super.onSaveInstanceState(out);
    }
    @Override public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (navigationView != null) navigationView.onTrimMemory(level);
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code == LOCATION_REQUEST) {
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED)
                initializeNavigator();
            else message("Konum izni verilmeden navigasyon başlatılamaz. Uygulama Ayarları > İzinler > Konum bölümünden hassas konuma izin ver.");
        }
    }
}
