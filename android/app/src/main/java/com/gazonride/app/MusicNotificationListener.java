package com.gazonride.app;

import android.service.notification.NotificationListenerService;

/**
 * Permission anchor for MediaSessionManager.getActiveSessions().
 * GaZonRide does not inspect, persist, or transmit notification contents.
 * Session metadata is accessed directly only while the in-app music
 * controller is being used.
 */
public final class MusicNotificationListener extends NotificationListenerService {
}
