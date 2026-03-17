import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Send, X, Loader, Pause, Play } from 'lucide-react';

export default function AudioRecorder({ onSend, onCancel, disabled = false }) {
  const [isRecording, setIsRecording] = useState(true); // Automatycznie zaczynamy nagrywanie
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [visualizerData, setVisualizerData] = useState(new Array(20).fill(5));

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const streamRef = useRef(null);
  const audioPlayerRef = useRef(null);

  // Formatuj czas nagrywania
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Aktualizuj wizualizację
  const updateVisualizer = useCallback(() => {
    if (!analyserRef.current || !isRecording || isPaused) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Pobierz próbki dla wizualizacji (20 słupków)
    const samples = [];
    const step = Math.floor(dataArray.length / 20);
    for (let i = 0; i < 20; i++) {
      const value = dataArray[i * step];
      // Normalizuj do zakresu 5-40 (wysokość słupka)
      samples.push(Math.max(5, Math.min(40, value / 6)));
    }
    setVisualizerData(samples);

    animationRef.current = requestAnimationFrame(updateVisualizer);
  }, [isRecording, isPaused]);

  // Rozpocznij nagrywanie
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Ustawienie AudioContext dla wizualizacji
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Ustawienie MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start(100); // Zbieraj dane co 100ms
      setIsRecording(true);
      setRecordingTime(0);

      // Timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Rozpocznij wizualizację
      updateVisualizer();

    } catch (err) {
      console.error('Error starting recording:', err);
      alert('Nie można uzyskać dostępu do mikrofonu. Sprawdź uprawnienia przeglądarki.');
    }
  };

  // Zatrzymaj nagrywanie
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);

      // Zatrzymaj timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Zatrzymaj animację
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      // Zatrzymaj strumień
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Zamknij AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      setVisualizerData(new Array(20).fill(5));
    }
  };

  // Pauza/wznów nagrywanie
  const togglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      updateVisualizer();
    } else {
      mediaRecorderRef.current.pause();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
    setIsPaused(!isPaused);
  };

  // Odtwórz nagranie
  const togglePlayback = () => {
    if (!audioPlayerRef.current) return;

    if (isPlaying) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    } else {
      audioPlayerRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Wyślij nagranie
  const handleSend = async () => {
    if (!audioBlob || isSending) return;

    setIsSending(true);
    try {
      await onSend(audioBlob, recordingTime);
      handleCancel();
    } catch (err) {
      console.error('Error sending voice message:', err);
      alert('Błąd podczas wysyłania wiadomości głosowej');
    } finally {
      setIsSending(false);
    }
  };

  // Anuluj
  const handleCancel = () => {
    stopRecording();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
    onCancel?.();
  };

  // Automatycznie rozpocznij nagrywanie przy zamontowaniu
  useEffect(() => {
    startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup przy unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Obsługa zakończenia odtwarzania
  useEffect(() => {
    const player = audioPlayerRef.current;
    if (player) {
      const handleEnded = () => setIsPlaying(false);
      player.addEventListener('ended', handleEnded);
      return () => player.removeEventListener('ended', handleEnded);
    }
  }, [audioUrl]);

  // Tryb nagrywania
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 rounded-xl border border-pink-200/50 dark:border-pink-700/50">
        {/* Przycisk anuluj */}
        <button
          onClick={handleCancel}
          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-gray-500 hover:text-red-500 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200 flex-shrink-0"
        >
          <X size={18} className="sm:w-5 sm:h-5" />
        </button>

        {/* Wizualizacja */}
        <div className="flex-1 flex items-center justify-center gap-0.5 h-8 sm:h-10 min-w-0">
          {visualizerData.slice(0, 15).map((height, idx) => (
            <div
              key={idx}
              className="w-0.5 sm:w-1 bg-gradient-to-t from-pink-500 to-orange-500 rounded-full transition-all duration-75"
              style={{ height: `${Math.min(height, 32)}px` }}
            />
          ))}
        </div>

        {/* Czas nagrywania */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-pink-600 dark:text-pink-400 font-mono text-xs sm:text-sm min-w-[50px] sm:min-w-[60px] flex-shrink-0">
          <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
          {formatTime(recordingTime)}
        </div>

        {/* Przycisk pauza - ukryty na mobile */}
        <button
          onClick={togglePause}
          className="hidden sm:flex w-10 h-10 items-center justify-center text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all duration-200"
        >
          {isPaused ? <Play size={18} /> : <Pause size={18} />}
        </button>

        {/* Przycisk stop */}
        <button
          onClick={stopRecording}
          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl transition-all duration-200 shadow-lg shadow-pink-500/30 flex-shrink-0"
        >
          <Square size={14} className="sm:w-4 sm:h-4" fill="currentColor" />
        </button>
      </div>
    );
  }

  // Tryb podglądu nagrania
  if (audioBlob && audioUrl) {
    return (
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 rounded-xl border border-pink-200/50 dark:border-pink-700/50">
        {/* Hidden audio element */}
        <audio ref={audioPlayerRef} src={audioUrl} />

        {/* Przycisk anuluj */}
        <button
          onClick={handleCancel}
          disabled={isSending}
          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-gray-500 hover:text-red-500 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200 disabled:opacity-50 flex-shrink-0"
        >
          <X size={18} className="sm:w-5 sm:h-5" />
        </button>

        {/* Przycisk play/pause */}
        <button
          onClick={togglePlayback}
          disabled={isSending}
          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-pink-500 rounded-xl transition-all duration-200 disabled:opacity-50 flex-shrink-0"
        >
          {isPlaying ? <Pause size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Play size={16} className="sm:w-[18px] sm:h-[18px]" />}
        </button>

        {/* Info o nagraniu */}
        <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-white/80 dark:bg-gray-800/80 rounded-lg">
            <Mic size={14} className="sm:w-4 sm:h-4 text-pink-500 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
              <span className="hidden sm:inline">Wiadomość głosowa</span>
              <span className="sm:hidden">Głosowa</span>
            </span>
            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">
              {formatTime(recordingTime)}
            </span>
          </div>
        </div>

        {/* Przycisk wyślij */}
        <button
          onClick={handleSend}
          disabled={isSending || disabled}
          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl transition-all duration-200 shadow-lg shadow-pink-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {isSending ? (
            <Loader size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
          ) : (
            <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
          )}
        </button>
      </div>
    );
  }

  // Tryb początkowy - przycisk start (nie używany bezpośrednio - mikrofon jest w MessageInput)
  return null;
}
