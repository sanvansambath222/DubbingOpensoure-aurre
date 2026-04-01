const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

export const UPLOAD_TIMEOUT_MS = 300000;
export const GENERATE_TIMEOUT_MS = 300000;
export const AUTO_PROCESS_TIMEOUT_MS = 600000;
export const AUTOSAVE_DELAY_MS = 2000;
export const PROGRESS_POLL_MS = 1500;

export const OUTPUT_LANGUAGES = {
  km: { name: "Khmer", male: [{ id: "dara", name: "Piseth (Boy)" }], female: [{ id: "sophea", name: "Sreymom (Girl)" }] },
  th: { name: "Thai", male: [{ id: "th_m1", name: "Niwat (Boy)" }], female: [{ id: "th_f1", name: "Premwadee (Girl)" }] },
  vi: { name: "Vietnamese", male: [{ id: "vi_m1", name: "NamMinh (Boy)" }], female: [{ id: "vi_f1", name: "HoaiMy (Girl)" }] },
  ko: { name: "Korean", male: [{ id: "ko_m1", name: "InJoon (Boy)" }], female: [{ id: "ko_f1", name: "SunHi (Girl)" }] },
  ja: { name: "Japanese", male: [{ id: "ja_m1", name: "Keita (Boy)" }], female: [{ id: "ja_f1", name: "Nanami (Girl)" }] },
  en: { name: "English", male: [{ id: "en_m1", name: "Guy (Boy)" }], female: [{ id: "en_f1", name: "Jenny (Girl)" }] },
  zh: { name: "Chinese", male: [{ id: "zh_m1", name: "YunXi (Boy)" }], female: [{ id: "zh_f1", name: "XiaoXiao (Girl)" }] },
  id: { name: "Indonesian", male: [{ id: "id_m1", name: "Ardi (Boy)" }], female: [{ id: "id_f1", name: "Gadis (Girl)" }] },
  hi: { name: "Hindi", male: [{ id: "hi_m1", name: "Madhur (Boy)" }], female: [{ id: "hi_f1", name: "Swara (Girl)" }] },
  es: { name: "Spanish", male: [{ id: "es_m1", name: "Alvaro (Boy)" }], female: [{ id: "es_f1", name: "Elvira (Girl)" }] },
  fr: { name: "French", male: [{ id: "fr_m1", name: "Henri (Boy)" }], female: [{ id: "fr_f1", name: "Denise (Girl)" }] },
  tl: { name: "Filipino", male: [{ id: "tl_m1", name: "Angelo (Boy)" }], female: [{ id: "tl_f1", name: "Blessica (Girl)" }] },
  de: { name: "German", male: [{ id: "de_m1", name: "Conrad (Boy)" }], female: [{ id: "de_f1", name: "Katja (Girl)" }] },
  pt: { name: "Portuguese", male: [{ id: "pt_m1", name: "Antonio (Boy)" }], female: [{ id: "pt_f1", name: "Francisca (Girl)" }] },
  ru: { name: "Russian", male: [{ id: "ru_m1", name: "Dmitry (Boy)" }], female: [{ id: "ru_f1", name: "Svetlana (Girl)" }] },
  ar: { name: "Arabic", male: [{ id: "ar_m1", name: "Hamed (Boy)" }], female: [{ id: "ar_f1", name: "Zariyah (Girl)" }] },
  it: { name: "Italian", male: [{ id: "it_m1", name: "Diego (Boy)" }], female: [{ id: "it_f1", name: "Elsa (Girl)" }] },
  ms: { name: "Malay", male: [{ id: "ms_m1", name: "Osman (Boy)" }], female: [{ id: "ms_f1", name: "Yasmin (Girl)" }] },
  lo: { name: "Lao", male: [{ id: "lo_m1", name: "Chanthavong (Boy)" }], female: [{ id: "lo_f1", name: "Keomany (Girl)" }] },
  my: { name: "Burmese", male: [{ id: "my_m1", name: "Thiha (Boy)" }], female: [{ id: "my_f1", name: "Nilar (Girl)" }] },
};
