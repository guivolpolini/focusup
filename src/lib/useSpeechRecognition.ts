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
  const hadErrorRef = useRef<boolean>(false);
  const audioStartedRef = useRef<boolean>(false);
  const soundDetectedRef = useRef<boolean>(false);
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
    hadErrorRef.current = false;
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
    // Fallback caso onend demore após stop()
    stopFallbackTimerRef.current = setTimeout(() => {
      setIsListening(false);
      emitFinalIfReady();
    }, 800);
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

      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'pt-BR';
      // continuous = false unifica o comportamento entre PC e Celular:
      // finaliza e entrega a transcrição completa assim que o usuário termina a frase ou clica em parar.
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      wasCancelledRef.current = false;
      hasEmittedFinalRef.current = false;
      hadErrorRef.current = false;
      audioStartedRef.current = false;
      soundDetectedRef.current = false;
      latestTranscriptRef.current = '';
      setTranscript('');
      setError(null);
      setIsListening(true);

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onaudiostart = () => {
        audioStartedRef.current = true;
      };

      recognition.onsoundstart = () => {
        soundDetectedRef.current = true;
      };

      recognition.onspeechstart = () => {
        soundDetectedRef.current = true;
      };

      recognition.onresult = (event: any) => {
        soundDetectedRef.current = true;
        let finalParts = '';
        let interimParts = '';

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (!item || !item[0]) continue;
          const piece = String(item[0].transcript || '').trim();
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

          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          silenceTimerRef.current = setTimeout(() => {
            if (recognitionRef.current) {
              try {
                recognitionRef.current.stop();
              } catch {}
            }
          }, 1800);
        }
      };

      recognition.onerror = (event: any) => {
        if (wasCancelledRef.current || event.error === 'aborted') {
          setIsListening(false);
          return;
        }
        hadErrorRef.current = true;
        let msg = 'Erro no reconhecimento de voz.';
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          msg = 'Permissão de microfone negada. Clique no cadeado da barra de endereço e permita o microfone.';
        } else if (event.error === 'no-speech') {
          msg = 'Nenhum som detectado no microfone. No PC, verifique no ícone da barra de endereço se o microfone correto está selecionado.';
        } else if (event.error === 'network') {
          msg = 'Serviço de voz bloqueado pelo navegador (comum no Brave/Opera no PC). Use Chrome/Edge ou digite abaixo.';
        } else if (event.error === 'audio-capture') {
          msg = 'Microfone não encontrado ou ocupado por outro aplicativo no PC.';
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
        } else if (!hadErrorRef.current) {
          if (!audioStartedRef.current) {
            setError('Não foi possível abrir o microfone. Verifique a permissão de microfone no navegador e no Windows.');
          } else if (!soundDetectedRef.current) {
            setError('Nenhum som chegou ao microfone. No PC, clique no ícone de câmera/microfone na barra de endereço e selecione o microfone correto.');
          } else {
            setError('Som detectado, mas o navegador não converteu a fala em texto. Se estiver usando Brave/Opera no PC, teste no Chrome/Edge ou digite abaixo.');
          }
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
