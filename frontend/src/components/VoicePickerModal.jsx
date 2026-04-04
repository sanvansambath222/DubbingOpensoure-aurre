import { useEffect, useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play, Stop, MagnifyingGlass, SpeakerHigh, GenderMale, GenderFemale, Globe, CaretDown } from "@phosphor-icons/react";
import axios from "axios";
import { API } from "./constants";

// Fallback hardcoded voices (used if API fails)
const FALLBACK_VOICES = {
  km: { name: "Khmer", male: [{ id: "dara", name: "Piseth (Boy)", code: "km-KH-PisethNeural" }, { id: "mms_khmer", name: "Meta AI (Boy)", code: "mms-tts-khm" }], female: [{ id: "sophea", name: "Sreymom (Girl)", code: "km-KH-SreymomNeural" }, { id: "mms_khmer_f", name: "Meta AI (Girl)", code: "mms-tts-khm-f" }] },
  en: { name: "English", male: [{ id: "en_m1", name: "Guy (Boy)", code: "en-US-GuyNeural" }], female: [{ id: "en_f1", name: "Jenny (Girl)", code: "en-US-JennyNeural" }] },
  th: { name: "Thai", male: [{ id: "th_m1", name: "Niwat (Boy)", code: "th-TH-NiwatNeural" }], female: [{ id: "th_f1", name: "Premwadee (Girl)", code: "th-TH-PremwadeeNeural" }] },
};

// Language display names
const LANG_NAMES = {
  km: "Khmer", en: "English", zh: "Chinese", ja: "Japanese", ko: "Korean", th: "Thai",
  vi: "Vietnamese", es: "Spanish", fr: "French", de: "German", hi: "Hindi", id: "Indonesian",
  pt: "Portuguese", ru: "Russian", ar: "Arabic", it: "Italian", ms: "Malay", lo: "Lao",
  my: "Myanmar", tl: "Filipino", nl: "Dutch", pl: "Polish", tr: "Turkish", sv: "Swedish",
  da: "Danish", fi: "Finnish", nb: "Norwegian", cs: "Czech", el: "Greek", he: "Hebrew",
  hu: "Hungarian", ro: "Romanian", sk: "Slovak", uk: "Ukrainian", bg: "Bulgarian",
  hr: "Croatian", lt: "Lithuanian", lv: "Latvian", et: "Estonian", sl: "Slovenian",
  sr: "Serbian", ca: "Catalan", eu: "Basque", gl: "Galician", ta: "Tamil", te: "Telugu",
  bn: "Bengali", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", mr: "Marathi", pa: "Punjabi",
  ur: "Urdu", fa: "Persian", sw: "Swahili", am: "Amharic", ne: "Nepali", si: "Sinhala",
  af: "Afrikaans", cy: "Welsh", ga: "Irish", mt: "Maltese", is: "Icelandic", mk: "Macedonian",
  bs: "Bosnian", sq: "Albanian", az: "Azerbaijani", ka: "Georgian", hy: "Armenian",
  uz: "Uzbek", kk: "Kazakh", mn: "Mongolian", ps: "Pashto", so: "Somali", zu: "Zulu",
  jv: "Javanese", su: "Sundanese", fil: "Filipino", wuu: "Wu Chinese", yue: "Cantonese",
};

