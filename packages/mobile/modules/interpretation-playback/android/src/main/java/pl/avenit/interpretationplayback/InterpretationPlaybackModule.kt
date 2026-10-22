package pl.avenit.interpretationplayback

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Moduł JS „AvenitInterpretationPlayback” (Android): usługa pierwszoplanowa słuchania tłumaczenia
 * + „tyknięcia” co sekundę.
 *
 * Tyknięcia: React Native na Androidzie wstrzymuje timery JS (setTimeout/setInterval), gdy aktywność
 * jest w tle (ekran wygaszony) — usługa trzyma proces przy życiu, ale timery stoją. Zdarzenia natywne
 * docierają do JS normalnie, więc w trakcie słuchania wysyłamy onTick (Handler + PARTIAL_WAKE_LOCK
 * usługi), a JS odpala na nich zaległe timery (ping sygnalizacji LiveKit, ponawianie połączenia,
 * odpytywanie stanu) — src/features/interpretation/bgTimers.ts.
 */
class InterpretationPlaybackModule : Module() {
  private val handler = Handler(Looper.getMainLooper())

  @Volatile private var ticking = false

  private val tick = object : Runnable {
    override fun run() {
      if (!ticking) return
      emit(EVENT_TICK, mapOf("uptime" to SystemClock.elapsedRealtime().toDouble()))
      handler.postDelayed(this, TICK_MS)
    }
  }

  private fun emit(name: String, body: Map<String, Any?>) {
    try {
      sendEvent(name, body)
    } catch (e: Throwable) {
      // Runtime JS już nie istnieje (przeładowanie) — nie ma komu powiedzieć.
    }
  }

  private fun startTicking() {
    if (ticking) return
    ticking = true
    handler.removeCallbacks(tick)
    handler.postDelayed(tick, TICK_MS)
  }

  private fun stopTicking() {
    ticking = false
    handler.removeCallbacks(tick)
  }

  override fun definition() = ModuleDefinition {
    Name("AvenitInterpretationPlayback")

    Events(EVENT_STOP, EVENT_FAILED, EVENT_TICK)

    OnCreate {
      InterpretationPlaybackService.onStopRequested = { reason ->
        stopTicking()
        emit(EVENT_STOP, mapOf("reason" to reason))
      }
      InterpretationPlaybackService.onFailed = {
        stopTicking()
        emit(EVENT_FAILED, mapOf("reason" to "start_failed"))
      }
    }

    OnDestroy {
      // Przeładowanie / koniec runtime JS — nikt już nie słucha: usługa i blokady w dół.
      InterpretationPlaybackService.onStopRequested = null
      InterpretationPlaybackService.onFailed = null
      stopTicking()
      InterpretationPlaybackService.stop()
    }

    // true = usługa uruchomiona (albo już działała — wtedy tylko nowy tekst powiadomienia).
    Function("start") { title: String, text: String ->
      val context = appContext.reactContext
      val ok = if (context != null) InterpretationPlaybackService.start(context, title, text) else false
      if (ok) startTicking()
      ok
    }

    Function("stop") {
      stopTicking()
      InterpretationPlaybackService.stop()
    }

    Function("isRunning") {
      InterpretationPlaybackService.isRunning
    }
  }

  companion object {
    private const val EVENT_STOP = "onStopRequested"
    private const val EVENT_FAILED = "onFailed"
    private const val EVENT_TICK = "onTick"
    private const val TICK_MS = 1000L
  }
}
