import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Subtitles, Translate, Scissors, FilmSlate, SpeakerHigh,
  ArrowsOut, ArrowsClockwise, ArrowLeft, UploadSimple, DownloadSimple,
  SpinnerGap, MicrophoneStage, Waveform, Image as ImageIcon,
  CloudArrowUp, File, FileAudio, FileVideo, X, Check, Info, CaretDown
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
  { id: "voice-replace", name: "Voice Replace", desc: "Remove voice, rewrite text, generate new voice", icon: Waveform, color: "from-rose-500 to-pink-600", tag: "AI" },
  { id: "subtitles", name: "Add Subtitles", desc: "Burn subtitles into video", icon: Subtitles, color: "from-violet-500 to-purple-600", tag: null },
  { id: "translate", name: "Translate", desc: "Translate text or SRT file", icon: Translate, color: "from-sky-500 to-blue-600", tag: "AI" },
  { id: "trim", name: "Trim Video", desc: "Cut video by time range", icon: Scissors, color: "from-amber-500 to-orange-600", tag: null },
  { id: "ai-clips", name: "AI Clips", desc: "Auto-create short clips", icon: FilmSlate, color: "from-cyan-500 to-teal-600", tag: "AI" },
  { id: "tts", name: "Text to Speech", desc: "Type text, get audio in any language", icon: SpeakerHigh, color: "from-emerald-500 to-green-600", tag: null },
  { id: "resize", name: "Resize Video", desc: "Change video dimensions", icon: ArrowsOut, color: "from-blue-500 to-indigo-600", tag: null },
  { id: "convert", name: "Convert", desc: "Change video/audio format", icon: ArrowsClockwise, color: "from-orange-500 to-red-600", tag: null },
  { id: "add-logo", name: "Add Logo", desc: "Overlay logo/watermark on video", icon: ImageIcon, color: "from-pink-500 to-rose-600", tag: null },
];

// Shared file drop zone
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
      className={`relative cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-all ${dragging ? (d?'border-white/40 bg-white/5':'border-zinc-400 bg-zinc-50') : file ? (d?'border-emerald-500/40 bg-emerald-900/10':'border-emerald-400 bg-emerald-50') : (d?'border-zinc-700 hover:border-zinc-500':'border-zinc-300 hover:border-zinc-400')}`}
      data-testid={`drop-${label.toLowerCase().replace(/\s/g,'-')}`}
    >
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { if(e.target.files[0]) onFile(e.target.files[0]); }} />
      {file ? (
        <div className="flex items-center justify-center gap-2">
          <Check className="w-4 h-4 text-emerald-500" />
          <span className={`text-sm truncate max-w-[200px] ${d?'text-emerald-400':'text-emerald-600'}`}>{file.name}</span>
          <button onClick={(e) => { e.stopPropagation(); onFile(null); }} className="ml-1"><X className="w-3.5 h-3.5 text-zinc-400 hover:text-red-400" /></button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <Icon className={`w-6 h-6 ${d?'text-zinc-500':'text-zinc-400'}`} />
          <span className={`text-xs ${d?'text-zinc-500':'text-zinc-500'}`}>{label}</span>
          <span className={`text-[10px] ${d?'text-zinc-600':'text-zinc-400'}`}>Click or drag file here</span>
        </div>
      )}
    </div>
  );
};

