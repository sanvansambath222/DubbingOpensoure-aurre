import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Waveform, MicrophoneStage, Globe, ShareNetwork } from "@phosphor-icons/react";
import { useAuth, ThemeToggle } from "./AuthContext";

const LandingPage = () => {
  const { user, isDark } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (user) navigate("/dashboard"); }, [user, navigate]);
  const handleLogin = () => {
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(window.location.origin + '/dashboard')}`;
  };
  const d = isDark;
  return (
    <div className={`min-h-screen relative overflow-hidden ${d?'bg-zinc-950':'bg-white'}`} style={{fontFamily:"'IBM Plex Sans',sans-serif"}}>
      <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl shadow-sm ${d?'bg-zinc-950/80 border-b border-zinc-800':'bg-white/70 border-b border-black/10'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-sm flex items-center justify-center ${d?'bg-white':'bg-zinc-950'}`}>
              <MicrophoneStage className={`w-4 h-4 ${d?'text-zinc-950':'text-white'}`} weight="fill" />
            </div>
            <span className={`text-lg font-semibold tracking-tight ${d?'text-white':'text-zinc-950'}`} style={{fontFamily:"'Outfit',sans-serif"}}>KhmerDub</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button data-testid="google-login-button" onClick={handleLogin}
              className={`px-5 py-2 text-sm font-semibold rounded-sm transition-colors ${d?'bg-white text-zinc-950 hover:bg-zinc-200':'bg-zinc-950 text-white hover:bg-zinc-800'}`}>
              Sign In
            </button>
          </div>
        </div>
      </header>
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 pt-20">
        <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{duration:0.6}} className="max-w-3xl text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-[0.15em] mb-8 ${d?'bg-zinc-800 border border-zinc-700 text-zinc-400':'bg-zinc-100 border border-zinc-200 text-zinc-600'}`}>
            <Waveform className="w-3.5 h-3.5" /> AI-Powered Dubbing
          </div>
          <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-medium mb-6 leading-[1.1] tracking-tighter ${d?'text-white':'text-zinc-950'}`} style={{fontFamily:"'Outfit',sans-serif"}}>
            Any Language to Any Language<br /><span className={d?'text-zinc-500':'text-zinc-400'}>Video Dubbing</span>
          </h1>
          <p className={`text-base max-w-xl mx-auto mb-10 leading-relaxed ${d?'text-zinc-400':'text-zinc-500'}`}>
            Auto-detect any language. Dub to 20+ languages including Khmer, Thai, Korean, Japanese, English & more. Free TTS voices.
          </p>
          <button onClick={handleLogin} data-testid="get-started-btn"
            className={`px-8 py-3.5 font-semibold rounded-sm transition-colors text-sm ${d?'bg-white text-zinc-950 hover:bg-zinc-200':'bg-zinc-950 text-white hover:bg-zinc-800'}`}>
            Get Started Free
          </button>
        </motion.div>
        <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} transition={{delay:0.3,duration:0.6}}
          className={`grid grid-cols-1 sm:grid-cols-3 gap-0 max-w-3xl mt-20 w-full rounded-sm overflow-hidden ${d?'border border-zinc-800':'border border-black/10'}`}>
          {[
            {icon:<Globe className="w-5 h-5" weight="duotone"/>,title:"Auto Language Detect",desc:"Chinese, Thai, Korean, Vietnamese & more"},
            {icon:<MicrophoneStage className="w-5 h-5" weight="duotone"/>,title:"Custom Voice",desc:"Upload your own voice for each actor"},
            {icon:<ShareNetwork className="w-5 h-5" weight="duotone"/>,title:"Share & Export",desc:"MP3, MP4, SRT subtitles + share link"},
          ].map((f,i)=>(
            <div key={f.title} className={`p-6 transition-colors ${i<2?`sm:border-r border-b sm:border-b-0 ${d?'border-zinc-800':'border-black/10'}`:''} ${d?'bg-zinc-900 hover:bg-zinc-800':'bg-white hover:bg-zinc-50'}`}>
              <div className={`w-9 h-9 rounded-sm flex items-center justify-center mb-3 ${d?'bg-zinc-800 text-zinc-400':'bg-zinc-100 text-zinc-700'}`}>{f.icon}</div>
              <h3 className={`font-semibold text-sm mb-1 ${d?'text-white':'text-zinc-950'}`} style={{fontFamily:"'Outfit',sans-serif"}}>{f.title}</h3>
              <p className="text-zinc-500 text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
};

export default LandingPage;
