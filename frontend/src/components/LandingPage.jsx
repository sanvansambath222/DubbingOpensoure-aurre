import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Waveform, MicrophoneStage, Globe, ShareNetwork, Envelope, Lock, User, GithubLogo, GoogleLogo } from "@phosphor-icons/react";
import { useAuth, ThemeToggle } from "./AuthContext";
import { API } from "./constants";
import axios from "axios";
import { toast } from "sonner";

const LandingPage = () => {
  const { user, isDark, login } = useAuth();
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate("/dashboard"); }, [user, navigate]);

  const handleGoogleLogin = () => {
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(window.location.origin + '/dashboard')}`;
  };

  const handleGithubLogin = () => {
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(window.location.origin + '/dashboard')}&provider=github`;
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isRegister ? `${API}/auth/register` : `${API}/auth/login`;
      const body = isRegister ? { email, password, name } : { email, password };
      const r = await axios.post(endpoint, body);
      login(r.data.user, r.data.session_token);
      toast.success(isRegister ? "Account created!" : "Welcome back!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Auth failed");
    } finally { setLoading(false); }
  };

  const d = isDark;
  return (
    <div className={`min-h-screen relative overflow-hidden ${d?'bg-zinc-950':'bg-white'}`} style={{fontFamily:"'IBM Plex Sans',sans-serif"}}>
      <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl shadow-sm ${d?'bg-zinc-950/80 border-b border-zinc-800':'bg-white/70 border-b border-black/10'}`}>
        <div className="max-w-7xl mx-auto px-6 py-1 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/voxidub-logo.png" alt="VoxiDub.AI" className="h-14 w-auto object-contain" />
            <span className={`text-xl font-bold tracking-tight ${d?'text-white':'text-zinc-950'}`} style={{fontFamily:"'Outfit',sans-serif"}}>VoxiDub.AI</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button data-testid="sign-in-button" onClick={() => setShowAuth(true)}
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
          <button onClick={() => setShowAuth(true)} data-testid="get-started-btn"
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

      {/* Auth Modal */}
      {showAuth && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAuth(false)}>
          <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
            onClick={e => e.stopPropagation()}
            className={`w-full max-w-sm mx-4 rounded-lg overflow-hidden shadow-2xl ${d?'bg-zinc-900 border border-zinc-700':'bg-white border border-zinc-200'}`}>
            <div className="p-6">
              <h2 className={`text-xl font-semibold mb-1 ${d?'text-white':'text-zinc-950'}`} style={{fontFamily:"'Outfit',sans-serif"}}>
                {isRegister ? "Create Account" : "Welcome Back"}
              </h2>
              <p className={`text-xs mb-5 ${d?'text-zinc-500':'text-zinc-400'}`}>
                {isRegister ? "Sign up to start dubbing" : "Sign in to your account"}
              </p>

              {/* Social Login Buttons */}
              <div className="mb-4">
                <button onClick={handleGoogleLogin} data-testid="google-login-btn"
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-md border text-xs font-semibold transition-colors ${d?'bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700':'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
                  <GoogleLogo className="w-4 h-4" weight="bold" /> Continue with Google
                </button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className={`flex-1 h-px ${d?'bg-zinc-700':'bg-zinc-200'}`}></div>
                <span className={`text-[10px] uppercase font-bold tracking-wider ${d?'text-zinc-600':'text-zinc-400'}`}>or</span>
                <div className={`flex-1 h-px ${d?'bg-zinc-700':'bg-zinc-200'}`}></div>
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleEmailAuth} className="space-y-3">
                {isRegister && (
                  <div className="relative">
                    <User className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${d?'text-zinc-500':'text-zinc-400'}`} />
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full Name"
                      data-testid="auth-name-input" required
                      className={`w-full pl-10 pr-3 py-2.5 rounded-md border text-sm outline-none transition-colors ${d?'bg-zinc-800 border-zinc-700 text-white focus:border-zinc-500 placeholder:text-zinc-600':'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-zinc-400 placeholder:text-zinc-400'}`} />
                  </div>
                )}
                <div className="relative">
                  <Envelope className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${d?'text-zinc-500':'text-zinc-400'}`} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                    data-testid="auth-email-input" required
                    className={`w-full pl-10 pr-3 py-2.5 rounded-md border text-sm outline-none transition-colors ${d?'bg-zinc-800 border-zinc-700 text-white focus:border-zinc-500 placeholder:text-zinc-600':'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-zinc-400 placeholder:text-zinc-400'}`} />
                </div>
                <div className="relative">
                  <Lock className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${d?'text-zinc-500':'text-zinc-400'}`} />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6 chars)"
                    data-testid="auth-password-input" required minLength={6}
                    className={`w-full pl-10 pr-3 py-2.5 rounded-md border text-sm outline-none transition-colors ${d?'bg-zinc-800 border-zinc-700 text-white focus:border-zinc-500 placeholder:text-zinc-600':'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-zinc-400 placeholder:text-zinc-400'}`} />
                </div>
                <button type="submit" disabled={loading} data-testid="auth-submit-btn"
                  className={`w-full py-2.5 rounded-md text-sm font-semibold transition-colors ${loading?'opacity-50 cursor-not-allowed':''} ${d?'bg-white text-zinc-950 hover:bg-zinc-200':'bg-zinc-950 text-white hover:bg-zinc-800'}`}>
                  {loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}
                </button>
              </form>

              <p className={`text-center text-xs mt-4 ${d?'text-zinc-500':'text-zinc-400'}`}>
                {isRegister ? "Already have an account?" : "Don't have an account?"}
                <button onClick={() => setIsRegister(!isRegister)} data-testid="auth-toggle-btn"
                  className={`ml-1 font-semibold ${d?'text-white hover:text-zinc-300':'text-zinc-950 hover:text-zinc-700'}`}>
                  {isRegister ? "Sign In" : "Sign Up"}
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