const VoicePickerModal = ({ open, onClose, onSelect, actorGender, actorName, targetLanguage, isDark, token }) => {
  const d = isDark;
  const [allVoices, setAllVoices] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedLang, setExpandedLang] = useState(null);
  const [playingVoice, setPlayingVoice] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const audioRef = useRef(null);

  // Fetch all Edge TTS voices from API
  const fetchAllVoices = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/edge-voices`);
      setAllVoices(r.data);
      // Auto-expand target language or Khmer
      const targetLang = targetLanguage?.split("-")[0] || "km";
      setExpandedLang(targetLang);
    } catch {
      setAllVoices(null);
    } finally {
      setLoading(false);
    }
  }, [targetLanguage]);

  useEffect(() => {
    if (open) fetchAllVoices();
  }, [open, fetchAllVoices]);

  const stopPreview = () => {
    if (audioRef.current) {
      const oldSrc = audioRef.current.src;
      audioRef.current.pause();
      audioRef.current = null;
      if (oldSrc) URL.revokeObjectURL(oldSrc);
    }
    setPlayingVoice(null);
    setPreviewLoading(null);
  };

  const previewVoice = async (voiceName) => {
    if (playingVoice === voiceName) { stopPreview(); return; }
    stopPreview();
    setPreviewLoading(voiceName);
    try {
      const r = await axios.post(`${API}/edge-tts-preview`, {
        text: "Hello, this is a voice preview test.",
        voice: voiceName,
      }, { responseType: "blob", timeout: 15000 });
      const url = URL.createObjectURL(r.data);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingVoice(voiceName);
      setPreviewLoading(null);
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url); };
      audio.play();
    } catch {
      setPreviewLoading(null);
      setPlayingVoice(null);
    }
  };

  useEffect(() => { return () => stopPreview(); }, []);

  if (!open) return null;

  // Build display data
  let languages = [];
  if (allVoices?.languages) {
    languages = allVoices.languages;
  } else {
    // Fallback to hardcoded
    languages = Object.entries(FALLBACK_VOICES).map(([code, lang]) => ({
      code,
      male: lang.male.map(v => ({ id: v.id, name: v.name, voice: v.code, locale: "" })),
      female: lang.female.map(v => ({ id: v.id, name: v.name, voice: v.code, locale: "" })),
    }));
  }

  // Search filter
  const searchLower = search.toLowerCase();
  const filtered = searchLower
    ? languages.filter(lang => {
        const langName = (LANG_NAMES[lang.code] || lang.code).toLowerCase();
        if (langName.includes(searchLower) || lang.code.includes(searchLower)) return true;
        const allV = [...(lang.male || []), ...(lang.female || [])];
        return allV.some(v => v.name.toLowerCase().includes(searchLower) || v.voice.toLowerCase().includes(searchLower));
      })
    : languages;

  // Add Khmer MMS voices at the top of km section
  const khmerMMS = [
    { id: "mms_khmer", name: "Meta AI (Boy)", voice: "mms-tts-khm", isMMS: true },
    { id: "mms_khmer_f", name: "Meta AI (Girl)", voice: "mms-tts-khm-f", isMMS: true },
  ];

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
              <h2 className={`font-semibold text-base ${d ? 'text-white' : 'text-zinc-950'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
                Voice Picker
              </h2>
              {actorName && (
                <span className={`text-xs px-2 py-0.5 rounded-sm ${d ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`} data-testid="voice-picker-actor-name">
                  for {actorName}
                </span>
              )}
            </div>
            <button onClick={onClose} data-testid="voice-picker-close" className={`p-1.5 rounded-sm transition-colors ${d ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className={`px-5 py-3 border-b ${d ? 'border-zinc-700' : 'border-black/10'}`}>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-sm border ${d ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-black/10'}`}>
              <MagnifyingGlass className={`w-4 h-4 ${d ? 'text-zinc-500' : 'text-zinc-400'}`} />
              <input
                data-testid="voice-search-input"
                type="text"
                placeholder="Search language or voice name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`bg-transparent text-sm flex-1 outline-none ${d ? 'text-white placeholder:text-zinc-500' : 'text-zinc-900 placeholder:text-zinc-400'}`}
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-zinc-400 hover:text-zinc-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className={`text-[10px] ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {allVoices ? `${allVoices.total_voices} voices, ${allVoices.total_languages} languages` : 'Loading...'}
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${d ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                Open Source
              </span>
            </div>
          </div>

          {/* Voice List */}
          <div className="flex-1 overflow-y-auto px-5 py-3" style={{ maxHeight: '50vh' }}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className={`animate-spin w-6 h-6 border-2 border-t-transparent rounded-full ${d ? 'border-emerald-400' : 'border-emerald-600'}`} />
                <span className={`ml-3 text-sm ${d ? 'text-zinc-400' : 'text-zinc-500'}`}>Loading all voices...</span>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map(lang => {
                  const langName = LANG_NAMES[lang.code] || lang.code.toUpperCase();
                  const isExpanded = expandedLang === lang.code || !!searchLower;
                  const maleVoices = lang.male || [];
                  const femaleVoices = lang.female || [];
                  const totalCount = maleVoices.length + femaleVoices.length;
                  
                  // Inject MMS voices for Khmer
                  const extraMale = lang.code === "km" ? khmerMMS.filter(v => v.id === "mms_khmer") : [];
                  const extraFemale = lang.code === "km" ? khmerMMS.filter(v => v.id === "mms_khmer_f") : [];

                  return (
                    <div key={lang.code}>
                      <button
                        data-testid={`lang-toggle-${lang.code}`}
                        onClick={() => setExpandedLang(isExpanded && !searchLower ? null : lang.code)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-sm transition-colors ${
                          d ? 'hover:bg-zinc-800' : 'hover:bg-zinc-50'
                        } ${isExpanded ? (d ? 'bg-zinc-800' : 'bg-zinc-50') : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <Globe className={`w-3.5 h-3.5 ${d ? 'text-zinc-500' : 'text-zinc-400'}`} />
                          <span className={`text-xs font-bold uppercase tracking-wider ${d ? 'text-zinc-300' : 'text-zinc-700'}`}>
                            {langName}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${d ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-200 text-zinc-500'}`}>
                            {totalCount + (lang.code === "km" ? 2 : 0)}
                          </span>
                        </div>
                        <CaretDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''} ${d ? 'text-zinc-500' : 'text-zinc-400'}`} />
                      </button>
                      
                      {isExpanded && (
                        <div className="grid grid-cols-2 gap-1.5 px-2 py-2">
                          {/* MMS voices first for Khmer */}
                          {extraMale.map(v => (
                            <VoiceButton key={v.id} voice={v} isMale d={d}
                              isPlaying={playingVoice === v.voice} isLoading={previewLoading === v.voice}
                              onSelect={() => onSelect({ provider: "mms", voiceId: v.id, voiceName: v.name, gender: "male" })}
                              onPreview={() => {}} isMMS />
                          ))}
                          {extraFemale.map(v => (
                            <VoiceButton key={v.id} voice={v} isMale={false} d={d}
                              isPlaying={playingVoice === v.voice} isLoading={previewLoading === v.voice}
                              onSelect={() => onSelect({ provider: "mms", voiceId: v.id, voiceName: v.name, gender: "female" })}
                              onPreview={() => {}} isMMS />
                          ))}
                          {/* Regular Edge voices */}
                          {[...maleVoices, ...femaleVoices].map(voice => {
                            const isMale = maleVoices.includes(voice);
                            return (
                              <VoiceButton key={voice.voice} voice={voice} isMale={isMale} d={d}
                                isPlaying={playingVoice === voice.voice} isLoading={previewLoading === voice.voice}
                                onSelect={() => onSelect({ provider: "edge", voiceId: voice.voice, voiceName: voice.name, gender: isMale ? "male" : "female" })}
                                onPreview={() => previewVoice(voice.voice)} />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className={`text-center py-8 text-sm ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    No voices found for "{search}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`px-5 py-3 border-t flex items-center justify-between ${d ? 'border-zinc-700' : 'border-black/10'}`}>
            <p className={`text-[10px] ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Open source voices - All languages
            </p>
            <button onClick={onClose} data-testid="voice-picker-cancel" className={`px-4 py-1.5 text-xs font-semibold rounded-sm transition-colors ${d ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200'}`}>
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Single voice button component
const VoiceButton = ({ voice, isMale, d, isPlaying, isLoading, onSelect, onPreview, isMMS }) => (
  <div className={`flex items-center gap-1.5 px-2.5 py-2 rounded-sm border text-left transition-all group ${
    d ? 'bg-zinc-800 border-zinc-700 hover:border-zinc-500' : 'bg-white border-black/10 hover:border-zinc-400'
  }`}>
    {isMale
      ? <GenderMale className="w-3 h-3 text-blue-500 shrink-0" weight="bold" />
      : <GenderFemale className="w-3 h-3 text-pink-500 shrink-0" weight="bold" />}
    <button
      data-testid={`voice-select-${voice.id || voice.voice}`}
      onClick={onSelect}
      className={`text-[11px] font-medium flex-1 truncate text-left ${d ? 'text-zinc-200' : 'text-zinc-700'}`}
      title={voice.voice}
    >
      {voice.name}
    </button>
    {isMMS ? (
      <span className="text-[9px] text-cyan-500 font-bold shrink-0">AI</span>
    ) : (
      <>
        <button
          data-testid={`voice-preview-${voice.voice}`}
          onClick={e => { e.stopPropagation(); onPreview(); }}
          className={`p-1 rounded transition-colors shrink-0 ${
            isPlaying ? (d ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-500')
              : (d ? 'hover:bg-zinc-700 text-zinc-500' : 'hover:bg-zinc-100 text-zinc-400')
          }`}
          title="Preview"
        >
          {isLoading ? (
            <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <Stop className="w-3 h-3" weight="fill" />
          ) : (
            <Play className="w-3 h-3" weight="fill" />
          )}
        </button>
        <span className="text-[8px] text-emerald-500 font-bold shrink-0">EDGE</span>
      </>
    )}
  </div>
);

export default VoicePickerModal;
