package com.gazonride.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import org.json.JSONObject;

import java.util.List;

/**
 * Read-only access to currently active music media sessions, plus user-initiated
 * playback commands. Never reads notification text or uploads music metadata.
 * Navigation narration uses transient audio focus; STREAM_MUSIC volume is never
 * changed, so headset/phone volume is not modified.
 */
public final class MusicController {
    private static final String SPOTIFY = "com.spotify.music";
    private static final String YTM = "com.google.android.apps.youtube.music";
    private final Activity activity;
    private final MediaSessionManager sessions;
    private final AudioManager audio;
    private final ComponentName listener;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AudioFocusRequest focusRequest;
    private boolean legacyFocus;
    private boolean holdingFocus;
    private int speechSerial;
    private Runnable safetyRelease;
    private String preferredPackage = "";
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        // Navigation focus is released on narration end, or by the safety timeout.
    };

    public MusicController(Activity activity) {
        this.activity = activity;
        sessions = (MediaSessionManager)activity.getSystemService(Context.MEDIA_SESSION_SERVICE);
        audio = (AudioManager)activity.getSystemService(Context.AUDIO_SERVICE);
        listener = new ComponentName(activity, MusicNotificationListener.class);
        preferredPackage = activity.getPreferences(Context.MODE_PRIVATE).getString("music_preferred_package", "");
    }

    private static boolean supported(String name) {
        return SPOTIFY.equals(name) || YTM.equals(name);
    }

    public boolean hasAccess() {
        try {
            if (Build.VERSION.SDK_INT >= 27) {
                NotificationManager nm = (NotificationManager)activity.getSystemService(Context.NOTIFICATION_SERVICE);
                return nm != null && nm.isNotificationListenerAccessGranted(listener);
            }
            String enabled = Settings.Secure.getString(activity.getContentResolver(), "enabled_notification_listeners");
            if (enabled == null) return false;
            for (String entry : enabled.split(":")) {
                ComponentName c = ComponentName.unflattenFromString(entry);
                if (listener.equals(c)) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private MediaController currentController() {
        if (!hasAccess() || sessions == null) return null;
        try {
            List<MediaController> found = sessions.getActiveSessions(listener);
            MediaController fallback = null;
            MediaController preferred = null;
            for (MediaController media : found) {
                if (media == null || !supported(media.getPackageName())) continue;
                if (fallback == null) fallback = media;
                if (media.getPackageName().equals(preferredPackage)) preferred = media;
                PlaybackState state = media.getPlaybackState();
                if (state != null && (state.getState() == PlaybackState.STATE_PLAYING ||
                                      state.getState() == PlaybackState.STATE_BUFFERING)) {
                    return media;
                }
            }
            return preferred != null ? preferred : fallback;
        } catch (SecurityException ignored) {
            return null;
        } catch (Exception ignored) {
            return null;
        }
    }

    public String status() {
        JSONObject out = new JSONObject();
        try {
            boolean granted = hasAccess();
            out.put("native", true);
            out.put("access", granted);
            out.put("duckEnabled", isDuckingEnabled());
            out.put("ducking", holdingFocus);
            out.put("hasSession", false);
            out.put("playing", false);
            out.put("title", "");
            out.put("artist", "");
            out.put("provider", "");
            out.put("package", "");
            out.put("duration", 0);
            out.put("position", 0);
            MediaController player = currentController();
            if (player == null) return out.toString();
            String pkg = player.getPackageName();
            out.put("hasSession", true);
            out.put("provider", SPOTIFY.equals(pkg) ? "Spotify" : "YouTube Music");
            out.put("package", pkg);
            MediaMetadata meta = player.getMetadata();
            if (meta != null) {
                String title = meta.getString(MediaMetadata.METADATA_KEY_TITLE);
                if (title == null || title.isEmpty()) title = meta.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
                String artist = meta.getString(MediaMetadata.METADATA_KEY_ARTIST);
                if (artist == null || artist.isEmpty()) artist = meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                out.put("title", title == null ? "" : title);
                out.put("artist", artist == null ? "" : artist);
                out.put("duration", Math.max(0L, meta.getLong(MediaMetadata.METADATA_KEY_DURATION)));
            }
            PlaybackState state = player.getPlaybackState();
            if (state != null) {
                out.put("playing", state.getState() == PlaybackState.STATE_PLAYING);
                out.put("position", Math.max(0L, state.getPosition()));
            }
        } catch (Exception ignored) {}
        return out.toString();
    }

    public void command(String command) {
        MediaController controller = currentController();
        if (controller == null || command == null) return;
        try {
            MediaController.TransportControls transport = controller.getTransportControls();
            PlaybackState state = controller.getPlaybackState();
            switch (command) {
                case "toggle":
                    if (state != null && state.getState() == PlaybackState.STATE_PLAYING) transport.pause();
                    else transport.play();
                    break;
                case "play": transport.play(); break;
                case "pause": transport.pause(); break;
                case "next": transport.skipToNext(); break;
                case "previous": transport.skipToPrevious(); break;
                default: return;
            }
            preferredPackage = controller.getPackageName();
            activity.getPreferences(Context.MODE_PRIVATE).edit()
                    .putString("music_preferred_package", preferredPackage).apply();
        } catch (Exception ignored) {}
    }

    public void requestAccess() {
        handler.post(() -> {
            try {
                Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
                activity.startActivity(intent);
            } catch (Exception ignored) {}
        });
    }

    public void openPlayer(String selected) {
        String pkg = "youtube".equals(selected) ? YTM : "spotify".equals(selected) ? SPOTIFY : "";
        if (pkg.isEmpty()) return;
        preferredPackage = pkg;
        activity.getPreferences(Context.MODE_PRIVATE).edit().putString("music_preferred_package", pkg).apply();
        handler.post(() -> {
            try {
                PackageManager pm = activity.getPackageManager();
                Intent launch = pm.getLaunchIntentForPackage(pkg);
                if (launch == null) {
                    launch = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("market://details?id=" + pkg));
                }
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(launch);
            } catch (Exception ex) {
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW,
                            android.net.Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
                } catch (Exception ignored) {}
            }
        });
    }

    public boolean isDuckingEnabled() {
        return activity.getPreferences(Context.MODE_PRIVATE).getBoolean("music_duck_narration", true);
    }

    public void setDuckingEnabled(boolean enabled) {
        activity.getPreferences(Context.MODE_PRIVATE).edit().putBoolean("music_duck_narration", enabled).apply();
        if (!enabled) handler.post(this::abandonFocus);
    }

    /**
     * Briefly requests navigation audio focus. Android requests that Spotify,
     * YouTube Music and other compliant players duck automatically.
     * No manual volume changes; other apps may ignore the request.
     */
    public void beginNarration() {
        if (!isDuckingEnabled()) return;
        handler.post(() -> {
            if (!isDuckingEnabled() || audio == null) return;
            abandonFocus();
            int result;
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    AudioAttributes attrs = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build();
                    focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                            .setAudioAttributes(attrs)
                            .setOnAudioFocusChangeListener(focusListener)
                            .setWillPauseWhenDucked(false)
                            .build();
                    result = audio.requestAudioFocus(focusRequest);
                } else {
                    legacyFocus = true;
                    result = audio.requestAudioFocus(focusListener,
                            AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
                }
                holdingFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
            } catch (Exception ignored) {
                holdingFocus = false;
            }
            final int serial = ++speechSerial;
            safetyRelease = () -> { if (serial == speechSerial) abandonFocus(); };
            handler.postDelayed(safetyRelease, 12000L);
        });
    }

    public void endNarration() {
        handler.post(this::abandonFocus);
    }

    private void abandonFocus() {
        speechSerial++;
        if (safetyRelease != null) {
            handler.removeCallbacks(safetyRelease);
            safetyRelease = null;
        }
        if (audio == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) {
                audio.abandonAudioFocusRequest(focusRequest);
                focusRequest = null;
            } else if (legacyFocus) {
                audio.abandonAudioFocus(focusListener);
                legacyFocus = false;
            }
        } catch (Exception ignored) {}
        holdingFocus = false;
    }

    public void release() {
        handler.post(this::abandonFocus);
    }
}
