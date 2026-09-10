import { useRef, useState } from "react";
import { functionErrorMessage, supabase } from "../../lib/supabaseClient";
import type { DevisLigne } from "../../types/database";

export interface VoiceDevisResult {
  transcript: string;
  objet: string;
  contexte: string;
  client_id: string | null;
  client_name: string;
  lignes: DevisLigne[];
}

interface VoiceRecorderProps {
  onResult: (result: VoiceDevisResult) => void;
}

type RecorderState = "idle" | "recording" | "processing" | "error";

const isSupported = typeof window !== "undefined" && !!navigator.mediaDevices && !!window.MediaRecorder;

export default function VoiceRecorder({ onResult }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  if (!isSupported) {
    return null;
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void processRecording(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      setError("Micro inaccessible. Vérifie les permissions du navigateur.");
      setState("error");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setState("processing");
  }

  async function processRecording(blob: Blob) {
    try {
      const formData = new FormData();
      formData.set("audio", blob, "devis.webm");

      const { data, error: invokeError } = await supabase.functions.invoke("devis-vocal", {
        body: formData,
      });

      if (invokeError) throw new Error(await functionErrorMessage(invokeError));
      if (data?.error) throw new Error(data.error);

      setLastTranscript(data.transcript);
      onResult(data as VoiceDevisResult);
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du traitement de l'enregistrement");
      setState("error");
    }
  }

  return (
    <div className="rounded-md border border-line bg-bg-light p-3">
      <div className="flex items-center gap-3">
        {state === "recording" ? (
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white"
          >
            ● Arrêter l'enregistrement
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={state === "processing"}
            className="flex items-center gap-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            🎤 {state === "processing" ? "Traitement…" : "Dicter le devis"}
          </button>
        )}
        <p className="text-xs text-gray">
          Décris le client, l'objet et chaque prestation avec sa quantité et son prix. Tu pourras
          tout corriger avant d'enregistrer.
        </p>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {lastTranscript && state === "idle" && (
        <p className="mt-2 text-xs text-gray">
          <span className="font-medium">Transcription : </span>
          {lastTranscript}
        </p>
      )}
    </div>
  );
}
