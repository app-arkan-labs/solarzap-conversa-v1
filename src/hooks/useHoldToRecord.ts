import { useRef, useState, useCallback, useEffect } from 'react';

export type RecordingState = 'idle' | 'pressing' | 'recording' | 'canceling' | 'stopping' | 'sending';

interface HoldToRecordOptions {
  /** Minimum hold time (ms) before recording actually starts – prevents accidental taps */
  holdThresholdMs?: number;
  /** Horizontal drag distance (px) to enter cancel zone */
  cancelDragPx?: number;
  onSend: (blob: Blob, durationSeconds: number) => Promise<void>;
  onError?: (error: unknown) => void;
}

interface HoldToRecordResult {
  state: RecordingState;
  durationSeconds: number;
  cancelRatio: number; // 0..1 how far into cancel zone
  /** Bind these to the mic button element */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onContextMenu: (e: React.SyntheticEvent) => void;
  };
  /** Force-cancel from outside (e.g. conversation change) */
  forceCancel: () => void;
}

export function useHoldToRecord({
  holdThresholdMs = 200,
  cancelDragPx = 100,
  onSend,
  onError,
}: HoldToRecordOptions): HoldToRecordResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [cancelRatio, setCancelRatio] = useState(0);

  const stateRef = useRef<RecordingState>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startXRef = useRef(0);
  const durationRef = useRef(0);
  const sendGuardRef = useRef(false);

  // Keep stateRef in sync
  const setStateSync = useCallback((s: RecordingState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const cleanup = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    durationRef.current = 0;
    setDurationSeconds(0);
    setCancelRatio(0);
    sendGuardRef.current = false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ok */ }
      }
      cleanup();
    };
  }, [cleanup]);

  const startActualRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const preferredMime = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
        ? 'audio/ogg; codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
          ? 'audio/webm; codecs=opus'
          : undefined;

      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      sendGuardRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

        const shouldSend = !sendGuardRef.current && stateRef.current === 'stopping' && chunksRef.current.length > 0;
        if (shouldSend) {
          sendGuardRef.current = true;
          const finalDuration = Math.max(durationRef.current, 1);
          const mime = recorder.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: mime });
          setStateSync('sending');
          try {
            await onSend(blob, finalDuration);
          } catch (err) {
            onError?.(err);
          }
        }

        chunksRef.current = [];
        durationRef.current = 0;
        setDurationSeconds(0);
        setCancelRatio(0);
        setStateSync('idle');
      };

      recorder.start();
      durationRef.current = 0;
      setDurationSeconds(0);
      setStateSync('recording');

      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDurationSeconds(durationRef.current);
      }, 1000);
    } catch (err) {
      cleanup();
      setStateSync('idle');
      onError?.(err);
    }
  }, [onSend, onError, cleanup, setStateSync]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (stateRef.current !== 'idle') return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startXRef.current = e.clientX;
    setStateSync('pressing');

    holdTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'pressing') {
        startActualRecording();
      }
    }, holdThresholdMs);
  }, [holdThresholdMs, startActualRecording, setStateSync]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (stateRef.current !== 'recording' && stateRef.current !== 'canceling') return;
    const dx = startXRef.current - e.clientX; // positive = dragged left
    const ratio = Math.max(0, Math.min(1, dx / cancelDragPx));
    setCancelRatio(ratio);
    setStateSync(ratio >= 1 ? 'canceling' : 'recording');
  }, [cancelDragPx, setStateSync]);

  const finishRecording = useCallback((cancel: boolean) => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }

    const s = stateRef.current;
    if (s === 'idle' || s === 'sending' || s === 'stopping') return;

    if (s === 'pressing') {
      // Released before threshold → no recording started
      cleanup();
      setStateSync('idle');
      return;
    }

    if (cancel || s === 'canceling') {
      // Discard recording
      sendGuardRef.current = true; // prevent onstop from sending
      setStateSync('idle');
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* ok */ }
      }
      cleanup();
      return;
    }

    // Normal stop → send
    setStateSync('stopping');
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ok */ }
    }
  }, [cleanup, setStateSync]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    finishRecording(false);
  }, [finishRecording]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    finishRecording(true);
  }, [finishRecording]);

  const onContextMenu = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
  }, []);

  const forceCancel = useCallback(() => {
    finishRecording(true);
  }, [finishRecording]);

  return {
    state,
    durationSeconds,
    cancelRatio,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu },
    forceCancel,
  };
}
