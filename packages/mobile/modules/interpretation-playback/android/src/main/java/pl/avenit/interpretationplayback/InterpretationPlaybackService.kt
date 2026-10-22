package pl.avenit.interpretationplayback

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Usługa pierwszoplanowa na czas słuchania tłumaczenia na żywo (tryb „listen”: mediaPlayback)
 * albo zmiany tłumacza w konsoli (tryb „console”: mediaPlayback + microphone — bez typu microphone
 * Android 11+ odcina mikrofon apce w tle, a 14+ wymaga FOREGROUND_SERVICE_MICROPHONE i przyznanego
 * RECORD_AUDIO PRZED startForeground; start tylko z apki na wierzchu — dotknięcie „Dołącz”).
 *
 * Bez niej Android przy wygaszonym ekranie / apce w tle usypia proces (i Wi-Fi), a dźwięk WebRTC
 * się urywa. Usługa:
 *  - pokazuje stałe powiadomienie „Słuchasz tłumaczenia — …” (dotknięcie wraca do aplikacji,
 *    przycisk „Zatrzymaj” kończy słuchanie — moduł dostaje o tym zdarzenie i przekazuje je do JS);
 *  - trzyma PARTIAL_WAKE_LOCK (procesor) i WifiLock (Wi-Fi nie przechodzi w oszczędzanie);
 *  - zwalnia wszystko przy stop() z JS, przy „Zatrzymaj”, po usunięciu apki z ostatnich (onTaskRemoved)
 *    i w onDestroy.
 *
 * Wszystkie operacje na usłudze wykonujemy na wątku głównym (MAIN).
 */
