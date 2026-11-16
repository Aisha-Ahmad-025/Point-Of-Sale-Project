import { useCallback, useEffect, useRef, useState } from 'react';

export const getRecognitionCtor = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition || null : null);
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';

/**
 * Speech-to-text through the browser (Web Speech API): free, no key. In Chrome the audio is processed by Google's speech
 * service, so it needs an internet connection. Results arrive as interim text while you talk, then one final result
 * (with alternative guesses, which the assistant uses to improve accuracy).
 */
export function useSpeechRecognition({ lang = 'en-US', onInterim, onFinal, onError, onEnd }) {
  const supported = !!getRecognitionCtor();
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const cb = useRef({}); cb.current = { onInterim, onFinal, onError, onEnd };

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return false;
    try { rec.current?.abort(); } catch { /* nothing to abort */ }
    const r = new Ctor();
    r.lang = lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 4;
    let gotFinal = false;
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let interim = ''; let finalText = ''; let alts = [];
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) { finalText += res[0].transcript; alts = Array.from(res).map((a) => a.transcript.trim()).filter(Boolean); gotFinal = true; } else interim += res[0].transcript;
      }
      if (finalText) cb.current.onFinal?.(finalText.trim(), alts); else cb.current.onInterim?.(interim);
    };
    r.onerror = (e) => cb.current.onError?.(e.error);
    r.onend = () => { setListening(false); cb.current.onEnd?.(gotFinal); };
    rec.current = r;
    try { r.start(); return true; } catch { setListening(false); return false; }
  }, [lang]);

  const stop = useCallback(() => { try { rec.current?.stop(); } catch { /* ignore */ } }, []);
  const abort = useCallback(() => { try { rec.current?.abort(); } catch { /* ignore */ } setListening(false); }, []);
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* ignore */ } }, []);
  return { supported, listening, start, stop, abort };
}

/** Text-to-speech through the browser (free). Resolves when the sentence has been spoken (or at once if unavailable). */
export function speak(text, { lang = 'en-US', enabled = true } = {}) {
  return new Promise((resolve) => {
    if (!enabled || !text || !canSpeak()) { resolve(); return; }
    try {
      const synth = window.speechSynthesis; synth.cancel();
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = 1.03; u.pitch = 1;
      const voices = synth.getVoices();
      const v = voices.find((x) => x.lang === lang) || voices.find((x) => x.lang?.startsWith(lang.slice(0, 2)));
      if (v) u.voice = v;
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 12000); // never hang the assistant if the engine stalls
      u.onend = done; u.onerror = done;
      synth.speak(u);
    } catch { resolve(); }
  });
}
export const stopSpeaking = () => { try { if (canSpeak()) window.speechSynthesis.cancel(); } catch { /* ignore */ } };
