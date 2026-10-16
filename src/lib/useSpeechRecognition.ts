import { useState, useRef, useCallback, useEffect } from 'react';

interface IWindowSpeechRecognition extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  cancelListening: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition(options?: {
  onFinalResult?: (finalText: string) => void;
}): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>('');
  const wasCancelledRef = useRef<boolean>(false);
  const hasEmittedFinalRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalResultRef = useRef(options?.onFinalResult);

  useEffect(() => {
    onFinalResultRef.current = options?.onFinalResult;
  }, [options?.onFinalResult]);

  const win = typeof window !== 'undefined' ? (window as unknown as IWindowSpeechRecognition) : undefined;
  const SpeechRecognitionClass = win?.SpeechRecognition || win?.webkitSpeechRecognition;
  const isSupported = Boolean(SpeechRecognitionClass);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (stopFallbackTimerRef.current) {
      clearTimeout(stopFallbackTimerRef.current);
      stopFallbackTimerRef.current = null;
    }
  }, []);

  const resetTranscript = useCallback(() => {
    clearTimers();
    setTranscript('');
    setError(null);
    latestTranscriptRef.current = '';
    hasEmittedFinalRef.current = false;
  }, [clearTimers]);

  const emitFinalIfReady = useCallback(() => {
    if (wasCancelledRef.current || hasEmittedFinalRef.current) return;
    const finalText = latestTranscriptRef.current.trim();
    if (finalText) {
      hasEmittedFinalRef.current = true;
      onFinalResultRef.current?.(finalText);
    }
  }, []);

  const cancelListening = useCallback(() => {
    wasCancelledRef.current = true;
    clearTimers();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignora
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, [clearTimers]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignora
      }
    }
    // Fallback caso onend demore no navegador
    stopFallbackTimerRef.current = setTimeout(() => {
      setIsListening(false);
      emitFinalIfReady();
    }, 500);
  }, [emitFinalIfReady]);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionClass) {
      setError('Seu navegador não oferece suporte nativo à Web Speech API.');
      return;
    }

    try {
      clearTimers();
      if (recognitionRef.current) {
        wasCancelledRef.current = true;
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'pt-BR';
      recognition.continuous = !isIOS;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      wasCancelledRef.current = false;
      hasEmittedFinalRef.current = false;
      latestTranscriptRef.current = '';
      setTranscript('');
      setError(null);
      setIsListening(true);

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalParts = '';
        let interimParts = '';

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (!item || !item[0]) continue;
          const piece = item[0].transcript.trim();
          if (!piece) continue;

          if (item.isFinal) {
            finalParts += (finalParts ? ' ' : '') + piece;
          } else {
            interimParts += (interimParts ? ' ' : '') + piece;
          }
        }

        const combined = [finalParts, interimParts].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        if (combined) {
          latestTranscriptRef.current = combined;
          setTranscript(combined);
          setError(null);

          // Auto-finaliza após 2s de silêncio depois que o usuário já falou a frase
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          silenceTimerRef.current = setTimeout(() => {
            if (recognitionRef.current) {
              try {
                recognitionRef.current.stop();
              } catch {}
            }
          }, 2000);
        }
      };

      recognition.onerror = (event: any) => {
        if (wasCancelledRef.current || event.error === 'aborted') {
          setIsListening(false);
          return;
        }
        let msg = 'Erro no reconhecimento de voz.';
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          msg = 'Permissão de microfone negada. Clique no cadeado da barra de endereço e permita o microfone.';
        } else if (event.error === 'no-speech') {
          msg = 'Nenhuma fala detectada pelo microfone. Verifique se o microfone correto está selecionado no navegador.';
        } else if (event.error === 'network') {
          msg = 'O navegador bloqueou o serviço de voz em nuvem (comum no Brave). Use Chrome/Edge ou digite abaixo.';
        } else if (event.error === 'audio-capture') {
          msg = 'Microfone não encontrado ou ocupado por outro aplicativo.';
        }
        setError(msg);
        setIsListening(false);
      };

      recognition.onend = () => {
        clearTimers();
        setIsListening(false);

        if (wasCancelledRef.current) return;

        const captured = latestTranscriptRef.current.trim();
        if (captured) {
          emitFinalIfReady();
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setError('Falha ao iniciar o microfone no navegador.');
      setIsListening(false);
    }
  }, [SpeechRecognitionClass, clearTimers, emitFinalIfReady]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [clearTimers]);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    cancelListening,
    resetTranscript,
  };
}
