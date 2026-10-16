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
  startListening: () => Promise<void>;
  stopListening: () => void;
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
  const onFinalResultRef = useRef(options?.onFinalResult);

  useEffect(() => {
    onFinalResultRef.current = options?.onFinalResult;
  }, [options?.onFinalResult]);

  const win = typeof window !== 'undefined' ? (window as unknown as IWindowSpeechRecognition) : undefined;
  const SpeechRecognitionClass = win?.SpeechRecognition || win?.webkitSpeechRecognition;
  const isSupported = Boolean(SpeechRecognitionClass);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
    latestTranscriptRef.current = '';
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignora
      }
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (!SpeechRecognitionClass) {
      setError('Seu navegador não oferece suporte nativo à Web Speech API.');
      return;
    }

    try {
      // 1. Tenta garantir a permissão do microfone via getUserMedia se disponível
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch (permErr: any) {
          if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
            setError('Permissão de microfone negada. Permita o microfone no ícone de cadeado do navegador.');
            setIsListening(false);
            return;
          }
        }
      }

      // 2. Limpa instância anterior
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'pt-BR';
      // continuous = false garante compatibilidade com iOS WebKit e Android Chrome
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      latestTranscriptRef.current = '';
      setTranscript('');
      setError(null);
      setIsListening(true);

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let fullText = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item && item[0]) {
            fullText += (fullText ? ' ' : '') + item[0].transcript.trim();
          }
        }

        const trimmed = fullText.trim();
        latestTranscriptRef.current = trimmed;
        setTranscript(trimmed);
      };

      recognition.onerror = (event: any) => {
        let msg = 'Erro no reconhecimento de voz.';
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          msg = 'Permissão de microfone negada. Clique no cadeado da barra de endereço e permita o microfone.';
        } else if (event.error === 'no-speech') {
          msg = 'Nenhum som detectado. Toque no microfone para falar novamente.';
        } else if (event.error === 'network') {
          msg = 'Falha de conexão com o serviço de voz. Verifique sua conexão.';
        } else if (event.error === 'audio-capture') {
          msg = 'Microfone não encontrado ou ocupado por outro aplicativo.';
        }
        setError(msg);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setError('Falha ao iniciar o microfone no navegador.');
      setIsListening(false);
    }
  }, [SpeechRecognitionClass]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
