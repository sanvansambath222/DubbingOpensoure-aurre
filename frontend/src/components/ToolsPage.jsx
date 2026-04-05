import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Subtitles, Translate, Scissors, FilmSlate, SpeakerHigh,
  ArrowsOut, ArrowsClockwise, ArrowLeft, UploadSimple, DownloadSimple,
  SpinnerGap, MicrophoneStage, Waveform, Image as ImageIcon,
  CloudArrowUp, File, FileAudio, FileVideo, X, Check, Info, CaretDown,
  Lightning, Play, ArrowRight, Eraser
} from "@phosphor-icons/react";
import { useAuth, ThemeToggle } from "./AuthContext";
import { API } from "./constants";
import axios from "axios";
import { toast } from "sonner";

const LANG_NAMES = {
  km: "Khmer", en: "English", zh: "Chinese", ja: "Japanese", ko: "Korean", th: "Thai",
  vi: "Vietnamese", es: "Spanish", fr: "French", de: "German", hi: "Hindi", id: "Indonesian",
  pt: "Portuguese", ru: "Russian", ar: "Arabic", it: "Italian", ms: "Malay", lo: "Lao",
  my: "Myanmar", tl: "Filipino", nl: "Dutch", pl: "Polish", tr: "Turkish", sv: "Swedish",
  da: "Danish", fi: "Finnish", nb: "Norwegian", cs: "Czech", el: "Greek", he: "Hebrew",
  hu: "Hungarian", ro: "Romanian", sk: "Slovak", uk: "Ukrainian", bg: "Bulgarian",
  hr: "Croatian", lt: "Lithuanian", lv: "Latvian", et: "Estonian", sl: "Slovenian",
  sr: "Serbian", ca: "Catalan", ta: "Tamil", te: "Telugu", bn: "Bengali", gu: "Gujarati",
  kn: "Kannada", ml: "Malayalam", mr: "Marathi", pa: "Punjabi", ur: "Urdu", fa: "Persian",
  sw: "Swahili", am: "Amharic", ne: "Nepali", si: "Sinhala", af: "Afrikaans", cy: "Welsh",
  ga: "Irish", is: "Icelandic", mk: "Macedonian", bs: "Bosnian", sq: "Albanian",
  az: "Azerbaijani", ka: "Georgian", hy: "Armenian", uz: "Uzbek", kk: "Kazakh",
  mn: "Mongolian", ps: "Pashto", so: "Somali", zu: "Zulu", jv: "Javanese",
  su: "Sundanese", fil: "Filipino", wuu: "Wu Chinese", yue: "Cantonese",
};

const TOOLS = [
  { id: "voice-replace", name: "Voice Replace", desc: "AI-powered voice removal, transcription & new voice generation", icon: Waveform, accent: "cyan", tag: "AI", span: "md:col-span-2 md:row-span-2" },
  { id: "subtitles", name: "Add Subtitles", desc: "Burn professional subtitles into any video with custom styling", icon: Subtitles, accent: "violet", tag: null, span: "md:col-span-2" },
  { id: "translate", name: "Translate", desc: "AI translation for text & SRT files", icon: Translate, accent: "sky", tag: "AI", span: "" },
  { id: "trim", name: "Trim Video", desc: "Precise time-based video cutting", icon: Scissors, accent: "amber", tag: null, span: "" },
  { id: "ai-clips", name: "AI Clips", desc: "Automatically generate viral short clips from long videos", icon: FilmSlate, accent: "teal", tag: "AI", span: "md:col-span-2" },
  { id: "tts", name: "Text to Speech", desc: "322+ voices across 75 languages", icon: SpeakerHigh, accent: "emerald", tag: null, span: "" },
  { id: "resize", name: "Resize Video", desc: "TikTok, Reels, YouTube formats", icon: ArrowsOut, accent: "blue", tag: null, span: "" },
  { id: "convert", name: "Convert", desc: "MP4, MOV, AVI, MP3, WAV and more format conversions", icon: ArrowsClockwise, accent: "orange", tag: null, span: "md:col-span-2" },
  { id: "add-logo", name: "Add Logo", desc: "Drag & drop watermark overlay with position control", icon: ImageIcon, accent: "pink", tag: null, span: "md:col-span-2" },
  { id: "remove-logo", name: "Remove Logo", desc: "AI-powered logo & watermark removal from any video", icon: Eraser, accent: "rose", tag: "AI", span: "" },
];

// Accent color system
const AC = {
  cyan:    { bg: "bg-cyan-500",    bg10: "bg-cyan-500/10",    bg20: "bg-cyan-500/20",    text: "text-cyan-400",    textL: "text-cyan-600",    border: "border-cyan-500/20",    ring: "ring-cyan-500/30",    gradient: "from-cyan-500 to-cyan-600" },
  violet:  { bg: "bg-violet-500",  bg10: "bg-violet-500/10",  bg20: "bg-violet-500/20",  text: "text-violet-400",  textL: "text-violet-600",  border: "border-violet-500/20",  ring: "ring-violet-500/30",  gradient: "from-violet-500 to-purple-600" },
  sky:     { bg: "bg-sky-500",     bg10: "bg-sky-500/10",     bg20: "bg-sky-500/20",     text: "text-sky-400",     textL: "text-sky-600",     border: "border-sky-500/20",     ring: "ring-sky-500/30",     gradient: "from-sky-500 to-blue-600" },
  amber:   { bg: "bg-amber-500",   bg10: "bg-amber-500/10",   bg20: "bg-amber-500/20",   text: "text-amber-400",   textL: "text-amber-600",   border: "border-amber-500/20",   ring: "ring-amber-500/30",   gradient: "from-amber-500 to-orange-600" },
  teal:    { bg: "bg-teal-500",    bg10: "bg-teal-500/10",    bg20: "bg-teal-500/20",    text: "text-teal-400",    textL: "text-teal-600",    border: "border-teal-500/20",    ring: "ring-teal-500/30",    gradient: "from-teal-500 to-cyan-600" },
  emerald: { bg: "bg-emerald-500", bg10: "bg-emerald-500/10", bg20: "bg-emerald-500/20", text: "text-emerald-400", textL: "text-emerald-600", border: "border-emerald-500/20", ring: "ring-emerald-500/30", gradient: "from-emerald-500 to-green-600" },
  blue:    { bg: "bg-blue-500",    bg10: "bg-blue-500/10",    bg20: "bg-blue-500/20",    text: "text-blue-400",    textL: "text-blue-600",    border: "border-blue-500/20",    ring: "ring-blue-500/30",    gradient: "from-blue-500 to-indigo-600" },
  orange:  { bg: "bg-orange-500",  bg10: "bg-orange-500/10",  bg20: "bg-orange-500/20",  text: "text-orange-400",  textL: "text-orange-600",  border: "border-orange-500/20",  ring: "ring-orange-500/30",  gradient: "from-orange-500 to-red-600" },
  pink:    { bg: "bg-pink-500",    bg10: "bg-pink-500/10",    bg20: "bg-pink-500/20",    text: "text-pink-400",    textL: "text-pink-600",    border: "border-pink-500/20",    ring: "ring-pink-500/30",    gradient: "from-pink-500 to-rose-600" },
  rose:    { bg: "bg-rose-500",    bg10: "bg-rose-500/10",    bg20: "bg-rose-500/20",    text: "text-rose-400",    textL: "text-rose-600",    border: "border-rose-500/20",    ring: "ring-rose-500/30",    gradient: "from-rose-500 to-red-600" },
};

