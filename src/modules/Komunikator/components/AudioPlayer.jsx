import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

export default function AudioPlayer({ url, duration, isOwn = false }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef(null);
  const progressRef = useRef(null);

  // Formatuj czas
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Obsługa play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // Obsługa kliknięcia w progress bar
  const handleProgressClick = (e) => {
    if (!progressRef.current || !audioRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = clickX / width;
    const newTime = percentage * totalDuration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Event handlers dla audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleCanPlay = () => setIsLoading(false);
    const handleWaiting = () => setIsLoading(true);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
    };
  }, []);

  // Oblicz procent postępu
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl min-w-[200px] max-w-[280px] ${
        isOwn
          ? 'bg-white/10'
          : 'bg-gray-100 dark:bg-gray-700/50'
      }`}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={isLoading}
        className={`w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 flex-shrink-0 ${
          isOwn
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white shadow-md'
        } disabled:opacity-50`}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      {/* Progress section */}
      <div className="flex-1 min-w-0">
        {/* Waveform/Progress bar */}
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="relative h-8 cursor-pointer group"
        >
          {/* Statyczna wizualizacja fal (dekoracyjna) */}
          <div className="absolute inset-0 flex items-center justify-center gap-0.5">
            {Array.from({ length: 30 }).map((_, i) => {
              const height = Math.sin(i * 0.5) * 10 + 12 + Math.random() * 4;
              const isActive = (i / 30) * 100 <= progressPercent;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-colors duration-150 ${
                    isOwn
                      ? isActive
                        ? 'bg-white'
                        : 'bg-white/30'
                      : isActive
                        ? 'bg-gradient-to-t from-pink-500 to-orange-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          {/* Progress overlay */}
          <div
            className="absolute inset-y-0 left-0 pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Time display */}
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[10px] font-mono ${isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
            {formatTime(currentTime)}
          </span>
          <div className="flex items-center gap-1">
            <Mic size={10} className={isOwn ? 'text-white/50' : 'text-gray-400'} />
            <span className={`text-[10px] font-mono ${isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
              {formatTime(totalDuration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
