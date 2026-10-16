import { useState, useRef, useCallback, useEffect } from 'react';

// Declaração tipada para Web Speech API
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
  resetTranscript: () => void;
}

export function useSpeechRecognition(options?: {
  onFinalResult?: (finalText: string) => void;
}): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
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
    finalTranscriptRef.current = '';
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionClass) {
      setError('Seu navegador não suporta reconhecimento de voz.');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      finalTranscriptRef.current = '';
      setTranscript('');
      setError(null);

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let interimText = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            currentFinal += text;
          } else {
            interimText += text;
          }
        }

        if (currentFinal) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + currentFinal.trim();
        }

        const display = finalTranscriptRef.current + (interimText ? ` ${interimText}` : '');
        setTranscript(display.trim());
      };

      recognition.onerror = (event: any) => {
        let msg = 'Erro no reconhecimento de voz.';
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          msg = 'Permissão para usar o microfone foi negada no navegador.';
        } else if (event.error === 'no-speech') {
          msg = 'Nenhuma fala detectada. Toque no microfone e tente falar novamente.';
        } else if (event.error === 'network') {
          msg = 'Falha de conexão com o serviço de reconhecimento de voz.';
        }
        setError(msg);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        const text = finalTranscriptRef.current.trim();
        if (text && onFinalResultRef.current) {
          onFinalResultRef.current(text);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setError('Não foi possível iniciar o microfone.');
      setIsListening(false);
    }
  }, [SpeechRecognitionClass]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignora se já estiver parado
      }
    }
    setIsListening(false);
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