// Shared select
const Select = ({ label, value, onChange, options, d }) => (
  <div>
    {label && <label className={`block text-xs font-medium mb-1.5 ${d?'text-zinc-400':'text-zinc-600'}`}>{label}</label>}
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`w-full text-sm p-2.5 pr-8 rounded-lg border appearance-none transition-colors ${d?'bg-zinc-800/80 border-zinc-700 text-white hover:border-zinc-500 focus:border-zinc-400':'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400 focus:border-zinc-500'} outline-none`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <CaretDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${d?'text-zinc-500':'text-zinc-400'}`} />
    </div>
  </div>
);

// Shared process button
const ProcessBtn = ({ onClick, processing, label, procLabel, color, d }) => (
  <button onClick={onClick} disabled={processing} data-testid={`process-btn-${label.toLowerCase().replace(/\s/g,'-')}`}
    className={`w-full py-3 rounded-lg text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-gradient-to-r ${color} hover:opacity-90 active:scale-[0.98]`}>
    {processing ? <><SpinnerGap className="w-4 h-4 animate-spin" />{procLabel || "Processing..."}</> : label}
  </button>
);

// Shared download button
const DownloadBtn = ({ url, label, d }) => (
  <a href={url.startsWith("http") ? url : `${API.replace('/api','')}${url}`} download
    className={`block w-full py-2.5 rounded-lg text-sm font-semibold text-center transition-all ${d?'bg-emerald-600 hover:bg-emerald-500 text-white':'bg-emerald-500 hover:bg-emerald-600 text-white'}`} data-testid="download-btn">
    <DownloadSimple className="w-4 h-4 inline mr-1.5" />{label || "Download"}
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
    <div className="space-y-4">
      <DropZone accept="video/*,audio/*" label="Upload Video or Audio" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <textarea value={extraText} onChange={e => setExtraText(e.target.value)} rows={3}
        placeholder="Add extra text (optional) - will be added after the transcription..."
        className={`w-full text-sm p-3 rounded-lg border resize-none transition-colors ${d?'bg-zinc-800/80 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-zinc-500':'bg-white border-zinc-300 placeholder:text-zinc-400 focus:border-zinc-400'} outline-none`}
        data-testid="voice-replace-extra-text" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${d?'text-zinc-400':'text-zinc-600'}`}>Voice</label>
          <input type="text" placeholder="Search voice..." value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)}
            className={`w-full text-xs p-2 rounded-lg border mb-1 ${d?'bg-zinc-800/80 border-zinc-700 text-white placeholder:text-zinc-600':'bg-white border-zinc-300 placeholder:text-zinc-400'} outline-none`} />
          <select value={voice} onChange={e => setVoice(e.target.value)}
            className={`w-full text-xs p-2 rounded-lg border ${d?'bg-zinc-800/80 border-zinc-700 text-white':'bg-white border-zinc-300'} outline-none`}>
            {filteredVoices.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <Select label="Language" value={targetLang} onChange={setTargetLang} options={[
          {value:"km",label:"Khmer"},{value:"en",label:"English"},{value:"zh",label:"Chinese"},{value:"th",label:"Thai"},{value:"vi",label:"Vietnamese"},{value:"ko",label:"Korean"},{value:"ja",label:"Japanese"}
        ]} d={d} />
      </div>
      {progress && <div className={`text-xs text-center py-1 ${d?'text-zinc-400':'text-zinc-500'}`}>{progress}</div>}
      <ProcessBtn onClick={handleProcess} processing={processing} label="Replace Voice" procLabel={progress || "Processing..."} color="from-rose-500 to-pink-600" d={d} />
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
    <div className="space-y-4">
      <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <DropZone accept=".srt,.vtt,.ass" label="Upload SRT Subtitle" icon={File} file={srt} onFile={setSrt} d={d} />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${d?'text-zinc-400':'text-zinc-600'}`}>Size</label>
          <input type="number" value={fontSize} onChange={e => setFontSize(e.target.value)} min={12} max={72}
            className={`w-full text-sm p-2.5 rounded-lg border ${d?'bg-zinc-800/80 border-zinc-700 text-white':'bg-white border-zinc-300'} outline-none`} />
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
    <div className="space-y-4">
      <DropZone accept=".srt" label="Upload SRT File (optional)" icon={File} file={srt} onFile={setSrt} d={d} />
      <div className={`flex items-center gap-2 ${d?'text-zinc-600':'text-zinc-400'}`}><div className="flex-1 h-px bg-current opacity-30" /><span className="text-[10px] uppercase tracking-wider">or type text</span><div className="flex-1 h-px bg-current opacity-30" /></div>
      <textarea value={textInput} onChange={e => setTextInput(e.target.value)} rows={3} placeholder="Type text to translate..."
        className={`w-full text-sm p-3 rounded-lg border resize-none ${d?'bg-zinc-800/80 border-zinc-700 text-white placeholder:text-zinc-600':'bg-white border-zinc-300 placeholder:text-zinc-400'} outline-none`} data-testid="translate-text-input" />
      <Select label="Target Language" value={targetLang} onChange={setTargetLang} options={langs} d={d} />
      <ProcessBtn onClick={handleTranslate} processing={processing} label="Translate" color="from-sky-500 to-blue-600" d={d} />
      {translated && <div className={`p-3 rounded-lg border text-sm ${d?'bg-zinc-800/80 border-zinc-700 text-white':'bg-gray-50 border-zinc-200'}`} data-testid="translate-result">{translated}</div>}
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
      <label className={`block text-xs font-medium mb-1.5 ${d?'text-zinc-400':'text-zinc-600'}`}>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="HH:MM:SS"
        className={`w-full text-sm p-2.5 rounded-lg border font-mono ${d?'bg-zinc-800/80 border-zinc-700 text-white':'bg-white border-zinc-300'} outline-none`} />
    </div>
  );

  return (
    <div className="space-y-4">
      <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <div className="grid grid-cols-2 gap-3">
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
    <div className="space-y-4">
      <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${d?'text-zinc-400':'text-zinc-600'}`}>Number of Clips</label>
          <input type="number" value={clipCount} onChange={e => setClipCount(e.target.value)} min={1} max={10}
            className={`w-full text-sm p-2.5 rounded-lg border ${d?'bg-zinc-800/80 border-zinc-700 text-white':'bg-white border-zinc-300'} outline-none`} />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${d?'text-zinc-400':'text-zinc-600'}`}>Duration (sec)</label>
          <input type="number" value={clipDuration} onChange={e => setClipDuration(e.target.value)} min={5} max={120}
            className={`w-full text-sm p-2.5 rounded-lg border ${d?'bg-zinc-800/80 border-zinc-700 text-white':'bg-white border-zinc-300'} outline-none`} />
        </div>
      </div>
      <ProcessBtn onClick={handleProcess} processing={processing} label="Create AI Clips" procLabel="Analyzing video..." color="from-cyan-500 to-teal-600" d={d} />
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
      ]);
    });
  }, []);

  const filteredVoices = voiceSearch
    ? allVoices.filter(v => v.label.toLowerCase().includes(voiceSearch.toLowerCase()))
    : allVoices.slice(0, 50);

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
    <div className="space-y-4">
      <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Type text here..."
        className={`w-full text-sm p-3 rounded-lg border resize-none ${d?'bg-zinc-800/80 border-zinc-700 text-white placeholder:text-zinc-600':'bg-white border-zinc-300 placeholder:text-zinc-400'} outline-none`} data-testid="tts-text-input" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${d?'text-zinc-400':'text-zinc-600'}`}>Voice</label>
          <input type="text" placeholder="Search voice..." value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)}
            className={`w-full text-xs p-2 rounded-lg border mb-1 ${d?'bg-zinc-800/80 border-zinc-700 text-white placeholder:text-zinc-600':'bg-white border-zinc-300 placeholder:text-zinc-400'} outline-none`} />
          <select value={voice} onChange={e => setVoice(e.target.value)}
            className={`w-full text-xs p-2 rounded-lg border ${d?'bg-zinc-800/80 border-zinc-700 text-white':'bg-white border-zinc-300'} outline-none`}>
            {filteredVoices.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${d?'text-zinc-400':'text-zinc-600'}`}>Speed: {speed >= 0 ? '+' : ''}{speed}%</label>
          <input type="range" min={-50} max={50} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="w-full mt-2 accent-emerald-500" />
        </div>
      </div>
      <ProcessBtn onClick={handleGenerate} processing={processing} label="Generate Speech" color="from-emerald-500 to-green-600" d={d} />
      {audioUrl && (
        <div className="space-y-2">
          <audio controls src={audioUrl} className="w-full rounded-lg" data-testid="tts-audio-player" />
          <a href={audioUrl} download="speech.wav" className={`block w-full py-2.5 rounded-lg text-sm font-semibold text-center ${d?'bg-emerald-600 hover:bg-emerald-500 text-white':'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
            <DownloadSimple className="w-4 h-4 inline mr-1.5" />Download Audio
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
    <div className="space-y-4">
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
    <div className="space-y-4">
      <DropZone accept="video/*,audio/*" label="Upload Video or Audio" icon={FileVideo} file={video} onFile={setVideo} d={d} />
      <Select label="Output Format" value={format} onChange={setFormat} options={formats} d={d} />
      <ProcessBtn onClick={handleConvert} processing={processing} label="Convert" color="from-orange-500 to-red-600" d={d} />
      {result && <DownloadBtn url={result} label="Download" d={d} />}
    </div>
  );
};

