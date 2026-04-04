import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Lightning, Crown, Rocket, Star, ArrowLeft, Coins, Package, CurrencyDollar } from "@phosphor-icons/react";
import { useAuth, ThemeToggle } from "./AuthContext";
import { API } from "./constants";
import axios from "axios";
import { toast } from "sonner";

const PricingPage = () => {
  const { user, token, isDark } = useAuth();
  const d = isDark;
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [packs, setPacks] = useState([]);
  const [mySub, setMySub] = useState(null);
  const [currency, setCurrency] = useState("USD");
  const [tab, setTab] = useState("credits");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [plansRes, subRes] = await Promise.all([
          axios.get(`${API}/subscription/plans`),
          token ? axios.get(`${API}/subscription/me`, { headers: { Authorization: `Bearer ${token}` } }) : null,
        ]);
        setPlans(plansRes.data.plans || []);
        setPacks(plansRes.data.credit_packs || []);
        if (subRes) setMySub(subRes.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [token]);

  const handleSubscribe = (planId) => {
    if (!token) { toast.error("Please sign in first"); navigate("/"); return; }
    if (planId === "free") { toast.info("You are already on the Free plan"); return; }
    toast.info("ABA PayWay payment coming soon! Contact us to activate.");
  };

  const handleBuyPack = (packId) => {
    if (!token) { toast.error("Please sign in first"); navigate("/"); return; }
    toast.info("ABA PayWay payment coming soon! Contact us to activate.");
  };

  const planIcons = { free: Star, basic: Lightning, pro: Crown, business: Rocket };
  const planColors = {
    free: { gradient: "from-zinc-500 to-zinc-600" },
    basic: { gradient: "from-sky-500 to-blue-600" },
    pro: { gradient: "from-violet-500 to-purple-600" },
    business: { gradient: "from-amber-500 to-orange-600" },
  };

  const packColors = [
    { gradient: "from-sky-500 to-cyan-500", bg: d ? "border-sky-500/20" : "border-sky-200" },
    { gradient: "from-emerald-500 to-teal-500", bg: d ? "border-emerald-500/20" : "border-emerald-200", popular: true },
    { gradient: "from-violet-500 to-purple-500", bg: d ? "border-violet-500/20" : "border-violet-200" },
    { gradient: "from-amber-500 to-orange-500", bg: d ? "border-amber-500/20" : "border-amber-200" },
  ];

  const currentPlan = mySub?.subscription?.plan || "free";
  const creditsRemaining = mySub?.subscription?.credits_remaining || 0;
  const planType = mySub?.subscription?.plan_type || "monthly";

  return (
    <div className={`min-h-screen ${d ? 'bg-zinc-950' : 'bg-zinc-50'}`} style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b ${d ? 'bg-zinc-950/90 border-zinc-800/50' : 'bg-white/90 border-zinc-200'}`}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(token ? "/dashboard" : "/")} className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <img src="/voxidub-logo.png" alt="VoxiDub.AI" className="h-10 w-10 rounded-full object-cover border-2 border-zinc-200" />
              <span className={`text-lg font-bold tracking-tight ${d ? 'text-white' : 'text-zinc-950'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>VoxiDub.AI</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center rounded-lg overflow-hidden border ${d ? 'border-zinc-700' : 'border-zinc-300'}`}>
              <button onClick={() => setCurrency("USD")} data-testid="currency-usd"
                className={`px-3 py-1.5 text-xs font-bold transition-all ${currency === "USD" ? (d ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white') : (d ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-zinc-500')}`}>
                USD $
              </button>
              <button onClick={() => setCurrency("KHR")} data-testid="currency-khr"
                className={`px-3 py-1.5 text-xs font-bold transition-all ${currency === "KHR" ? (d ? 'bg-white text-zinc-900' : 'bg-zinc-900 text-white') : (d ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-zinc-500')}`}>
                KHR
              </button>
            </div>
            <ThemeToggle />
            <button onClick={() => navigate(token ? "/dashboard" : "/")} className={`text-xs px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-1.5 ${d ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
              <ArrowLeft className="w-3 h-3" />{token ? "Dashboard" : "Home"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className={`text-3xl md:text-5xl font-light tracking-tighter ${d ? 'text-white' : 'text-zinc-900'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
            Choose Your <span className={`font-semibold ${d ? 'text-violet-400' : 'text-violet-600'}`}>Plan</span>
          </h1>
          <p className={`text-sm mt-3 max-w-lg mx-auto ${d ? 'text-zinc-500' : 'text-zinc-500'}`}>
            AI video dubbing for Cambodia and the world. Pay per video or subscribe monthly.
          </p>
        </div>

        {/* Current status */}
        {mySub && (
          <div className={`max-w-md mx-auto mb-8 p-4 rounded-xl border text-center ${d ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'}`} data-testid="current-plan-status">
            <div className={`text-xs uppercase tracking-wider font-bold ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>Your Account</div>
            <div className={`text-lg font-bold mt-1 ${d ? 'text-white' : 'text-zinc-900'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
              {planType === "credits" ? `${creditsRemaining} Credits Remaining` : `${mySub.subscription?.plan?.charAt(0).toUpperCase() + mySub.subscription?.plan?.slice(1)} Plan`}
            </div>
            <div className={`text-xs mt-1 ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {mySub.videos_remaining === -1 ? "Unlimited videos" : `${mySub.videos_remaining} video${mySub.videos_remaining !== 1 ? 's' : ''} remaining`}
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex justify-center mb-10">
          <div className={`inline-flex items-center rounded-xl p-1 ${d ? 'bg-zinc-800/80' : 'bg-zinc-200/80'}`}>
            <button onClick={() => setTab("credits")} data-testid="tab-credits"
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2
                ${tab === "credits" ? (d ? 'bg-white text-zinc-900 shadow-md' : 'bg-zinc-900 text-white shadow-md') : (d ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700')}`}>
              <Coins className="w-4 h-4" weight="fill" /> Credit Packs
            </button>
            <button onClick={() => setTab("monthly")} data-testid="tab-monthly"
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2
                ${tab === "monthly" ? (d ? 'bg-white text-zinc-900 shadow-md' : 'bg-zinc-900 text-white shadow-md') : (d ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700')}`}>
              <CurrencyDollar className="w-4 h-4" weight="fill" /> Monthly Plans
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
        {tab === "credits" ? (
          <motion.div key="credits" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
            {/* Credit Packs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
              {packs.map((pack, i) => {
                const color = packColors[i] || packColors[0];
                const price = currency === "USD" ? `$${pack.price_usd}` : `${pack.price_khr.toLocaleString()} KHR`;
                const perVideo = currency === "USD" ? `$${pack.per_video_usd}` : `${Math.round(pack.price_khr / pack.credits).toLocaleString()} KHR`;

                return (
                  <motion.div key={pack.id}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    data-testid={`pack-card-${pack.id}`}
                    className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-300
                      ${color.popular ? `ring-2 ${d ? 'ring-emerald-500/50' : 'ring-emerald-400'}` : ''}
                      ${color.bg}
                      ${d ? 'bg-zinc-900/50 hover:border-zinc-600' : 'bg-white hover:shadow-xl shadow-sm'}`}
                  >
                    {color.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-4 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] uppercase bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
                          Best Value
                        </span>
                      </div>
                    )}

                    {/* Credits count */}
                    <div className="flex items-center gap-3 mb-4 mt-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-br ${color.gradient}`}>
                        <Package className="w-6 h-6 text-white" weight="fill" />
                      </div>
                      <div>
                        <div className={`text-2xl font-bold tracking-tight ${d ? 'text-white' : 'text-zinc-900'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>{pack.credits}</div>
                        <div className={`text-[10px] uppercase tracking-wider font-bold ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>Videos</div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mb-4">
                      <div className={`text-2xl font-bold ${d ? 'text-white' : 'text-zinc-900'}`}>{price}</div>
                      <div className={`text-xs mt-0.5 ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>{perVideo} per video</div>
                    </div>

                    {/* Features */}
                    <div className="flex-1 space-y-2.5 mb-5">
                      <Feature d={d} ok text={`Max ${pack.max_duration_min} min per video`} />
                      <Feature d={d} ok text="No watermark" />
                      <Feature d={d} ok text="Telegram delivery" />
                      <Feature d={d} ok text="Credits never expire" />
                    </div>

                    {/* Buy button */}
                    <button onClick={() => handleBuyPack(pack.id)} data-testid={`buy-pack-${pack.id}`}
                      className={`w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98] shadow-lg
                        ${color.popular
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:shadow-xl hover:shadow-emerald-500/20'
                          : d ? 'bg-white text-zinc-900 hover:bg-zinc-100' : `bg-gradient-to-r ${color.gradient} text-white hover:shadow-xl`}`}>
                      Buy {pack.credits} Credits
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div key="monthly" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
            {/* Monthly Plans */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
              {plans.map((plan, i) => {
                const color = planColors[plan.id] || planColors.free;
                const Icon = planIcons[plan.id] || Star;
                const isPopular = plan.id === "pro";
                const isCurrent = currentPlan === plan.id && planType === "monthly";
                const price = currency === "USD" ? plan.price_usd : plan.price_khr;
                const priceLabel = currency === "USD" ? `$${price}` : `${price.toLocaleString()}`;
                const currLabel = currency === "USD" ? "/mo" : " KHR/mo";

                return (
                  <motion.div key={plan.id}
                    initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.5 }}
                    data-testid={`plan-card-${plan.id}`}
                    className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-300
                      ${isPopular ? `ring-2 ${d ? 'ring-violet-500/50' : 'ring-violet-400'}` : ''}
                      ${d ? 'bg-zinc-900/50 border-zinc-800/60 hover:border-zinc-600' : 'bg-white border-zinc-200 hover:shadow-xl shadow-sm'}`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-4 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] uppercase bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30">
                          Most Popular
                        </span>
                      </div>
                    )}
                    {isCurrent && (
                      <div className="absolute -top-3 right-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase ${d ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border border-emerald-300'}`}>
                          Current
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-4 mt-1">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-br ${color.gradient}`}>
                        <Icon className="w-5 h-5 text-white" weight="fill" />
                      </div>
                      <div className={`text-lg font-semibold tracking-tight ${d ? 'text-white' : 'text-zinc-900'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>{plan.name}</div>
                    </div>

                    <div className="mb-5">
                      <div className="flex items-end gap-1">
                        <span className={`text-3xl font-bold tracking-tight ${d ? 'text-white' : 'text-zinc-900'}`}>{plan.price_usd === 0 ? "Free" : priceLabel}</span>
                        {plan.price_usd > 0 && <span className={`text-xs mb-1 ${d ? 'text-zinc-500' : 'text-zinc-400'}`}>{currLabel}</span>}
                      </div>
                    </div>

                    <div className="flex-1 space-y-2.5 mb-6">
                      <Feature d={d} ok text={plan.videos_per_month === -1 ? "Unlimited videos" : `${plan.videos_per_month} videos/month`} />
                      <Feature d={d} ok text={`Max ${plan.max_duration_min} min per video`} />
                      <Feature d={d} ok={!plan.watermark} text={plan.watermark ? "Watermark on video" : "No watermark"} />
                      <Feature d={d} ok={plan.priority_queue} text={plan.priority_queue ? "Priority queue" : "Standard queue"} />
                      <Feature d={d} ok text="Telegram delivery" />
                      <Feature d={d} ok text="322+ AI voices" />
                    </div>

                    {isCurrent ? (
                      <button disabled className={`w-full py-3 rounded-xl text-sm font-bold ${d ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-200 text-zinc-500'}`} data-testid={`plan-btn-${plan.id}`}>
                        Current Plan
                      </button>
                    ) : (
                      <button onClick={() => handleSubscribe(plan.id)} data-testid={`plan-btn-${plan.id}`}
                        className={`w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98] shadow-lg
                          ${isPopular
                            ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:shadow-xl hover:shadow-violet-500/30'
                            : plan.id === "free"
                              ? (d ? 'bg-zinc-700 text-white hover:bg-zinc-600' : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300')
                              : (d ? 'bg-white text-zinc-900 hover:bg-zinc-100' : `bg-gradient-to-r ${color.gradient} text-white hover:shadow-xl`)}`}>
                        {plan.price_usd === 0 ? "Get Started" : "Subscribe"}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Payment methods */}
        <div className="mt-12 text-center">
          <p className={`text-xs ${d ? 'text-zinc-600' : 'text-zinc-400'}`}>Secure payment via ABA PayWay</p>
          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            {["ABA Pay", "KHQR", "Visa", "MasterCard", "WeChat Pay", "Alipay"].map(m => (
              <span key={m} className={`text-[10px] px-3 py-1.5 rounded-lg font-medium ${d ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-white text-zinc-500 border border-zinc-200 shadow-sm'}`}>{m}</span>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto">
          <h2 className={`text-xl font-semibold tracking-tight text-center mb-6 ${d ? 'text-white' : 'text-zinc-900'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>FAQ</h2>
          <div className="space-y-3">
            {[
              { q: "What's the difference between Credits and Monthly?", a: "Credits = pay per video, use anytime, never expire. Monthly = fixed number of videos per month, resets monthly." },
              { q: "Can I use both credits and monthly plan?", a: "Yes! Credits are added to your account. You can switch between systems anytime." },
              { q: "What happens when credits run out?", a: "Buy more credit packs. Your account stays active." },
              { q: "How do I receive dubbed videos?", a: "Connect Telegram on your dashboard. All videos are sent to your Telegram automatically." },
              { q: "What payment methods are accepted?", a: "ABA Pay, KHQR, Visa, MasterCard, WeChat Pay, and Alipay via ABA PayWay." },
              { q: "Can I cancel monthly plan?", a: "Yes, anytime. Your plan stays active until the end of the billing period." },
            ].map((faq, i) => (
              <div key={i} className={`p-4 rounded-xl border ${d ? 'bg-zinc-900/40 border-zinc-800/50' : 'bg-white border-zinc-200'}`}>
                <div className={`text-sm font-semibold ${d ? 'text-zinc-200' : 'text-zinc-800'}`}>{faq.q}</div>
                <div className={`text-xs mt-1 leading-relaxed ${d ? 'text-zinc-500' : 'text-zinc-500'}`}>{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Feature = ({ d, ok, text }) => (
  <div className="flex items-center gap-2.5">
    {ok ? (
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${d ? 'bg-emerald-500/15' : 'bg-emerald-100'}`}>
        <Check className="w-3 h-3 text-emerald-500" weight="bold" />
      </div>
    ) : (
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${d ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
        <X className="w-3 h-3 text-zinc-400" weight="bold" />
      </div>
    )}
    <span className={`text-xs ${ok ? (d ? 'text-zinc-300' : 'text-zinc-700') : (d ? 'text-zinc-600' : 'text-zinc-400')}`}>{text}</span>
  </div>
);

export default PricingPage;