// --- Shared UI Components ---

const DropZone = ({ accept, label, icon: Icon, file, onFile, d }) => {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  const onDrop = useCallback((e) => { e.preventDefault(); setDragging(false); if(e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }, [onFile]);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => ref.current?.click()}
      className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200
        ${dragging ? (d?'border-cyan-400/60 bg-cyan-500/5':'border-cyan-500/60 bg-cyan-50') 
        : file ? (d?'border-emerald-500/40 bg-emerald-500/5':'border-emerald-400/60 bg-emerald-50/50') 
        : (d?'border-zinc-700/80 hover:border-zinc-500/80 bg-zinc-800/30':'border-zinc-300 hover:border-zinc-400 bg-zinc-50/50')}`}
      data-testid={`drop-${label.toLowerCase().replace(/\s/g,'-')}`}
    >
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { if(e.target.files[0]) onFile(e.target.files[0]); }} />
      {file ? (
        <div className="flex items-center justify-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d?'bg-emerald-500/10':'bg-emerald-100'}`}>
            <Check className="w-4 h-4 text-emerald-500" weight="bold" />
          </div>
          <span className={`text-sm font-medium truncate max-w-[240px] ${d?'text-emerald-400':'text-emerald-700'}`}>{file.name}</span>
          <button onClick={(e) => { e.stopPropagation(); onFile(null); }} className={`ml-1 p-1 rounded-lg transition-colors ${d?'hover:bg-red-500/10':'hover:bg-red-50'}`}>
            <X className="w-3.5 h-3.5 text-zinc-400 hover:text-red-400" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${d?'bg-zinc-700/50':'bg-zinc-200/60'}`}>
            <Icon className={`w-5 h-5 ${d?'text-zinc-400':'text-zinc-500'}`} weight="duotone" />
          </div>
          <span className={`text-sm font-medium ${d?'text-zinc-300':'text-zinc-600'}`}>{label}</span>
          <span className={`text-xs ${d?'text-zinc-600':'text-zinc-400'}`}>Click or drag file here</span>
        </div>
      )}
    </div>
  );
};

const Select = ({ label, value, onChange, options, d }) => (
  <div>
    {label && <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>{label}</label>}
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`w-full text-sm p-3 pr-9 rounded-xl border appearance-none transition-all duration-200 focus:ring-2 
          ${d?'bg-zinc-800/80 border-zinc-700/80 text-white hover:border-zinc-600 focus:border-zinc-500 focus:ring-white/5'
            :'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400 focus:border-zinc-500 focus:ring-zinc-200'} outline-none`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <CaretDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${d?'text-zinc-500':'text-zinc-400'}`} />
    </div>
  </div>
);

