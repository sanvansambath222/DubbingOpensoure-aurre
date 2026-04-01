import { useEffect, useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play, Stop, MagnifyingGlass, SpeakerHigh, GenderMale, GenderFemale, CheckCircle, Globe } from "@phosphor-icons/react";
import axios from "axios";
import { API } from "./constants";

const EDGE_VOICES = {
  th: { name: "Thai", male: [{ id: "th_m1", name: "Niwat (Boy)", code: "th-TH-NiwatNeural" }], female: [{ id: "th_f1", name: "Premwadee (Girl)", code: "th-TH-PremwadeeNeural" }] },
  vi: { name: "Vietnamese", male: [{ id: "vi_m1", name: "NamMinh (Boy)", code: "vi-VN-NamMinhNeural" }], female: [{ id: "vi_f1", name: "HoaiMy (Girl)", code: "vi-VN-HoaiMyNeural" }] },
  ko: { name: "Korean", male: [{ id: "ko_m1", name: "InJoon (Boy)", code: "ko-KR-InJoonNeural" }], female: [{ id: "ko_f1", name: "SunHi (Girl)", code: "ko-KR-SunHiNeural" }] },
  ja: { name: "Japanese", male: [{ id: "ja_m1", name: "Keita (Boy)", code: "ja-JP-KeitaNeural" }], female: [{ id: "ja_f1", name: "Nanami (Girl)", code: "ja-JP-NanamiNeural" }] },
  en: { name: "English", male: [{ id: "en_m1", name: "Guy (Boy)", code: "en-US-GuyNeural" }], female: [{ id: "en_f1", name: "Jenny (Girl)", code: "en-US-JennyNeural" }] },
  zh: { name: "Chinese", male: [{ id: "zh_m1", name: "YunXi (Boy)", code: "zh-CN-YunxiNeural" }], female: [{ id: "zh_f1", name: "XiaoXiao (Girl)", code: "zh-CN-XiaoxiaoNeural" }] },
  id: { name: "Indonesian", male: [{ id: "id_m1", name: "Ardi (Boy)", code: "id-ID-ArdiNeural" }], female: [{ id: "id_f1", name: "Gadis (Girl)", code: "id-ID-GadisNeural" }] },
  hi: { name: "Hindi", male: [{ id: "hi_m1", name: "Madhur (Boy)", code: "hi-IN-MadhurNeural" }], female: [{ id: "hi_f1", name: "Swara (Girl)", code: "hi-IN-SwaraNeural" }] },
  es: { name: "Spanish", male: [{ id: "es_m1", name: "Alvaro (Boy)", code: "es-ES-AlvaroNeural" }], female: [{ id: "es_f1", name: "Elvira (Girl)", code: "es-ES-ElviraNeural" }] },
  fr: { name: "French", male: [{ id: "fr_m1", name: "Henri (Boy)", code: "fr-FR-HenriNeural" }], female: [{ id: "fr_f1", name: "Denise (Girl)", code: "fr-FR-DeniseNeural" }] },
  km: { name: "Khmer", male: [{ id: "dara", name: "Piseth (Boy)", code: "km-KH-PisethNeural" }], female: [{ id: "sophea", name: "Sreymom (Girl)", code: "km-KH-SreymomNeural" }] },
};

const GEMINI_AGE_MAP = {
  Young: ["Bright", "Youthful", "Excitable", "Upbeat", "Lively", "Friendly", "Casual"],
  Adult: ["Informative", "Firm", "Forward", "Breeze", "Knowledgeable", "Even", "Easy-going", "Smooth", "Clear", "Confident"],
  Mature: ["Mature", "Soft", "Gentle", "Warm", "Gravelly", "Hypnotic"],
};