class InterpretationPlaybackService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private val wifiLocks = mutableListOf<WifiManager.WifiLock>()
  private var inForeground = false
  private var lastStartId = 0

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    createChannel(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    if (intent?.action == ACTION_STOP) {
      // „Zatrzymaj” w powiadomieniu: najpierw JS (rozłącza słuchacza), potem koniec usługi.
      wanted = false
      notifyStop(REASON_NOTIFICATION)
      shutdown()
      return START_NOT_STICKY
    }
    // Uruchomienie przez startForegroundService — startForeground trzeba wywołać zawsze (umowa
    // systemu), nawet gdy w międzyczasie przyszło stop(); wtedy od razu kończymy.
    if (!enterForeground()) {
      wanted = false
      notifyFailed()
      shutdown()
      return START_NOT_STICKY
    }
    if (!wanted) {
      shutdown()
      return START_NOT_STICKY
    }
    acquireLocks()
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Apka zamknięta z listy ostatnich — słuchanie się kończy (jak wyjście z ekranu słuchacza).
    wanted = false
    notifyStop(REASON_TASK_REMOVED)
    shutdown()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    releaseLocks()
    if (inForeground) {
      stopForegroundCompat()
    }
    if (instance === this) instance = null
    super.onDestroy()
  }

  private fun enterForeground(): Boolean {
    val notification = buildNotification(this, title, text, mode)
    val console = mode == MODE_CONSOLE
    return try {
      startForegroundTyped(notification, console)
      inForeground = true
      true
    } catch (e: Exception) {
      // Android 12+: ForegroundServiceStartNotAllowedException (start z tła), 14+: SecurityException
      // (brak uprawnienia typu / RECORD_AUDIO). JS wraca wtedy do trybu „nie wyłączaj ekranu”.
      Log.w(TAG, "startForeground failed (console=$console)", e)
      if (console) {
        // Konsola bez typu microphone: i tak musimy wejść na pierwszy plan (umowa
        // startForegroundService), więc próbujemy samego mediaPlayback — odsłuch gra w tle,
        // a JS dostaje onFailed i trzyma ekran włączony (mikrofon w tle nie jest pewny).
        try {
          startForegroundTyped(notification, false)
          inForeground = true
          notifyFailed()
          return true
        } catch (e2: Exception) {
          Log.w(TAG, "startForeground media fallback failed", e2)
        }
      }
      inForeground = false
      false
    }
  }

  private fun startForegroundTyped(notification: Notification, console: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && console) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      )
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  /** Zmiana trybu na działającej usłudze (słuchanie ↔ konsola) — nowy typ usługi i powiadomienie. */
  fun switchMode() {
    if (!enterForeground()) {
      wanted = false
      notifyFailed()
      shutdown()
    }
  }

  /** Nowy tekst powiadomienia (stan słuchania) — bez ponownego startu usługi. */
  fun refreshNotification() {
    if (!inForeground) return
    try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIFICATION_ID, buildNotification(this, title, text, mode))
    } catch (e: Exception) {
      // Android 13+ bez zgody na powiadomienia — usługa działa dalej, powiadomienie ukryte.
      Log.w(TAG, "notify failed", e)
    }
  }

  fun shutdown() {
    releaseLocks()
    if (inForeground) {
      stopForegroundCompat()
    }
    // stopSelf(startId): gdy w międzyczasie przyszło nowe „start” (szybkie Zatrzymaj → Słuchaj),
    // usługa zostaje — obsłuży je kolejne onStartCommand.
    stopSelf(lastStartId)
  }

  private fun stopForegroundCompat() {
    inForeground = false
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(Service.STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
    } catch (e: Exception) {
      Log.w(TAG, "stopForeground failed", e)
    }
  }

  private fun acquireLocks() {
    try {
      if (wakeLock == null) {
        val pm = applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Avenit:interpretation").apply {
          setReferenceCounted(false)
          // Bezpiecznik: nabożeństwo nie trwa dłużej niż kilka godzin.
          acquire(WAKE_LOCK_TIMEOUT_MS)
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "wake lock failed", e)
    }
    try {
      if (wifiLocks.isEmpty()) {
        val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        if (wm != null) {
          // HIGH_PERF — jak media3 (ExoPlayer) przy odtwarzaniu strumienia z wygaszonym ekranem;
          // LOW_LATENCY (Android 10+) — mniejsze opóźnienia, gdy ekran jest włączony.
          @Suppress("DEPRECATION")
          val modes = mutableListOf(WifiManager.WIFI_MODE_FULL_HIGH_PERF)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            modes.add(WifiManager.WIFI_MODE_FULL_LOW_LATENCY)
          }
          for (mode in modes) {
            val lock = wm.createWifiLock(mode, "Avenit:interpretation:$mode")
            lock.setReferenceCounted(false)
            lock.acquire()
            wifiLocks.add(lock)
          }
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "wifi lock failed", e)
    }
  }

  private fun releaseLocks() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (e: Exception) {
      Log.w(TAG, "wake lock release failed", e)
    }
    wakeLock = null
    for (lock in wifiLocks) {
      try {
        if (lock.isHeld) lock.release()
      } catch (e: Exception) {
        Log.w(TAG, "wifi lock release failed", e)
      }
    }
    wifiLocks.clear()
  }

  companion object {
    private const val TAG = "AvenitInterpPlayback"
    const val CHANNEL_ID = "avenit_interpretation_live"
    private const val CHANNEL_NAME = "Tłumaczenie na żywo"
    private const val NOTIFICATION_ID = 41207
    private const val ACTION_STOP = "pl.avenit.interpretationplayback.action.STOP"
    private const val STOP_LABEL = "Zatrzymaj"
    private const val END_LABEL = "Zakończ"
    const val MODE_LISTEN = "listen"
    const val MODE_CONSOLE = "console"
    private const val WAKE_LOCK_TIMEOUT_MS = 6L * 60L * 60L * 1000L
    const val REASON_NOTIFICATION = "notification"
    const val REASON_TASK_REMOVED = "task_removed"

    private val main = Handler(Looper.getMainLooper())

    // Usługa żyje w tym samym procesie co moduł — wystarczą pola statyczne.
    @Volatile private var instance: InterpretationPlaybackService? = null
    @Volatile private var wanted = false
    @Volatile private var title = "Słuchasz tłumaczenia"
    @Volatile private var text = ""
    @Volatile private var mode = MODE_LISTEN

    /** Zdarzenia dla modułu (ustawia je InterpretationPlaybackModule). */
    @Volatile var onStopRequested: ((String) -> Unit)? = null
    @Volatile var onFailed: (() -> Unit)? = null

    val isRunning: Boolean
      get() = wanted

    /**
     * Start (albo — gdy już działa — tylko nowy tekst powiadomienia). Wywołuj, gdy użytkownik
     * zaczyna słuchać (apka na wierzchu): Android 12+ nie pozwala uruchomić usługi z tła.
     */
    fun start(context: Context, newTitle: String, newText: String, newMode: String = MODE_LISTEN): Boolean {
      title = newTitle
      text = newText
      val modeChanged = newMode != mode
      mode = newMode
      val running = instance
      if (wanted && running != null) {
        main.post {
          val svc = instance ?: return@post
          if (modeChanged) svc.switchMode() else svc.refreshNotification()
        }
        return true
      }
      wanted = true
      return try {
        val intent = Intent(context.applicationContext, InterpretationPlaybackService::class.java)
        ContextCompat.startForegroundService(context.applicationContext, intent)
        true
      } catch (e: Exception) {
        Log.w(TAG, "startForegroundService failed", e)
        wanted = false
        false
      }
    }

    fun stop() {
      wanted = false
      // Usługa jeszcze się tworzy — onStartCommand zobaczy wanted=false i zakończy ją po startForeground.
      main.post { instance?.shutdown() }
    }

    private fun notifyStop(reason: String) {
      try {
        onStopRequested?.invoke(reason)
      } catch (e: Exception) {
        Log.w(TAG, "stop listener failed", e)
      }
    }

    private fun notifyFailed() {
      try {
        onFailed?.invoke()
      } catch (e: Exception) {
        Log.w(TAG, "failed listener failed", e)
      }
    }

    private fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
        description = "Powiadomienie w trakcie słuchania tłumaczenia na żywo"
        setShowBadge(false)
        enableVibration(false)
        enableLights(false)
        setSound(null, null)
      }
      nm.createNotificationChannel(channel)
    }

    private fun resId(context: Context, name: String, type: String): Int =
      context.resources.getIdentifier(name, type, context.packageName)

    private fun buildNotification(context: Context, title: String, text: String, mode: String): Notification {
      // Dotknięcie = powrót do działającej aplikacji (ekran słuchacza jest na wierzchu stosu).
      // Celowo bez linku avenit://… — otworzyłby DRUGI ekran słuchacza (podwójny dźwięk).
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      }
      val contentIntent = launch?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      }
      val stopIntent = Intent(context, InterpretationPlaybackService::class.java).setAction(ACTION_STOP)
      val stopPending = PendingIntent.getService(
        context,
        1,
        stopIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      // Ikona powiadomień aplikacji (plugin expo-notifications: @drawable/notification_icon), zapas — ikona apki.
      val icon = resId(context, "notification_icon", "drawable").takeIf { it != 0 }
        ?: context.applicationInfo.icon.takeIf { it != 0 }
        ?: android.R.drawable.ic_media_play
      val colorRes = resId(context, "notification_icon_color", "color")
      val color = if (colorRes != 0) ContextCompat.getColor(context, colorRes) else Color.parseColor("#FFBE0B")

      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(icon)
        .setColor(color)
        .setContentTitle(title)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setShowWhen(false)
        .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .addAction(android.R.drawable.ic_media_pause, if (mode == MODE_CONSOLE) END_LABEL else STOP_LABEL, stopPending)
      if (text.isNotEmpty()) builder.setContentText(text)
      if (contentIntent != null) builder.setContentIntent(contentIntent)
      return builder.build()
    }
  }
}
