import { AnimatePresence, motion } from "framer-motion";
import { Waveform, CheckCircle, CaretRight } from "@phosphor-icons/react";

export const StepProgress = ({ currentStep, steps, isDark }) => {
  const d = isDark;
  return (
  <div className="flex items-center gap-1" data-testid="step-progress">
    {steps.map((step, i) => {
      const isActive = i === currentStep;
      const isDone = i < currentStep;
      return (
        <div key={step} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all ${
            isDone ? 'bg-emerald-50 text-emerald-700' : isActive ? (d?'bg-white text-zinc-950':'bg-zinc-950 text-white') : (d?'bg-zinc-800 text-zinc-500':'bg-zinc-100 text-zinc-400')
          }`}>
            {isDone ? <CheckCircle className="w-3.5 h-3.5" weight="fill" /> : <span className="w-3.5 h-3.5 flex items-center justify-center text-[10px]">{i + 1}</span>}
            <span className="hidden sm:inline">{step}</span>
          </div>
          {i < steps.length - 1 && <CaretRight className={`w-3 h-3 ${d?'text-zinc-600':'text-zinc-300'}`} />}
        </div>
      );
    })}
  </div>
  );
};

export const ProcessingOverlay = ({ message, isDark, progressInfo }) => {
  const d = isDark;
  const fmtTime = (s) => { if (!s || s <= 0) return ""; const m = Math.floor(s / 60); const sec = Math.round(s % 60); return m > 0 ? `${m}m ${sec}s` : `${sec}s`; };
  const stepLabels = { transcribing: "Detecting Speakers", translating: "Translating", generating_audio: "Generating Audio", generating_video: "Merging Video", starting: "Starting...", removing_vocals: "Removing Human Voice (AI)", mixing_audio: "Mixing Background Music" };
  return (
  <AnimatePresence>
    {message && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center ${d?'bg-zinc-950/80':'bg-white/80'}`}>
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className={`border rounded-sm p-8 text-center max-w-sm w-full mx-4 shadow-xl ${d?'bg-zinc-900 border-zinc-700':'bg-white border-black/10'}`}>
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className={`absolute inset-0 rounded-sm border-2 ${d?'border-zinc-700':'border-zinc-200'}`} />
            <div className="absolute inset-0 rounded-sm border-2 border-transparent border-t-cyan-400 animate-spin" />
            <div className="absolute inset-2 rounded-sm bg-cyan-500/5 flex items-center justify-center">
              <Waveform className={`w-6 h-6 ${d?'text-zinc-300':'text-zinc-700'}`} />
            </div>
          </div>
          <p className={`font-medium text-sm mb-1 ${d?'text-white':'text-zinc-950'}`}>
            {progressInfo?.step ? (stepLabels[progressInfo.step] || progressInfo.step) : "Processing"}
          </p>
          <p className="text-zinc-500 text-xs mb-4">{message}</p>
          
          {progressInfo?.total > 0 && progressInfo?.progress > 0 && (
            <div data-testid="progress-bar-container">
              <div className={`w-full h-2 rounded-full overflow-hidden mb-2 ${d?'bg-zinc-700':'bg-zinc-200'}`}>
                <motion.div
                  className="h-full bg-cyan-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.round((progressInfo.progress / progressInfo.total) * 100))}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span data-testid="progress-count">
                  {progressInfo.step === 'removing_vocals' 
                    ? `${progressInfo.progress}/${progressInfo.total} chunks` 
                    : `${progressInfo.progress}/${progressInfo.total} segments`}
                </span>
                <span>{Math.round((progressInfo.progress / progressInfo.total) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1">
                {progressInfo.elapsed > 0 && <span>Elapsed: {fmtTime(progressInfo.elapsed)}</span>}
                {progressInfo.eta > 0 && <span>~{fmtTime(progressInfo.eta)} left</span>}
              </div>
              {progressInfo.demucs_duration > 0 && progressInfo.step === 'removing_vocals' && (
                <p className="text-[9px] text-zinc-400 mt-1">Audio: {Math.round(progressInfo.demucs_duration)}s total</p>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
};