const VoicePickerModal = ({ open, onClose, onSelect, actorGender, actorName, targetLanguage, isDark, token }) => {
  const d = isDark;
  const [tab, setTab] = useState("edge");
  const [geminiVoices, setGeminiVoices] = useState([]);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("ALL");
  const [ageFilter, setAgeFilter] = useState("ALL");
  const [playingVoice, setPlayingVoice] = useState(null);
  const audioRef = useRef(null);

  const fetchGeminiVoices = useCallback(async () => {
    setGeminiLoading(true);
    try {
      const r = await axios.get(`${API}/gemini-voices`);
      setGeminiVoices(r.data.voices || []);
    } catch { setGeminiVoices([]); }
    finally { setGeminiLoading(false); }
  }, []);

  useEffect(() => { if (open && tab === "gemini") fetchGeminiVoices(); }, [open, tab, fetchGeminiVoices]);

  const previewGcloudVoice = async (voiceName, text) => {
    if (playingVoice) { if (audioRef.current) audioRef.current.pause(); setPlayingVoice(null); return; }
    setPlayingVoice(voiceName);
    try {
      const endpoint = tab === "gemini" ? `${API}/gemini-tts-preview` : `${API}/gcloud-tts-preview`;
      const r = await axios.post(endpoint, {
        text: text || "This is a voice preview test.",
        voice_name: voiceName, language_code: voiceName.split("-").slice(0, 2).join("-"),
      }, { responseType: "blob", timeout: 15000 });
      const url = URL.createObjectURL(r.data);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url); };
      audio.play();
    } catch { setPlayingVoice(null); }
  };

  const stopPreview = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } setPlayingVoice(null); };

  useEffect(() => { return () => stopPreview(); }, []);

  const edgeLangs = Object.entries(EDGE_VOICES);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center"
        onClick={onClose}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          className={`border rounded-sm max-w-2xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col ${d ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-black/10'}`}
          onClick={e => e.stopPropagation()}>
          
          {/* Header */}
          <div className={`flex items-center justify-between px-5 py-4 border-b ${d ? 'border-zinc-700' : 'border-black/10'}`}>
            <div className="flex items-center gap-2">
              <SpeakerHigh className={`w-5 h-5 ${d ? 'text-white' : 'text-zinc-950'}`} weight="fill" />
              <h2 className={`font-semibold text-base ${d ? 'text-white' : 'text-zinc-950'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>Voice Picker</h2>
              {actorName && (
                <span className={`text-xs px-2 py-0.5 rounded-sm ${d ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`} data-testid="voice-picker-actor-name">
                  for {actorName}
                </span>
              )}
            </div>
            <button onClick={onClose} className={`p-1.5 rounded-sm transition-colors ${d ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs - Edge only */}
          <div className={`flex border-b ${d ? 'border-zinc-700' : 'border-black/10'}`}>
            <button
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${d ? 'text-white border-b-2 border-white' : 'text-zinc-950 border-b-2 border-zinc-950'}`}>
              Microsoft Edge TTS (Free)
            </button>
          </div>


          {/* Voice List */}
          <div className="flex-1 overflow-y-auto px-5 py-3" style={{ maxHeight: '50vh' }}>
            {/* Edge voices only */}
              <div className="space-y-4">
                {edgeLangs.map(([code, lang]) => (
                  <div key={code}>
                    <h4 className={`text-[10px] uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5 ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      <Globe className="w-3 h-3" /> {lang.name}
                    </h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[...lang.male, ...lang.female].map(voice => {
                        const isMale = lang.male.includes(voice);
                        return (
                          <button key={voice.id} data-testid={`edge-voice-${voice.id}`}
                            onClick={() => onSelect({ provider: "edge", voiceId: voice.id, voiceName: voice.name, gender: isMale ? "male" : "female" })}
                            className={`flex items-center gap-2 px-3 py-2 rounded-sm border text-left transition-all group ${
                              d ? 'bg-zinc-800 border-zinc-700 hover:border-zinc-500' : 'bg-white border-black/10 hover:border-zinc-400'
                            }`}>
                            {isMale ? <GenderMale className="w-3.5 h-3.5 text-blue-500" weight="bold" /> : <GenderFemale className="w-3.5 h-3.5 text-pink-500" weight="bold" />}
                            <span className={`text-xs font-medium flex-1 ${d ? 'text-zinc-200' : 'text-zinc-700'}`}>{voice.name}</span>
                            <span className="text-[9px] text-emerald-600 font-bold">FREE</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
          </div>
          <div className={`px-5 py-3 border-t flex items-center justify-between ${d ? 'border-zinc-700' : 'border-black/10'}`}>
            <p className="text-[10px] text-zinc-500">
              Microsoft Edge TTS - free and unlimited
            </p>
            <button onClick={onClose} className={`px-4 py-1.5 text-xs font-semibold rounded-sm transition-colors ${d ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200'}`}>
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default VoicePickerModal;
