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
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;

import com.google.android.gms.maps.GoogleMap;
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
    private TextView progressText;
    private TextView trackText;
    private Button musicToggle;
    private View musicPanel;
    private MusicController musicController;
    private boolean closed;
    private boolean routeStarted;
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
        button.setTextSize(12);
        button.setPadding(dp(8), 0, dp(8), 0);
        button.setBackground(shape(Color.rgb(35, 42, 55), 14));
        return button;
    }

    private void message(String text) {
        if (closed) return;
        runOnUiThread(() -> {
            if (statusText != null) statusText.setText(text);
        });
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(12, 18, 27));
        getWindow().setNavigationBarColor(Color.rgb(12, 18, 27));
        musicController = new MusicController(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(12, 18, 27));
        navigationView = new NavigationView(this);
        root.addView(navigationView, new FrameLayout.LayoutParams(-1, -1));

        // A compact close control stays on top of Google's own map, without
        // replacing or drawing a fake turn instruction card.
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(10), dp(4), dp(10), dp(4));
        top.setBackground(shape(0xEE141C29, 16));
        FrameLayout.LayoutParams topParams =
                new FrameLayout.LayoutParams(-2, dp(52), Gravity.TOP | Gravity.END);
        topParams.setMargins(dp(14), dp(16), dp(12), 0);
        TextView brand = label("GaZonRide", 12, true);
        brand.setPadding(dp(4), 0, dp(10), 0);
        top.addView(brand);
        Button back = control("✕ Bitir");
        back.setContentDescription("Navigasyonu bitir ve GaZonRide'a dön");
        back.setOnClickListener(v -> exitNavigation());
        top.addView(back, new LinearLayout.LayoutParams(dp(80), dp(40)));
        root.addView(top, topParams);

        LinearLayout footer = new LinearLayout(this);
        footer.setPadding(dp(10), dp(8), dp(10), dp(8));
        footer.setOrientation(LinearLayout.VERTICAL);
        footer.setBackground(shape(0xF0202936, 14));
        progressText = label("Google navigasyon hazırlanıyor", 14, true);
        statusText = label("GPS ve Google rota hizmeti bekleniyor", 11, false);
        statusText.setTextColor(0xFFC7D3E1);
        footer.addView(progressText);
        footer.addView(statusText);
        FrameLayout.LayoutParams footerParams =
                new FrameLayout.LayoutParams(-1, dp(68), Gravity.BOTTOM);
        footerParams.setMargins(dp(12), 0, dp(12), dp(110));
        root.addView(footer, footerParams);

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
        music.addView(trackText, new LinearLayout.LayoutParams(0, dp(40), 1));
        music.addView(play, new LinearLayout.LayoutParams(dp(68), dp(40)));
        LinearLayout.LayoutParams nextParams = new LinearLayout.LayoutParams(dp(45), dp(40));
        nextParams.leftMargin = dp(6);
        music.addView(next, nextParams);
        FrameLayout.LayoutParams musicParams =
                new FrameLayout.LayoutParams(-1, dp(54), Gravity.BOTTOM);
        musicParams.setMargins(dp(12), 0, dp(12), dp(48));
        root.addView(music, musicParams);
        musicPanel = music;
        musicToggle = play;

        setContentView(root);
        navigationView.onCreate(saved);
        navigationView.setEtaCardEnabled(true);
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
                        navigationView.getMapAsync(map ->
                                map.followMyLocation(GoogleMap.CameraPerspective.TILTED));
                    } catch (Exception ignored) { }
                    planNativeRoute();
                }
                @Override public void onError(@NavigationApi.ErrorCode int code) {
                    message(code == NavigationApi.ErrorCode.NOT_AUTHORIZED
                            ? "Navigation anahtarı yetkisiz. Android anahtar ayarlarını kontrol et."
                            : code == NavigationApi.ErrorCode.TERMS_NOT_ACCEPTED
                            ? "Google Navigasyon koşullarını kabul etmelisin."
                            : code == NavigationApi.ErrorCode.NETWORK_ERROR
                            ? "Google Navigasyon için internet bağlantısı gerekli."
                            : "Google navigasyon başlatılamadı (hata " + code + ").");
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
            Waypoint waypoint = Waypoint.builder()
                    .setLatLng(lat, lng).setTitle(title).build();
            RoutingOptions options = new RoutingOptions();
            // TWO_WHEELER is not available in every country. For Turkey,
            // use Google driving routes rather than promising motorcycle-only roads.
            options.travelMode(RoutingOptions.TravelMode.DRIVING);
            options.avoidTolls(getIntent().getBooleanExtra("avoid_tolls",false));
            options.avoidHighways(getIntent().getBooleanExtra("avoid_highways",false));
            message("Google güzergâhı hesaplanıyor…");
            ListenableResultFuture<Navigator.RouteStatus> request =
                    navigator.setDestination(waypoint, options);
            request.setOnResultListener(code -> runOnUiThread(() -> {
                if (closed || navigator == null) return;
                if (code != Navigator.RouteStatus.OK) {
                    message("Google rota oluşturamadı: " + code);
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
                        message("Hedefe ulaştın. Güvenli bir yerde navigasyonu bitirebilirsin.");
                        progressText.setText("Varış noktasına ulaştın");
                    });
                    navigator.addArrivalListener(arrivalListener);
                    navigator.startGuidance();
                    routeStarted = true;
                    updateProgress();
                    message("Google canlı yönlendirme ve sesli komutlar aktif.");
                } catch (Exception error) {
                    message("Yol tarifi başlatılamadı: " + error.getClass().getSimpleName());
                }
            }));
        } catch (Exception error) {
            message("Hedef işlenemedi: " + error.getClass().getSimpleName());
        }
    }

    private void updateProgress() {
        if (closed || navigator == null || progressText == null) return;
        try {
            TimeAndDistance result = navigator.getCurrentTimeAndDistance();
            if (result == null) return;
            int meters = Math.max(0, result.getMeters());
            int minutes = (int)Math.ceil(Math.max(0,result.getSeconds())/60d);
            String distance = meters >= 1000
                    ? String.format(java.util.Locale.forLanguageTag("tr-TR"),
                            "%.1f km", meters/1000d)
                    : meters + " m";
            String duration = minutes>=60
                    ? (minutes/60) + " sa " + (minutes%60) + " dk"
                    : minutes + " dk";
            progressText.setText(distance + " · " + duration);
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
            else message("Konum izni verilmeden navigasyon başlatılamaz.");
        }
    }
}