const ProcessBtn = ({ onClick, processing, label, procLabel, color, d }) => (
  <button onClick={onClick} disabled={processing} data-testid={`process-btn-${label.toLowerCase().replace(/\s/g,'-')}`}
    className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 active:scale-[0.98] shadow-lg
      ${d ? 'bg-white text-zinc-950 hover:bg-zinc-100 shadow-white/5' 
          : `bg-gradient-to-r ${color} text-white hover:shadow-xl`}`}>
    {processing ? <><SpinnerGap className="w-4 h-4 animate-spin" />{procLabel || "Processing..."}</> : <><Lightning className="w-4 h-4" weight="fill" />{label}</>}
  </button>
);

const DownloadBtn = ({ url, label, d }) => (
  <a href={url.startsWith("http") ? url : `${API.replace('/api','')}${url}`} download
    className={`block w-full py-3 rounded-xl text-sm font-bold text-center transition-all duration-200 shadow-md
      ${d?'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20':'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'}`} data-testid="download-btn">
    <DownloadSimple className="w-4 h-4 inline mr-2" weight="bold" />{label || "Download"}
  </a>
);

// ---- Voice Replace Tool ----
const VoiceReplaceTool = ({ token, d }) => {
  const [video, setVideo] = useState(null);
  const [extraText, setExtraText] = useState("");
  const [voice, setVoice] = useState("dara");
  const [targetLang, setTargetLang] = useState("km");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [allVoices, setAllVoices] = useState([]);
  const [voiceSearch, setVoiceSearch] = useState("");

  useEffect(() => {
    axios.get(`${API}/edge-voices`).then(r => {
      const flat = [];
      flat.push({ value: "mms_khmer", label: "Meta AI (Boy) - Khmer" });
      flat.push({ value: "mms_khmer_f", label: "Meta AI (Girl) - Khmer" });
      flat.push({ value: "dara", label: "Piseth (Boy) - Khmer" });
      flat.push({ value: "sophea", label: "Sreymom (Girl) - Khmer" });
      for (const lang of (r.data.languages || [])) {
        if (lang.code === "km") continue;
        const langName = LANG_NAMES[lang.code] || lang.code.toUpperCase();
        for (const v of [...(lang.male || []), ...(lang.female || [])]) {
          flat.push({ value: v.voice, label: `${v.name} - ${langName}` });
        }
      }
      setAllVoices(flat);
    }).catch(() => {
      setAllVoices([
        { value: "dara", label: "Piseth (Boy) - Khmer" },
        { value: "sophea", label: "Sreymom (Girl) - Khmer" },
        { value: "mms_khmer", label: "Meta AI (Boy) - Khmer" },
        { value: "mms_khmer_f", label: "Meta AI (Girl) - Khmer" },
      ]);
    });
  }, []);

  const filteredVoices = voiceSearch
    ? allVoices.filter(v => v.label.toLowerCase().includes(voiceSearch.toLowerCase()))
    : allVoices.slice(0, 50);

  const handleProcess = async () => {
    if (!video) return toast.error("Upload a video or audio file");
    setProcessing(true); setProgress("Uploading...");
    try {
      const fd = new FormData();
      fd.append("video", video);
      fd.append("extra_text", extraText);
      fd.append("voice", voice);
      fd.append("target_language", targetLang);
      const r = await axios.post(`${API}/tools/voice-replace`, fd, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 600000,
        onUploadProgress: (p) => { if(p.loaded === p.total) setProgress("Processing... (this may take 1-3 min)"); }
      });
      setResult(r.data.download_url);
      toast.success("Voice replaced!");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setProcessing(false); setProgress(""); }
  };

  return (
    <div className="space-y-5">
      <DropZone accept="video/*,audio/*" label="Upload Video or Audio" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <div>
        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Extra Text (optional)</label>
        <textarea value={extraText} onChange={e => setExtraText(e.target.value)} rows={3}
          placeholder="Add text to include after transcription..."
          className={`w-full text-sm p-3.5 rounded-xl border resize-none transition-all duration-200 focus:ring-2
            ${d?'bg-zinc-800/80 border-zinc-700/80 text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-white/5'
              :'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-zinc-200'} outline-none`}
          data-testid="voice-replace-extra-text" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Voice</label>
          <input type="text" placeholder="Search voices..." value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)}
            className={`w-full text-xs p-2.5 rounded-xl border mb-2 transition-all duration-200 focus:ring-2
              ${d?'bg-zinc-800/80 border-zinc-700/80 text-white placeholder:text-zinc-600 focus:ring-white/5'
                :'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:ring-zinc-200'} outline-none`} />
          <select value={voice} onChange={e => setVoice(e.target.value)}
            className={`w-full text-xs p-2.5 rounded-xl border transition-all duration-200
              ${d?'bg-zinc-800/80 border-zinc-700/80 text-white':'bg-white border-zinc-300 text-zinc-900'} outline-none`}>
            {filteredVoices.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <Select label="Language" value={targetLang} onChange={setTargetLang} options={[
          {value:"km",label:"Khmer"},{value:"en",label:"English"},{value:"zh",label:"Chinese"},{value:"th",label:"Thai"},{value:"vi",label:"Vietnamese"},{value:"ko",label:"Korean"},{value:"ja",label:"Japanese"}
        ]} d={d} />
      </div>
      {progress && <div className={`text-xs text-center py-2 rounded-lg ${d?'text-cyan-400 bg-cyan-500/5':'text-cyan-600 bg-cyan-50'}`}>{progress}</div>}
      <ProcessBtn onClick={handleProcess} processing={processing} label="Replace Voice" procLabel={progress || "Processing..."} color="from-cyan-500 to-cyan-600" d={d} />
      {result && <DownloadBtn url={result} label="Download Result" d={d} />}
    </div>
  );
};

// ---- Subtitles Tool ----
const SubtitlesTool = ({ token, d }) => {
  const [video, setVideo] = useState(null);
  const [srt, setSrt] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, setFontColor] = useState("white");
  const [position, setPosition] = useState("bottom");

  const handleProcess = async () => {
    if (!video || !srt) return toast.error("Upload video and SRT file");
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("video", video); fd.append("srt", srt);
      fd.append("font_size", fontSize); fd.append("font_color", fontColor); fd.append("position", position);
      const r = await axios.post(`${API}/tools/add-subtitles`, fd, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 });
      setResult(r.data.download_url);
      toast.success("Subtitles added!");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setProcessing(false); }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={setVideo} d={d} />
        <DropZone accept=".srt,.vtt,.ass" label="Upload SRT Subtitle" icon={File} file={srt} onFile={setSrt} d={d} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Font Size</label>
          <input type="number" value={fontSize} onChange={e => setFontSize(e.target.value)} min={12} max={72}
            className={`w-full text-sm p-3 rounded-xl border transition-all duration-200 focus:ring-2
              ${d?'bg-zinc-800/80 border-zinc-700/80 text-white focus:ring-white/5':'bg-white border-zinc-300 text-zinc-900 focus:ring-zinc-200'} outline-none`} />
        </div>
        <Select label="Color" value={fontColor} onChange={setFontColor} options={[
          {value:"white",label:"White"},{value:"yellow",label:"Yellow"},{value:"green",label:"Green"},{value:"cyan",label:"Cyan"}
        ]} d={d} />
        <Select label="Position" value={position} onChange={setPosition} options={[
          {value:"bottom",label:"Bottom"},{value:"top",label:"Top"},{value:"center",label:"Center"}
        ]} d={d} />
      </div>
      <ProcessBtn onClick={handleProcess} processing={processing} label="Burn Subtitles" color="from-violet-500 to-purple-600" d={d} />
      {result && <DownloadBtn url={result} label="Download Video" d={d} />}
    </div>
  );
};

// ---- Translate Tool ----
const TranslateTool = ({ token, d }) => {
  const [srt, setSrt] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [targetLang, setTargetLang] = useState("km");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [translated, setTranslated] = useState("");

  const langs = [
    {value:"km",label:"Khmer"},{value:"en",label:"English"},{value:"zh",label:"Chinese"},{value:"th",label:"Thai"},
    {value:"vi",label:"Vietnamese"},{value:"ko",label:"Korean"},{value:"ja",label:"Japanese"},{value:"es",label:"Spanish"},
    {value:"fr",label:"French"},{value:"de",label:"German"},{value:"pt",label:"Portuguese"},{value:"ru",label:"Russian"},
    {value:"ar",label:"Arabic"},{value:"id",label:"Indonesian"},{value:"hi",label:"Hindi"},{value:"ms",label:"Malay"},
    {value:"lo",label:"Lao"},{value:"my",label:"Burmese"},{value:"it",label:"Italian"},{value:"tl",label:"Filipino"}
  ];

  const handleTranslate = async () => {
    if (!srt && !textInput.trim()) return toast.error("Upload SRT or type text");
    setProcessing(true);
    try {
      if (srt) {
        const fd = new FormData();
        fd.append("srt", srt); fd.append("target_language", targetLang);
        const r = await axios.post(`${API}/tools/translate-srt`, fd, { headers: { Authorization: `Bearer ${token}` }, timeout: 300000 });
        setResult(r.data.download_url);
        toast.success("SRT translated!");
      } else {
        const r = await axios.post(`${API}/tools/translate-text`, { text: textInput, target_language: targetLang },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 60000 });
        setTranslated(r.data.translated);
        toast.success("Translated!");
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setProcessing(false); }
  };

  return (
    <div className="space-y-5">
      <DropZone accept=".srt" label="Upload SRT File (optional)" icon={File} file={srt} onFile={setSrt} d={d} />
      <div className={`flex items-center gap-3 ${d?'text-zinc-600':'text-zinc-300'}`}>
        <div className="flex-1 h-px bg-current" /><span className={`text-[10px] uppercase tracking-[0.2em] font-bold ${d?'text-zinc-500':'text-zinc-400'}`}>or type text</span><div className="flex-1 h-px bg-current" />
      </div>
      <textarea value={textInput} onChange={e => setTextInput(e.target.value)} rows={3} placeholder="Type text to translate..."
        className={`w-full text-sm p-3.5 rounded-xl border resize-none transition-all duration-200 focus:ring-2
          ${d?'bg-zinc-800/80 border-zinc-700/80 text-white placeholder:text-zinc-600 focus:ring-white/5'
            :'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:ring-zinc-200'} outline-none`} data-testid="translate-text-input" />
      <Select label="Target Language" value={targetLang} onChange={setTargetLang} options={langs} d={d} />
      <ProcessBtn onClick={handleTranslate} processing={processing} label="Translate" color="from-sky-500 to-blue-600" d={d} />
      {translated && (
        <div className={`p-4 rounded-xl border text-sm leading-relaxed ${d?'bg-zinc-800/60 border-zinc-700/50 text-zinc-200':'bg-sky-50 border-sky-200 text-zinc-800'}`} data-testid="translate-result">
          {translated}
        </div>
      )}
      {result && <DownloadBtn url={result} label="Download SRT" d={d} />}
    </div>
  );
};

// ---- Trim Tool ----
const TrimTool = ({ token, d }) => {
  const [video, setVideo] = useState(null);
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("00:00:30");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  const handleTrim = async () => {
    if (!video) return toast.error("Upload a video");
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("video", video); fd.append("start_time", startTime); fd.append("end_time", endTime);
      const r = await axios.post(`${API}/tools/trim-video`, fd, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 });
      setResult(r.data.download_url);
      toast.success("Video trimmed!");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setProcessing(false); }
  };

  const TimeInput = ({ label, value, onChange }) => (
    <div>
      <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="HH:MM:SS"
        className={`w-full text-sm p-3 rounded-xl border font-mono tracking-widest transition-all duration-200 focus:ring-2
          ${d?'bg-zinc-800/80 border-zinc-700/80 text-white focus:ring-white/5':'bg-white border-zinc-300 text-zinc-900 focus:ring-zinc-200'} outline-none`} />
    </div>
  );

  return (
    <div className="space-y-5">
      <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <div className="grid grid-cols-2 gap-4">
        <TimeInput label="Start Time" value={startTime} onChange={setStartTime} />
        <TimeInput label="End Time" value={endTime} onChange={setEndTime} />
      </div>
      <ProcessBtn onClick={handleTrim} processing={processing} label="Trim Video" color="from-amber-500 to-orange-600" d={d} />
      {result && <DownloadBtn url={result} label="Download Trimmed" d={d} />}
    </div>
  );
};

// ---- AI Clips Tool ----
const AIClipsTool = ({ token, d }) => {
  const [video, setVideo] = useState(null);
  const [clipCount, setClipCount] = useState(3);
  const [clipDuration, setClipDuration] = useState(30);
  const [processing, setProcessing] = useState(false);
  const [clips, setClips] = useState([]);

  const handleProcess = async () => {
    if (!video) return toast.error("Upload a video");
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("video", video); fd.append("clip_count", clipCount); fd.append("clip_duration", clipDuration);
      const r = await axios.post(`${API}/tools/ai-clips`, fd, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 });
      setClips(r.data.clips || []);
      toast.success(`${r.data.clips?.length || 0} clips created!`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setProcessing(false); }
  };

  return (
    <div className="space-y-5">
      <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Number of Clips</label>
          <input type="number" value={clipCount} onChange={e => setClipCount(e.target.value)} min={1} max={10}
            className={`w-full text-sm p-3 rounded-xl border transition-all duration-200 focus:ring-2
              ${d?'bg-zinc-800/80 border-zinc-700/80 text-white focus:ring-white/5':'bg-white border-zinc-300 text-zinc-900 focus:ring-zinc-200'} outline-none`} />
        </div>
        <div>
          <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Duration (sec)</label>
          <input type="number" value={clipDuration} onChange={e => setClipDuration(e.target.value)} min={5} max={120}
            className={`w-full text-sm p-3 rounded-xl border transition-all duration-200 focus:ring-2
              ${d?'bg-zinc-800/80 border-zinc-700/80 text-white focus:ring-white/5':'bg-white border-zinc-300 text-zinc-900 focus:ring-zinc-200'} outline-none`} />
        </div>
      </div>
      <ProcessBtn onClick={handleProcess} processing={processing} label="Create AI Clips" procLabel="Analyzing video..." color="from-teal-500 to-cyan-600" d={d} />
      {clips.length > 0 && <div className="space-y-2">{clips.map((c, i) => (
        <DownloadBtn key={i} url={c.url} label={`Clip ${i+1} (${c.start}s - ${c.end}s)`} d={d} />
      ))}</div>}
    </div>
  );
};

// ---- TTS Tool ----
const TTSTool = ({ token, d }) => {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("dara");
  const [speed, setSpeed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [langGroups, setLangGroups] = useState([]);
  const [selectedLang, setSelectedLang] = useState("km");

  useEffect(() => {
    axios.get(`${API}/edge-voices`).then(r => {
      const groups = [];
      // Khmer first
      groups.push({
        code: "km", name: "Khmer",
        voices: [
          { value: "dara", label: "Piseth (Boy)" },
          { value: "sophea", label: "Sreymom (Girl)" },
          { value: "mms_khmer", label: "Meta AI (Boy)" },
          { value: "mms_khmer_f", label: "Meta AI (Girl)" },
        ]
      });
      for (const lang of (r.data.languages || [])) {
        if (lang.code === "km") continue;
        const langName = LANG_NAMES[lang.code] || lang.code.toUpperCase();
        const voices = [];
        for (const v of [...(lang.male || []), ...(lang.female || [])]) {
          voices.push({ value: v.voice, label: v.name });
        }
        if (voices.length > 0) {
          groups.push({ code: lang.code, name: langName, voices });
        }
      }
      setLangGroups(groups);
    }).catch(() => {
      setLangGroups([{
        code: "km", name: "Khmer",
        voices: [
          { value: "dara", label: "Piseth (Boy)" },
          { value: "sophea", label: "Sreymom (Girl)" },
          { value: "mms_khmer", label: "Meta AI (Boy)" },
        ]
      }]);
    });
  }, []);

  const currentLangGroup = langGroups.find(g => g.code === selectedLang);
  const currentVoices = currentLangGroup?.voices || [];

  // Auto-select first voice when language changes
  const handleLangChange = (code) => {
    setSelectedLang(code);
    const group = langGroups.find(g => g.code === code);
    if (group?.voices?.length) setVoice(group.voices[0].value);
  };

  const handleGenerate = async () => {
    if (!text.trim()) return toast.error("Type some text");
    setProcessing(true);
    try {
      const r = await axios.post(`${API}/tools/text-to-speech`, { text, voice, speed },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, responseType: 'blob', timeout: 60000 });
      setAudioUrl(URL.createObjectURL(r.data));
      toast.success("Audio generated!");
    } catch (e) { toast.error("TTS failed"); }
    finally { setProcessing(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Text</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Type text here..."
          className={`w-full text-sm p-3.5 rounded-xl border resize-none transition-all duration-200 focus:ring-2
            ${d?'bg-zinc-800/80 border-zinc-700/80 text-white placeholder:text-zinc-600 focus:ring-white/5'
              :'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:ring-zinc-200'} outline-none`} data-testid="tts-text-input" />
      </div>

      {/* Language picker */}
      <div>
        <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Language</label>
        <div className="flex flex-wrap gap-1.5" data-testid="tts-language-picker">
          {langGroups.slice(0, 20).map(g => (
            <button key={g.code} onClick={() => handleLangChange(g.code)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                ${selectedLang === g.code
                  ? (d ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20')
                  : (d ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')
                }`}>
              {g.name} <span className={`text-[10px] ml-0.5 ${selectedLang === g.code ? 'text-emerald-100' : d ? 'text-zinc-600' : 'text-zinc-400'}`}>({g.voices.length})</span>
            </button>
          ))}
          {langGroups.length > 20 && (
            <select onChange={e => { if(e.target.value) handleLangChange(e.target.value); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                ${d ? 'bg-zinc-800 text-zinc-400 border-none' : 'bg-zinc-100 text-zinc-600 border-none'} outline-none`}>
              <option value="">More languages...</option>
              {langGroups.slice(20).map(g => (
                <option key={g.code} value={g.code}>{g.name} ({g.voices.length})</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Voice select */}
        <div>
          <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>
            Voice {currentLangGroup ? `(${currentLangGroup.name})` : ''}
          </label>
          <div className="space-y-1.5" data-testid="tts-voice-list">
            {currentVoices.map(v => (
              <button key={v.value} onClick={() => setVoice(v.value)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200
                  ${voice === v.value
                    ? (d ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-300')
                    : (d ? 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600' : 'bg-zinc-50 text-zinc-600 border border-zinc-200 hover:border-zinc-300')
                  }`}>
                {voice === v.value && <Check className="w-3 h-3 inline mr-1.5" weight="bold" />}
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Speed */}
        <div>
          <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Speed: {speed >= 0 ? '+' : ''}{speed}%</label>
          <input type="range" min={-50} max={50} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="w-full mt-3 accent-emerald-500" />
        </div>
      </div>

      <ProcessBtn onClick={handleGenerate} processing={processing} label="Generate Speech" color="from-emerald-500 to-green-600" d={d} />
      {audioUrl && (
        <div className="space-y-3">
          <audio controls src={audioUrl} className="w-full rounded-xl" data-testid="tts-audio-player" />
          <a href={audioUrl} download="speech.wav"
            className={`block w-full py-3 rounded-xl text-sm font-bold text-center transition-all shadow-md
              ${d?'bg-emerald-500 hover:bg-emerald-400 text-white':'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
            <DownloadSimple className="w-4 h-4 inline mr-2" weight="bold" />Download Audio
          </a>
        </div>
      )}
    </div>
  );
};

// ---- Resize Tool ----
const ResizeTool = ({ token, d }) => {
  const [video, setVideo] = useState(null);
  const [preset, setPreset] = useState("1920:1080");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  const presets = [
    { value: "1920:1080", label: "1920x1080 (16:9 Landscape)" },
    { value: "1080:1920", label: "1080x1920 (9:16 TikTok/Reels)" },
    { value: "1080:1080", label: "1080x1080 (1:1 Square)" },
    { value: "1280:720", label: "1280x720 (HD)" },
    { value: "854:480", label: "854x480 (SD)" },
    { value: "720:1280", label: "720x1280 (9:16 Portrait)" },
  ];

  const handleResize = async () => {
    if (!video) return toast.error("Upload a video");
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("video", video); fd.append("resolution", preset);
      const r = await axios.post(`${API}/tools/resize-video`, fd, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 });
      setResult(r.data.download_url);
      toast.success("Video resized!");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setProcessing(false); }
  };

  return (
    <div className="space-y-5">
      <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <Select label="Target Size" value={preset} onChange={setPreset} options={presets} d={d} />
      <ProcessBtn onClick={handleResize} processing={processing} label="Resize Video" color="from-blue-500 to-indigo-600" d={d} />
      {result && <DownloadBtn url={result} label="Download Resized" d={d} />}
    </div>
  );
};

// ---- Convert Tool ----
const ConvertTool = ({ token, d }) => {
  const [video, setVideo] = useState(null);
  const [format, setFormat] = useState("mp4");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);

  const formats = [
    { value: "mp4", label: "MP4 (Video)" }, { value: "mov", label: "MOV (Video)" },
    { value: "avi", label: "AVI (Video)" }, { value: "webm", label: "WebM (Video)" },
    { value: "mkv", label: "MKV (Video)" }, { value: "mp3", label: "MP3 (Audio)" },
    { value: "wav", label: "WAV (Audio)" },
  ];

  const handleConvert = async () => {
    if (!video) return toast.error("Upload a file");
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("video", video); fd.append("output_format", format);
      const r = await axios.post(`${API}/tools/convert-video`, fd, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 });
      setResult(r.data.download_url);
      toast.success("Converted!");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setProcessing(false); }
  };

  return (
    <div className="space-y-5">
      <DropZone accept="video/*,audio/*" label="Upload Video or Audio" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <Select label="Output Format" value={format} onChange={setFormat} options={formats} d={d} />
      <ProcessBtn onClick={handleConvert} processing={processing} label="Convert" color="from-orange-500 to-red-600" d={d} />
      {result && <DownloadBtn url={result} label="Download" d={d} />}
    </div>
  );
};

// ---- Add Logo Tool ----
const AddLogoTool = ({ token, d }) => {
  const [video, setVideo] = useState(null);
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [logoPos, setLogoPos] = useState({ x: 80, y: 5 });
  const [logoSize, setLogoSize] = useState(15);
  const [opacity, setOpacity] = useState(100);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef(null);

  const onVideoSelect = (f) => { setVideo(f); if (f) { setVideoPreview(URL.createObjectURL(f)); } else { setVideoPreview(null); } };
  const onLogoSelect = (f) => { setLogo(f); if (f) { const r = new FileReader(); r.onload = (e) => setLogoPreview(e.target.result); r.readAsDataURL(f); } else { setLogoPreview(null); } };

  const handleMouseDown = (e) => { e.preventDefault(); setDragging(true); };
  const handleMouseMove = useCallback((e) => {
    if (!dragging || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    setLogoPos({ x: Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))),
                 y: Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))) });
  }, [dragging]);
  const handleMouseUp = useCallback(() => { setDragging(false); }, []);
  const handleTouchMove = useCallback((e) => {
    if (!previewRef.current || !e.touches[0]) return;
    const rect = previewRef.current.getBoundingClientRect();
    setLogoPos({ x: Math.round(Math.max(0, Math.min(100, ((e.touches[0].clientX - rect.left) / rect.width) * 100))),
                 y: Math.round(Math.max(0, Math.min(100, ((e.touches[0].clientY - rect.top) / rect.height) * 100))) });
  }, []);

  const handleProcess = async () => {
    if (!video || !logo) return toast.error("Upload video and logo image");
    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append("video", video); fd.append("logo", logo);
      fd.append("position_x", logoPos.x); fd.append("position_y", logoPos.y);
      fd.append("logo_size", logoSize); fd.append("opacity", opacity);
      const r = await axios.post(`${API}/tools/add-logo`, fd, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 });
      setResult(r.data.download_url);
      toast.success("Logo added!");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setProcessing(false); }
  };

  const quickPos = (x, y) => setLogoPos({ x, y });

  return (
    <div className="space-y-5" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onTouchMove={handleTouchMove} onTouchEnd={handleMouseUp}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Big Canvas */}
        <div className="lg:col-span-2">
          <div className={`rounded-xl overflow-hidden border ${d?'border-zinc-700/50':'border-zinc-200'}`}>
            <div className={`flex items-center justify-between px-4 py-2.5 ${d?'bg-zinc-800/60':'bg-zinc-100/80'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${d?'text-zinc-400':'text-zinc-500'}`}>Preview Canvas</span>
              <span className={`text-[10px] font-mono ${d?'text-zinc-500':'text-zinc-400'}`}>X:{logoPos.x}% Y:{logoPos.y}%</span>
            </div>
            <div ref={previewRef} className={`relative w-full ${d?'bg-zinc-900':'bg-zinc-950'}`} style={{ aspectRatio: '16/9', cursor: dragging ? 'grabbing' : 'crosshair' }}>
              {videoPreview ? (
                <video src={videoPreview} muted className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <FileVideo className="w-8 h-8 text-zinc-700" />
                  <span className="text-xs text-zinc-600">Upload video to preview</span>
                </div>
              )}
              {logoPreview && (
                <div onMouseDown={handleMouseDown} onTouchStart={handleMouseDown}
                  style={{ position: 'absolute', left: `${logoPos.x}%`, top: `${logoPos.y}%`, transform: 'translate(-50%, -50%)', width: `${logoSize}%`, opacity: opacity / 100, cursor: dragging ? 'grabbing' : 'grab', zIndex: 10, userSelect: 'none', touchAction: 'none' }}
                  data-testid="logo-draggable">
                  <img src={logoPreview} alt="Logo" className="w-full h-auto pointer-events-none" draggable={false} style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }} />
                  <div className={`absolute -inset-1 border-2 border-dashed rounded-sm ${dragging ? 'border-pink-400' : 'border-white/40 hover:border-white/70'} pointer-events-none transition-colors`} />
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
            </div>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="space-y-4">
          <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={onVideoSelect} d={d} />
          <DropZone accept="image/*" label="Upload Logo (PNG)" icon={ImageIcon} file={logo} onFile={onLogoSelect} d={d} />

          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-[0.15em] mb-2 ${d?'text-zinc-400':'text-zinc-500'}`}>Quick Position</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "Top L", x: 8, y: 8 }, { label: "Top C", x: 50, y: 8 }, { label: "Top R", x: 92, y: 8 },
                { label: "Mid L", x: 8, y: 50 }, { label: "Center", x: 50, y: 50 }, { label: "Mid R", x: 92, y: 50 },
                { label: "Bot L", x: 8, y: 92 }, { label: "Bot C", x: 50, y: 92 }, { label: "Bot R", x: 92, y: 92 },
              ].map((p) => (
                <button key={p.label} onClick={() => quickPos(p.x, p.y)}
                  className={`text-[10px] py-1.5 rounded-lg font-medium transition-all ${logoPos.x === p.x && logoPos.y === p.y ? 'bg-pink-500 text-white font-bold shadow-md shadow-pink-500/20' : d ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 ${d?'text-zinc-400':'text-zinc-500'}`}>Size: {logoSize}%</label>
            <input type="range" min={3} max={60} value={logoSize} onChange={e => setLogoSize(Number(e.target.value))} className="w-full accent-pink-500" />
          </div>
          <div>
            <label className={`block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 ${d?'text-zinc-400':'text-zinc-500'}`}>Opacity: {opacity}%</label>
            <input type="range" min={10} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="w-full accent-pink-500" />
          </div>

          <ProcessBtn onClick={handleProcess} processing={processing} label="Add Logo & Download" color="from-pink-500 to-rose-600" d={d} />
          {result && <DownloadBtn url={result} label="Download Video" d={d} />}
        </div>
      </div>
    </div>
  );
};

// ---- Remove Logo Tool ----
const RemoveLogoTool = ({ token, d }) => {
  const [video, setVideo] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [videoDims, setVideoDims] = useState({ w: 1920, h: 1080 });
  const [selection, setSelection] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [mode, setMode] = useState("blur");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  const onVideoSelect = (f) => {
    setVideo(f);
    setResult(null);
    if (f) {
      const url = URL.createObjectURL(f);
      setVideoPreview(url);
      const el = document.createElement('video');
      el.onloadedmetadata = () => { setVideoDims({ w: el.videoWidth || 1920, h: el.videoHeight || 1080 }); };
      el.src = url;
    } else { setVideoPreview(null); }
  };

  const getRelPos = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const pos = getRelPos(e);
    setDrawStart(pos);
    setDrawing(true);
    setSelection({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const onMouseMove = useCallback((e) => {
    if (!drawing || !drawStart) return;
    const pos = getRelPos(e);
    setSelection({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      w: Math.abs(pos.x - drawStart.x),
      h: Math.abs(pos.y - drawStart.y),
    });
  }, [drawing, drawStart]);

  const onMouseUp = useCallback(() => { setDrawing(false); setDrawStart(null); }, []);

  const [telegramSent, setTelegramSent] = useState(false);

  const handleProcess = async () => {
    if (!video) return toast.error("Upload a video first");
    if (selection.w < 1 || selection.h < 1) return toast.error("Draw a box around the logo area");
    setProcessing(true);
    setTelegramSent(false);
    try {
      const fd = new FormData();
      fd.append("video", video);
      fd.append("x", Math.round(selection.x));
      fd.append("y", Math.round(selection.y));
      fd.append("w", Math.round(selection.w));
      fd.append("h", Math.round(selection.h));
      fd.append("mode", mode);
      const r = await axios.post(`${API}/tools/remove-logo`, fd, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000 });
      setResult(r.data.download_url);
      if (r.data.telegram_sent) {
        setTelegramSent(true);
        toast.success("Logo removed! Sent to your Telegram!");
      } else {
        toast.success("Logo removed!");
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to remove logo"); }
    finally { setProcessing(false); }
  };

  return (
    <div className="space-y-6" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onTouchMove={onMouseMove} onTouchEnd={onMouseUp}>
      {/* Step 1: Upload */}
      <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={onVideoSelect} d={d} />

      {/* Step 2: Big Canvas — full width */}
      <div className={`rounded-2xl overflow-hidden border-2 ${d?'border-zinc-700/60':'border-zinc-300'}`}>
        <div className={`flex items-center justify-between px-5 py-3 ${d?'bg-zinc-800/70':'bg-zinc-100'}`}>
          <span className={`text-xs font-bold uppercase tracking-[0.15em] ${d?'text-zinc-300':'text-zinc-600'}`}>
            {videoPreview ? 'Click & drag to select logo area' : 'Upload video first, then draw box around logo'}
          </span>
          <span className={`text-xs font-mono ${d?'text-rose-400':'text-rose-600'}`}>
            {selection.w > 0 ? `${Math.round(selection.x)}%, ${Math.round(selection.y)}%  —  ${Math.round(selection.w)} x ${Math.round(selection.h)}%` : 'No selection'}
          </span>
        </div>
        <div ref={canvasRef}
          onMouseDown={onMouseDown} onTouchStart={onMouseDown}
          className={`relative w-full ${d?'bg-zinc-900':'bg-zinc-950'}`}
          style={{ minHeight: '420px', aspectRatio: '16/9', cursor: 'crosshair', userSelect: 'none', touchAction: 'none' }}>
          {videoPreview ? (
            <video ref={videoRef} src={videoPreview} muted className="w-full h-full object-contain pointer-events-none" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <FileVideo className={`w-16 h-16 ${d?'text-zinc-700':'text-zinc-600'}`} />
              <span className={`text-base ${d?'text-zinc-500':'text-zinc-500'}`}>Upload video to select logo area</span>
              <span className={`text-sm ${d?'text-zinc-600':'text-zinc-400'}`}>Then click & drag a box around the logo</span>
            </div>
          )}
          {selection.w > 0 && selection.h > 0 && (
            <div data-testid="logo-selection-box"
              style={{
                position: 'absolute', left: `${selection.x}%`, top: `${selection.y}%`,
                width: `${selection.w}%`, height: `${selection.h}%`,
                border: '3px dashed #f43f5e', backgroundColor: 'rgba(244,63,94,0.18)',
                pointerEvents: 'none', zIndex: 10, borderRadius: '6px',
                boxShadow: '0 0 20px rgba(244,63,94,0.15)',
              }}>
              <div className="absolute -top-7 left-0 text-[11px] font-mono font-bold text-rose-400 bg-zinc-900/90 px-2 py-1 rounded-md">
                {Math.round(selection.w * videoDims.w / 100)} x {Math.round(selection.h * videoDims.h / 100)} px
              </div>
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
        </div>
      </div>

      {/* Step 3: Controls row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        <Select label="Removal Method" value={mode} onChange={setMode} d={d} options={[
          { value: "blur", label: "Strong Blur (Heavy, hides any logo)" },
          { value: "mosaic", label: "Mosaic (Pixelate area)" },
          { value: "black", label: "Black Box (Cover with black)" },
          { value: "colorfill", label: "Color Fill (Fill with nearby color)" },
          { value: "delogo", label: "Delogo (FFmpeg Smart Fill)" },
        ]} />
        <div className={`rounded-xl p-4 ${d?'bg-zinc-800/40 border border-zinc-700/40':'bg-amber-50 border border-amber-200'}`}>
          <div className="flex gap-2.5 items-start">
            <Info className={`w-5 h-5 mt-0.5 flex-shrink-0 ${d?'text-amber-400':'text-amber-600'}`} />
            <p className={`text-sm leading-relaxed ${d?'text-zinc-400':'text-amber-800'}`}>
              <strong>Strong Blur</strong> = best for any logo<br/>
              <strong>Mosaic</strong> = pixelate like censoring<br/>
              <strong>Black Box</strong> = 100% hidden<br/>
              <strong>Color Fill</strong> = fill with nearby color<br/>
              <strong>Delogo</strong> = smart fill (simple bg only)
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <ProcessBtn onClick={handleProcess} processing={processing} label="Remove Logo" color="from-rose-500 to-red-600" d={d} />
          {telegramSent && (
            <div className={`rounded-xl p-3 text-center ${d?'bg-emerald-500/10 border border-emerald-500/30':'bg-emerald-50 border border-emerald-300'}`} data-testid="telegram-sent-badge">
              <span className={`text-sm font-bold ${d?'text-emerald-400':'text-emerald-700'}`}>Sent to your Telegram!</span>
            </div>
          )}
          {result && !telegramSent && <DownloadBtn url={result} label="Download Clean Video" d={d} />}
        </div>
      </div>
    </div>
  );
};

const TOOL_COMPONENTS = {
  "voice-replace": VoiceReplaceTool, "subtitles": SubtitlesTool, "translate": TranslateTool,
  "trim": TrimTool, "ai-clips": AIClipsTool, "tts": TTSTool,
  "resize": ResizeTool, "convert": ConvertTool, "add-logo": AddLogoTool, "remove-logo": RemoveLogoTool,
};

// ---- Main Page ----
const ToolsPage = () => {
  const { user, token, isDark } = useAuth();
  const d = isDark;
  const navigate = useNavigate();
  const [activeTool, setActiveTool] = useState(null);

  const ToolComponent = activeTool ? TOOL_COMPONENTS[activeTool] : null;
  const activeToolInfo = TOOLS.find(t => t.id === activeTool);
  const ac = activeToolInfo ? AC[activeToolInfo.accent] : null;

  return (
    <div className={`min-h-screen ${d?'bg-zinc-950':'bg-zinc-50'}`} style={{fontFamily:"'IBM Plex Sans',sans-serif"}}>
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b ${d?'bg-zinc-950/90 border-zinc-800/50':'bg-white/90 border-zinc-200'}`}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <img src="/voxidub-logo.png" alt="VoxiDub.AI" className="h-10 w-10 rounded-full object-cover border-2 border-zinc-200" />
              <span className={`text-lg font-bold tracking-tight ${d?'text-white':'text-zinc-950'}`} style={{fontFamily:"'Outfit',sans-serif"}}>VoxiDub.AI</span>
            </button>
            <span className={`text-[9px] px-2.5 py-1 rounded-md font-bold tracking-[0.15em] uppercase ${d?'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20':'bg-violet-100 text-violet-700 border border-violet-200'}`}>Tools</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => navigate("/dashboard")} className={`text-xs px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 ${d?'bg-zinc-800 text-zinc-300 hover:bg-zinc-700':'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
              <ArrowLeft className="w-3 h-3" />Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <AnimatePresence mode="wait">
        {!activeTool ? (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="mb-10">
              <h1 className={`text-3xl md:text-4xl font-light tracking-tighter ${d?'text-white':'text-zinc-900'}`} style={{fontFamily:"'Outfit',sans-serif"}}>
                Video & Audio <span className={`font-medium ${d?'text-cyan-400':'text-violet-600'}`}>Tools</span>
              </h1>
              <p className={`text-sm mt-2 ${d?'text-zinc-500':'text-zinc-500'}`}>Professional processing powered by FFmpeg & AI</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 auto-rows-[200px]">
              {TOOLS.map((tool, i) => {
                const c = AC[tool.accent];
                return (
                  <motion.button key={tool.id}
                    initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                    whileHover={{ y: -4 }}
                    onClick={() => setActiveTool(tool.id)}
                    data-testid={`tool-card-${tool.id}`}
                    className={`${tool.span} group relative p-6 rounded-2xl border text-left transition-all duration-300 overflow-hidden
                      ${d ? 'bg-zinc-900/50 backdrop-blur border-zinc-800/60 hover:border-zinc-600' 
                          : `bg-gradient-to-br ${c.gradient} bg-opacity-5 border-transparent shadow-md hover:shadow-xl`}`}
                    style={!d ? { background: `linear-gradient(135deg, white 0%, white 60%, ${tool.accent === 'cyan' ? '#ecfeff' : tool.accent === 'violet' ? '#f5f3ff' : tool.accent === 'sky' ? '#f0f9ff' : tool.accent === 'amber' ? '#fffbeb' : tool.accent === 'teal' ? '#f0fdfa' : tool.accent === 'emerald' ? '#ecfdf5' : tool.accent === 'blue' ? '#eff6ff' : tool.accent === 'orange' ? '#fff7ed' : '#fdf2f8'} 100%)` } : {}}
                  >
                    {/* Colored top stripe */}
                    {!d && <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.gradient}`} />}

                    {/* Gradient glow on hover */}
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none`}
                      style={{background: d ? `radial-gradient(ellipse at 20% 20%, var(--glow-color, rgba(6,182,212,0.08)), transparent 60%)` : `radial-gradient(ellipse at 80% 80%, var(--glow-color, rgba(139,92,246,0.08)), transparent 60%)`}} />

                    <div className="relative z-10 flex flex-col justify-between h-full">
                      <div className="flex items-start justify-between">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 shadow-lg
                          ${d ? `bg-gradient-to-br ${c.gradient}` : `bg-gradient-to-br ${c.gradient}`}`}>
                          <tool.icon className="w-5.5 h-5.5 text-white" weight="duotone" />
                        </div>
                        <div className="flex items-center gap-2">
                          {tool.tag && (
                            <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold tracking-[0.12em] uppercase
                              ${d ? `${c.bg10} ${c.text} border ${c.border}` : `bg-white/80 ${c.textL} shadow-sm`}`}>
                              {tool.tag}
                            </span>
                          )}
                          <ArrowRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-4px] group-hover:translate-x-0
                            ${d?'text-zinc-400':'text-zinc-500'}`} weight="bold" />
                        </div>
                      </div>
                      <div>
                        <div className={`text-base font-semibold tracking-tight ${d?'text-zinc-100':'text-zinc-800'}`} style={{fontFamily:"'Outfit',sans-serif"}}>{tool.name}</div>
                        <div className={`text-xs mt-0.5 leading-relaxed ${d?'text-zinc-500':'text-zinc-500'}`}>{tool.desc}</div>
                      </div>
                    </div>

                    {/* Bottom accent bar */}
                    <div className={`absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r ${c.gradient} ${d ? 'opacity-0 group-hover:opacity-100' : 'opacity-40 group-hover:opacity-100'} transition-all duration-300`} />
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div key="detail" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
            <button onClick={() => setActiveTool(null)} data-testid="tools-back-btn"
              className={`flex items-center gap-2 text-sm font-medium mb-8 px-4 py-2 rounded-xl transition-all
                ${d?'text-zinc-400 hover:text-white hover:bg-zinc-800/50':'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}>
              <ArrowLeft className="w-4 h-4" /> Back to Tools
            </button>

            <div className={`${activeTool === 'add-logo' ? 'max-w-5xl' : 'max-w-xl'} mx-auto`}>
              {/* Tool header */}
              <div className={`rounded-t-2xl border border-b-0 p-6 flex items-center gap-4
                ${d ? 'bg-zinc-900/60 border-zinc-800/50' : 'bg-white border-zinc-200'}`}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg
                  bg-gradient-to-br ${ac.gradient}`}>
                  <activeToolInfo.icon className="w-6 h-6 text-white" weight="duotone" />
                </div>
                <div className="flex-1">
                  <div className={`text-xl font-semibold tracking-tight ${d?'text-white':'text-zinc-900'}`} style={{fontFamily:"'Outfit',sans-serif"}}>{activeToolInfo.name}</div>
                  <div className={`text-xs mt-0.5 ${d?'text-zinc-500':'text-zinc-500'}`}>{activeToolInfo.desc}</div>
                </div>
                {activeToolInfo.tag && (
                  <span className={`text-[9px] px-2.5 py-1 rounded-md font-bold tracking-[0.12em] uppercase
                    ${d ? `${ac.bg10} ${ac.text} border ${ac.border}` : `${ac.bg10} ${ac.textL} border ${ac.border}`}`}>
                    {activeToolInfo.tag}
                  </span>
                )}
              </div>

              {/* Tool form */}
              <div className={`rounded-b-2xl border p-6 md:p-8
                ${d ? 'bg-zinc-900/30 border-zinc-800/50' : 'bg-white border-zinc-200 shadow-lg shadow-zinc-200/30'}`}>
                <ToolComponent token={token} d={d} />
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ToolsPage;
