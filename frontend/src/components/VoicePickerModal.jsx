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

const GCLOUD_LANG_MAP = {
  th: "th-TH", vi: "vi-VN", ko: "ko-KR", ja: "ja-JP", en: "en-US", zh: "cmn-CN",
  id: "id-ID", hi: "hi-IN", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR",
  ru: "ru-RU", ar: "ar-XA", it: "it-IT", ms: "ms-MY",
};

const VoicePickerModal = ({ open, onClose, onSelect, actorGender, targetLanguage, isDark, token }) => {
  const d = isDark;
  const [tab, setTab] = useState("edge");
  const [gcloudVoices, setGcloudVoices] = useState([]);
  const [gcloudLoading, setGcloudLoading] = useState(false);
  const [geminiVoices, setGeminiVoices] = useState([]);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("ALL");
  const [langFilter, setLangFilter] = useState(targetLanguage || "");
  const [playingVoice, setPlayingVoice] = useState(null);
  const audioRef = useRef(null);

  const fetchGcloudVoices = useCallback(async () => {
    setGcloudLoading(true);
    try {
      const langCode = GCLOUD_LANG_MAP[langFilter] || langFilter;
      const r = await axios.get(`${API}/gcloud-voices`, { params: { language_code: langCode ? langCode.split("-")[0] : undefined } });
      setGcloudVoices(r.data.voices || []);
    } catch { setGcloudVoices([]); }
    finally { setGcloudLoading(false); }
  }, [langFilter]);

  useEffect(() => { if (open && tab === "gcloud") fetchGcloudVoices(); }, [open, tab, fetchGcloudVoices]);

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

  const filteredGcloud = gcloudVoices.filter(v => {
    if (genderFilter !== "ALL" && v.gender !== genderFilter) return false;
    if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
            </div>
            <button onClick={onClose} className={`p-1.5 rounded-sm transition-colors ${d ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className={`flex border-b ${d ? 'border-zinc-700' : 'border-black/10'}`}>
            <button onClick={() => setTab("edge")}
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === "edge" ? (d ? 'text-white border-b-2 border-white' : 'text-zinc-950 border-b-2 border-zinc-950') : (d ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700')}`}>
              Microsoft (Free)
            </button>
            <button onClick={() => setTab("gemini")}
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === "gemini" ? (d ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-emerald-600 border-b-2 border-emerald-600') : (d ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700')}`}>
              Gemini (Free)
            </button>
            <button onClick={() => setTab("gcloud")}
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${tab === "gcloud" ? (d ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-cyan-600 border-b-2 border-cyan-600') : (d ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700')}`}>
              Google Cloud (Premium)
            </button>
          </div>

          {/* Filters */}
          {(tab === "gcloud" || tab === "gemini") && (
            <div className={`flex items-center gap-2 px-5 py-3 border-b ${d ? 'border-zinc-800' : 'border-black/5'}`}>
              <div className="relative flex-1">
                <MagnifyingGlass className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search voice name..."
                  className={`w-full pl-8 pr-3 py-1.5 border rounded-sm text-xs outline-none ${d ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-50 border-black/10 text-zinc-950'}`} />
              </div>
              {tab === "gcloud" && (
                <select value={langFilter} onChange={e => setLangFilter(e.target.value)}
                  className={`px-2 py-1.5 border rounded-sm text-xs outline-none ${d ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-50 border-black/10 text-zinc-950'}`}>
                  <option value="">All Languages</option>
                  {Object.entries(GCLOUD_LANG_MAP).map(([k]) => <option key={k} value={k}>{EDGE_VOICES[k]?.name || k.toUpperCase()}</option>)}
                </select>
              )}
              <div className="flex gap-1">
                {["ALL", "MALE", "FEMALE"].map(g => (
                  <button key={g} onClick={() => setGenderFilter(g)}
                    className={`px-2 py-1 text-[10px] font-bold rounded-sm transition-colors ${genderFilter === g ? (d ? 'bg-zinc-700 text-white' : 'bg-zinc-950 text-white') : (d ? 'text-zinc-500 hover:text-white' : 'text-zinc-400 hover:text-zinc-950')}`}>
                    {g === "ALL" ? "All" : g === "MALE" ? "Boy" : "Girl"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Voice List */}
          <div className="flex-1 overflow-y-auto px-5 py-3" style={{ maxHeight: '50vh' }}>
            {tab === "edge" ? (
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
            ) : tab === "gemini" ? (
              geminiLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="space-y-1">
                  <p className={`text-[10px] mb-3 ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {geminiVoices.length} Gemini AI voices. High quality, free tier. Click to select, hover to preview.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {geminiVoices.filter(v => genderFilter === "ALL" || v.gender === genderFilter)
                      .filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()))
                      .map(voice => {
                      const isMale = voice.gender === "MALE";
                      const isPlaying = playingVoice === voice.name;
                      return (
                        <div key={voice.name} data-testid={`gemini-voice-${voice.name}`}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-sm border transition-all group cursor-pointer ${
                            d ? 'bg-zinc-800 border-zinc-700 hover:border-emerald-600' : 'bg-white border-black/10 hover:border-emerald-400'
                          }`}
                          onClick={() => onSelect({
                            provider: "gemini",
                            voiceName: voice.name,
                            voiceLabel: `${voice.name} (${voice.style})`,
                            gender: isMale ? "male" : "female",
                          })}>
                          {isMale ? <GenderMale className="w-3.5 h-3.5 text-blue-500" weight="bold" /> : <GenderFemale className="w-3.5 h-3.5 text-pink-500" weight="bold" />}
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${d ? 'text-zinc-200' : 'text-zinc-700'}`}>{voice.name}</p>
                            <p className="text-[9px] text-zinc-500">{voice.style} - {voice.gender}</p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); isPlaying ? stopPreview() : previewGcloudVoice(voice.name, "This is a voice preview."); }}
                            className={`p-1.5 rounded-sm opacity-0 group-hover:opacity-100 transition-all ${
                              isPlaying ? 'bg-red-100 text-red-600 opacity-100' : (d ? 'bg-zinc-700 text-white hover:bg-zinc-600' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')
                            }`}>
                            {isPlaying ? <Stop className="w-3 h-3" weight="fill" /> : <Play className="w-3 h-3" weight="fill" />}
                          </button>
                          <span className="text-[9px] text-emerald-600 font-bold">FREE</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ) : gcloudLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-1">
                <p className={`text-[10px] mb-2 ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {filteredGcloud.length} voices found. Click to select, hover play to preview.
                </p>
                {filteredGcloud.map(voice => {
                  const isMale = voice.gender === "MALE";
                  const isPlaying = playingVoice === voice.name;
                  return (
                    <div key={voice.name} data-testid={`gcloud-voice-${voice.name}`}
                      className={`flex items-center gap-2 px-3 py-2 rounded-sm border transition-all group cursor-pointer ${
                        d ? 'bg-zinc-800 border-zinc-700 hover:border-cyan-600' : 'bg-white border-black/10 hover:border-cyan-400'
                      }`}
                      onClick={() => onSelect({
                        provider: "gcloud",
                        voiceName: voice.name,
                        voiceLabel: voice.name.split("-").slice(2).join(" "),
                        gender: isMale ? "male" : "female",
                        languageCode: voice.language,
                      })}>
                      {isMale ? <GenderMale className="w-3.5 h-3.5 text-blue-500" weight="bold" /> : <GenderFemale className="w-3.5 h-3.5 text-pink-500" weight="bold" />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${d ? 'text-zinc-200' : 'text-zinc-700'}`}>{voice.name}</p>
                        <p className="text-[9px] text-zinc-500">{voice.language} - {voice.gender}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); isPlaying ? stopPreview() : previewGcloudVoice(voice.name, "This is a voice preview."); }}
                        className={`p-1.5 rounded-sm opacity-0 group-hover:opacity-100 transition-all ${
                          isPlaying ? 'bg-red-100 text-red-600 opacity-100' : (d ? 'bg-zinc-700 text-white hover:bg-zinc-600' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')
                        }`}>
                        {isPlaying ? <Stop className="w-3 h-3" weight="fill" /> : <Play className="w-3 h-3" weight="fill" />}
                      </button>
                      <span className={`text-[9px] font-bold ${d ? 'text-cyan-400' : 'text-cyan-600'}`}>PREMIUM</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`px-5 py-3 border-t flex items-center justify-between ${d ? 'border-zinc-700' : 'border-black/10'}`}>
            <p className="text-[10px] text-zinc-500">
              {tab === "edge" ? "Microsoft Edge TTS - free and unlimited" : tab === "gemini" ? "Gemini AI voices - free tier with rate limits" : "Google Cloud - ~$0.000004/character"}
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