// ---- Add Logo Tool (Drag & Drop Canvas) ----
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

  const onVideoSelect = (f) => {
    setVideo(f);
    if (f) { setVideoPreview(URL.createObjectURL(f)); } else { setVideoPreview(null); }
  };
  const onLogoSelect = (f) => {
    setLogo(f);
    if (f) { const r = new FileReader(); r.onload = (e) => setLogoPreview(e.target.result); r.readAsDataURL(f); } else { setLogoPreview(null); }
  };

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
    <div className="space-y-4" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onTouchMove={handleTouchMove} onTouchEnd={handleMouseUp}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Big Canvas */}
        <div className="lg:col-span-2">
          <div className={`rounded-xl overflow-hidden border ${d?'border-zinc-700':'border-zinc-200'}`}>
            <div className={`flex items-center justify-between px-3 py-2 ${d?'bg-zinc-800':'bg-zinc-100'}`}>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${d?'text-zinc-400':'text-zinc-500'}`}>Preview Canvas — Drag logo to position</span>
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
              {/* Grid lines */}
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />
            </div>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="space-y-3">
          <DropZone accept="video/*" label="Upload Video" icon={FileVideo} file={video} onFile={onVideoSelect} d={d} />
          <DropZone accept="image/*" label="Upload Logo (PNG)" icon={ImageIcon} file={logo} onFile={onLogoSelect} d={d} />

          {/* Quick Position Buttons */}
          <div>
            <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-2 ${d?'text-zinc-500':'text-zinc-500'}`}>Quick Position</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "Top Left", x: 8, y: 8 },
                { label: "Top Center", x: 50, y: 8 },
                { label: "Top Right", x: 92, y: 8 },
                { label: "Mid Left", x: 8, y: 50 },
                { label: "Center", x: 50, y: 50 },
                { label: "Mid Right", x: 92, y: 50 },
                { label: "Bot Left", x: 8, y: 92 },
                { label: "Bot Center", x: 50, y: 92 },
                { label: "Bot Right", x: 92, y: 92 },
              ].map((p) => (
                <button key={p.label} onClick={() => quickPos(p.x, p.y)}
                  className={`text-[10px] py-1.5 rounded-md transition-all ${logoPos.x === p.x && logoPos.y === p.y ? 'bg-pink-500 text-white font-semibold' : d ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size Slider */}
          <div>
            <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${d?'text-zinc-500':'text-zinc-500'}`}>Logo Size: {logoSize}%</label>
            <input type="range" min={3} max={60} value={logoSize} onChange={e => setLogoSize(Number(e.target.value))} className="w-full accent-pink-500" />
          </div>

          {/* Opacity Slider */}
          <div>
            <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${d?'text-zinc-500':'text-zinc-500'}`}>Opacity: {opacity}%</label>
            <input type="range" min={10} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="w-full accent-pink-500" />
          </div>

          <ProcessBtn onClick={handleProcess} processing={processing} label="Add Logo & Download" color="from-pink-500 to-rose-600" d={d} />
          {result && <DownloadBtn url={result} label="Download Video" d={d} />}
        </div>
      </div>
    </div>
  );
};

const TOOL_COMPONENTS = {
  "voice-replace": VoiceReplaceTool,
  "subtitles": SubtitlesTool,
  "translate": TranslateTool,
  "trim": TrimTool,
  "ai-clips": AIClipsTool,
  "tts": TTSTool,
  "resize": ResizeTool,
  "convert": ConvertTool,
  "add-logo": AddLogoTool,
};

const ToolsPage = () => {
  const { user, token, isDark } = useAuth();
  const d = isDark;
  const navigate = useNavigate();
  const [activeTool, setActiveTool] = useState(null);

  const ToolComponent = activeTool ? TOOL_COMPONENTS[activeTool] : null;
  const activeToolInfo = TOOLS.find(t => t.id === activeTool);

  return (
    <div className={`min-h-screen ${d?'bg-zinc-950':'bg-gray-50'}`} style={{fontFamily:"'IBM Plex Sans',sans-serif"}}>
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl shadow-sm ${d?'bg-zinc-950/80 border-b border-zinc-800':'bg-white/80 border-b border-zinc-200'}`}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <img src="/voxidub-logo.png" alt="VoxiDub.AI" className="h-10 w-auto object-contain" />
              <span className={`font-bold text-sm ${d?'text-white':'text-zinc-950'}`} style={{fontFamily:"'Outfit',sans-serif"}}>VoxiDub.AI</span>
            </button>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wide uppercase ${d?'bg-violet-500/20 text-violet-400':'bg-violet-100 text-violet-600'}`}>Tools</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => navigate("/dashboard")} className={`text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${d?'bg-zinc-800 text-zinc-300 hover:bg-zinc-700':'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
              <ArrowLeft className="w-3 h-3" />Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {!activeTool ? (
          <>
            <div className="mb-8">
              <h1 className={`text-2xl font-bold tracking-tight ${d?'text-white':'text-zinc-900'}`}>Video & Audio Tools</h1>
              <p className={`text-sm mt-1 ${d?'text-zinc-500':'text-zinc-500'}`}>Professional tools powered by FFmpeg & AI — free to use</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TOOLS.map((tool, i) => (
                <motion.button key={tool.id}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3 }}
                  onClick={() => setActiveTool(tool.id)}
                  data-testid={`tool-card-${tool.id}`}
                  className={`group relative p-5 rounded-xl border text-left transition-all duration-200 hover:shadow-lg active:scale-[0.98] ${d?'bg-zinc-900/80 border-zinc-800 hover:border-zinc-600':'bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-zinc-200/50'}`}>
                  <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center shadow-lg`}>
                      <tool.icon className="w-5 h-5 text-white" weight="bold" />
                    </div>
                    {tool.tag && <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider ${d?'bg-amber-500/20 text-amber-400':'bg-amber-100 text-amber-600'}`}>{tool.tag}</span>}
                  </div>
                  <div className={`text-sm font-semibold mt-3 ${d?'text-white':'text-zinc-900'}`}>{tool.name}</div>
                  <div className={`text-xs mt-0.5 leading-relaxed ${d?'text-zinc-500':'text-zinc-500'}`}>{tool.desc}</div>
                  <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-br ${tool.color} mix-blend-overlay`} style={{opacity: 0.03}} />
                </motion.button>
              ))}
            </div>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
            <button onClick={() => setActiveTool(null)} className={`flex items-center gap-1.5 text-sm mb-6 transition-colors ${d?'text-zinc-400 hover:text-white':'text-zinc-500 hover:text-zinc-900'}`} data-testid="tools-back-btn">
              <ArrowLeft className="w-4 h-4" /> Back to Tools
            </button>
            <div className={`${activeTool === 'add-logo' ? 'max-w-4xl' : 'max-w-lg'} mx-auto rounded-xl border overflow-hidden ${d?'bg-zinc-900/80 border-zinc-800':'bg-white border-zinc-200 shadow-sm'}`}>
              <div className={`p-4 bg-gradient-to-r ${activeToolInfo.color} flex items-center gap-3`}>
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <activeToolInfo.icon className="w-4 h-4 text-white" weight="bold" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{activeToolInfo.name}</div>
                  <div className="text-[11px] text-white/70">{activeToolInfo.desc}</div>
                </div>
              </div>
              <div className="p-5">
                <ToolComponent token={token} d={d} />
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ToolsPage;
