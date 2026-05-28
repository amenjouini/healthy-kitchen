import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useInView } from "framer-motion";

/* ─── Responsive hook ─────────────────────────────────────────
   Returns { isMobile, isTablet, isDesktop }
   mobile  : < 640px
   tablet  : 640–1023px
   desktop : ≥ 1024px
──────────────────────────────────────────────────────────────── */
function useBreakpoint() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return { isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024 };
}

// ── Reveal wrapper ─────────────────────────────────────────────
function Reveal({ children, delay = 0, y = 24 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

// ── Grain ──────────────────────────────────────────────────────
function Grain() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100, opacity: 0.028,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundSize: "180px 180px",
    }} />
  );
}

/* ─────────────────────────────────────────────────────────────
   NAV
───────────────────────────────────────────────────────────────*/
function Nav() {
  const { isMobile } = useBreakpoint();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // close menu on link click
  const close = () => setOpen(false);

  return (
    <>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
          padding: isMobile ? "0 20px" : "0 40px",
          height: isMobile ? 64 : 72,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: scrolled || open ? "rgba(245,240,232,0.97)" : "transparent",
          backdropFilter: scrolled || open ? "blur(24px)" : "none",
          borderBottom: scrolled || open ? "1px solid rgba(140,184,140,0.18)" : "none",
          transition: "all 0.4s ease",
        }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #2d4a2d 0%, #8cb88c 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2C5.5 2 3.5 4 3.5 6.5C3.5 9 6 12 8 14C10 12 12.5 9 12.5 6.5C12.5 4 10.5 2 8 2Z" fill="white" opacity="0.9"/>
              <circle cx="8" cy="6.5" r="1.5" fill="white" opacity="0.5"/>
            </svg>
          </div>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "#1a2e1a", letterSpacing: "0.04em" }}>
            Healthy Kitchen
          </span>
        </div>

        {/* Desktop links */}
        {!isMobile && (
          <div style={{ display: "flex", gap: 36 }}>
            {[["Menu", "#menu"], ["Build Meal", "#build-meal"], ["My Plan", "#calorie-planner"]].map(([label, href]) => (
              <a key={label} href={href} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 500, color: "#4a5040", textDecoration: "none", letterSpacing: "0.05em", textTransform: "uppercase", transition: "color 0.2s" }}
                onMouseEnter={e => e.target.style.color = "#2d4a2d"}
                onMouseLeave={e => e.target.style.color = "#4a5040"}>{label}</a>
            ))}
          </div>
        )}

        {/* Desktop CTA */}
        {!isMobile && (
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ padding: "10px 22px", borderRadius: 100, border: "1px solid rgba(45,74,45,0.28)", background: "transparent", fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 500, color: "#2d4a2d", cursor: "pointer" }}>Sign In</button>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{ padding: "10px 22px", borderRadius: 100, border: "none", background: "#1a2e1a", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#f0ebe0", cursor: "pointer" }}>Get Started</motion.button>
          </div>
        )}

        {/* Hamburger */}
        {isMobile && (
          <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            <motion.span animate={{ rotate: open ? 45 : 0, y: open ? 9 : 0 }} style={{ display: "block", width: 22, height: 2, background: "#1a2e1a", borderRadius: 2, transformOrigin: "center" }} />
            <motion.span animate={{ opacity: open ? 0 : 1 }} style={{ display: "block", width: 22, height: 2, background: "#1a2e1a", borderRadius: 2 }} />
            <motion.span animate={{ rotate: open ? -45 : 0, y: open ? -9 : 0 }} style={{ display: "block", width: 22, height: 2, background: "#1a2e1a", borderRadius: 2, transformOrigin: "center" }} />
          </button>
        )}
      </motion.nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isMobile && open && (
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.28 }}
            style={{ position: "fixed", top: 64, left: 0, right: 0, zIndex: 190, background: "rgba(245,240,232,0.98)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(140,184,140,0.18)", padding: "24px 24px 28px", display: "flex", flexDirection: "column", gap: 0 }}>
            {[["Menu", "#menu"], ["Build Meal", "#build-meal"], ["My Plan", "#calorie-planner"]].map(([label, href]) => (
              <a key={label} href={href} onClick={close} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 600, color: "#1a2e1a", textDecoration: "none", letterSpacing: "0.04em", padding: "14px 0", borderBottom: "1px solid rgba(140,184,140,0.12)" }}>
                {label}
              </a>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button style={{ flex: 1, padding: "13px", borderRadius: 100, border: "1px solid rgba(45,74,45,0.28)", background: "transparent", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#2d4a2d", cursor: "pointer" }}>Sign In</button>
              <button style={{ flex: 1, padding: "13px", borderRadius: 100, border: "none", background: "#1a2e1a", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: "#f0ebe0", cursor: "pointer" }}>Get Started</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   HERO
───────────────────────────────────────────────────────────────*/
function Hero() {
  const { isMobile, isTablet } = useBreakpoint();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, isMobile ? -40 : -120]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  const px = isMobile ? "20px" : isTablet ? "32px" : "56px";
  const pt = isMobile ? "100px" : "120px";

  return (
    <section style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #f5f0e8 0%, #eae8e0 40%, #dde8d8 100%)",
      display: "flex", alignItems: "center",
      padding: `${pt} ${px} 80px`, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: "5%", right: "5%", width: isMobile ? 280 : 500, height: isMobile ? 280 : 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(140,184,140,0.18) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "8%", left: "3%", width: isMobile ? 200 : 360, height: isMobile ? 200 : 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(184,160,112,0.12) 0%, transparent 70%)", filter: "blur(50px)", pointerEvents: "none" }} />

      <motion.div style={{ y, opacity, width: "100%", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 1fr",
          gap: isMobile ? 48 : isTablet ? 56 : 80,
          alignItems: "center",
        }}>
          {/* Text */}
          <div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 100, background: "rgba(45,74,45,0.08)", border: "1px solid rgba(45,74,45,0.15)", marginBottom: 28 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#8cb88c" }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#4a5040", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>Premium Wellness Experience</span>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 56 : isTablet ? 72 : "clamp(64px, 6vw, 96px)", fontWeight: 600, lineHeight: 1.0, color: "#1a2e1a", marginBottom: 24, letterSpacing: "-0.01em" }}>
              Nourish<br />
              <span style={{ color: "#8cb88c", fontStyle: "italic" }}>your</span><br />
              Nature.
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5 }}
              style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 16 : 18, lineHeight: 1.7, color: "#6a7060", maxWidth: 440, marginBottom: 36 }}>
              A sanctuary of flavour and vitality. Every dish curated with intention — where culinary artistry meets holistic wellness.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.65 }}
              style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <motion.button whileHover={{ scale: 1.04, background: "#2d4a2d" }} whileTap={{ scale: 0.97 }}
                style={{ padding: isMobile ? "15px 28px" : "18px 38px", borderRadius: 100, border: "none", background: "#1a2e1a", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#f0ebe0", cursor: "pointer", transition: "background 0.2s" }}>
                Explore Menu
              </motion.button>
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                style={{ padding: isMobile ? "15px 28px" : "18px 38px", borderRadius: 100, border: "1px solid rgba(45,74,45,0.3)", background: "transparent", fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 16, fontWeight: 500, color: "#2d4a2d", cursor: "pointer" }}>
                Build a Meal
              </motion.button>
            </motion.div>

            {/* Stats */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.9 }}
              style={{ display: "flex", gap: isMobile ? 28 : 48, marginTop: isMobile ? 44 : 60 }} id="stats">
              {[["12K+", "Meals crafted"], ["98%", "Satisfaction"], ["24/7", "Nutrition AI"]].map(([num, label]) => (
                <div key={num}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 36 : 48, fontWeight: 700, color: "#1a2e1a", lineHeight: 1 }}>{num}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 12 : 14, color: "#8a9080", marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Image card — hidden on mobile, shown on tablet+ */}
          {!isMobile && (
            <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }} style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: -20, right: -20, bottom: -20, left: -20, borderRadius: "36px", border: "1px solid rgba(140,184,140,0.22)", pointerEvents: "none" }} />
              <div style={{ borderRadius: 28, overflow: "hidden", background: "#e8e4dc", position: "relative", boxShadow: "0 32px 70px rgba(26,46,26,0.12)" }}>
                <img src="https://images.unsplash.com/photo-1546793665-c74683f339c1?q=80&w=1200&auto=format&fit=crop"
                  style={{ width: "100%", height: isTablet ? 380 : 500, objectFit: "cover", display: "block" }} alt="Hero dish" />
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }}
                  style={{ position: "absolute", bottom: 20, left: 20, right: 20, background: "rgba(245,240,232,0.9)", backdropFilter: "blur(20px)", borderRadius: 18, padding: "18px 22px", border: "1px solid rgba(255,255,255,0.6)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700, color: "#1a2e1a" }}>Green Power Bowl</div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#8a9080", marginTop: 2 }}>Seasonal · Organic · Chef's Pick</div>
                    </div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: "#2d4a2d" }}>520 kcal</div>
                  </div>
                  <div style={{ display: "flex", gap: 24 }}>
                    {[["Protein", "42g"], ["Carbs", "31g"], ["Fat", "14g"]].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#8a9080", letterSpacing: "0.05em", textTransform: "uppercase" }}>{k}</div>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 700, color: "#2d4a2d", marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
              <motion.div animate={{ y: [-5, 5, -5] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                style={{ position: "absolute", top: 28, right: -24, background: "#f0ebe0", borderRadius: 18, padding: "12px 18px", boxShadow: "0 8px 24px rgba(26,46,26,0.1)", border: "1px solid rgba(140,184,140,0.3)" }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#8a9080", letterSpacing: "0.06em", textTransform: "uppercase" }}>Energy Score</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 700, color: "#1a2e1a", lineHeight: 1, marginTop: 2 }}>92<span style={{ fontSize: 16, color: "#8cb88c" }}>%</span></div>
              </motion.div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   MENU
───────────────────────────────────────────────────────────────*/
const menuDishes = [
  { title: "Verdure Salad", sub: "Heirloom greens, citrus, microherbs", calories: "410 kcal", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=1200&auto=format&fit=crop", tag: "Seasonal" },
  { title: "Protein Harvest", sub: "Grilled chicken, ancient grain, tahini", calories: "530 kcal", image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=1200&auto=format&fit=crop", tag: "Chef's Pick" },
  { title: "Forest Elixir", sub: "Cold-pressed, adaptogens, enzymes", calories: "290 kcal", image: "https://images.unsplash.com/photo-1505252585461-04db1eb84625?q=80&w=1200&auto=format&fit=crop", tag: "New" },
];

function MenuSection() {
  const { isMobile, isTablet } = useBreakpoint();
  const px = isMobile ? "20px" : isTablet ? "32px" : "56px";
  const cols = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3, 1fr)";

  return (
    <section id="menu" style={{ padding: `${isMobile ? 80 : 120}px ${px}`, background: "#f5f0e8" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Reveal>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", marginBottom: isMobile ? 44 : 64, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 0 }}>
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8cb88c", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 12 }}>Curated Selection</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 44 : isTablet ? 56 : "clamp(48px, 5vw, 76px)", fontWeight: 600, color: "#1a2e1a", lineHeight: 1.05 }}>
                Featured<br /><span style={{ fontStyle: "italic", color: "#8cb88c" }}>Dishes</span>
              </h2>
            </div>
            <button style={{ padding: "12px 26px", borderRadius: 100, border: "1px solid rgba(45,74,45,0.25)", background: "transparent", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: "#2d4a2d", cursor: "pointer", whiteSpace: "nowrap" }}>
              Full Menu →
            </button>
          </div>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 24 }}>
          {menuDishes.map((dish, i) => (
            <Reveal key={dish.title} delay={i * 0.1}>
              <motion.div whileHover={{ y: -8, boxShadow: "0 24px 56px rgba(26,46,26,0.13)" }} transition={{ duration: 0.4 }}
                style={{ borderRadius: 24, overflow: "hidden", background: "#eae8e0", border: "1px solid rgba(140,184,140,0.15)", boxShadow: "0 4px 20px rgba(26,46,26,0.06)", cursor: "pointer" }}>
                <div style={{ position: "relative", overflow: "hidden" }}>
                  <motion.img whileHover={{ scale: 1.05 }} transition={{ duration: 0.6 }} src={dish.image}
                    style={{ width: "100%", height: isMobile ? 220 : 260, objectFit: "cover", display: "block" }} alt={dish.title} />
                  <div style={{ position: "absolute", top: 14, left: 14, padding: "5px 13px", borderRadius: 100, background: "rgba(245,240,232,0.9)", backdropFilter: "blur(8px)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#2d4a2d" }}>
                    {dish.tag}
                  </div>
                </div>
                <div style={{ padding: isMobile ? "20px 22px 24px" : "24px 28px 28px" }}>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 26 : 30, fontWeight: 700, color: "#1a2e1a", marginBottom: 6 }}>{dish.title}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#8a9080", lineHeight: 1.6, marginBottom: 18 }}>{dish.sub}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: "#2d4a2d" }}>{dish.calories}</span>
                    <motion.button whileHover={{ scale: 1.06, background: "#2d4a2d" }} whileTap={{ scale: 0.95 }}
                      style={{ padding: "10px 20px", borderRadius: 100, border: "none", background: "#1a2e1a", fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#f0ebe0", cursor: "pointer", transition: "background 0.2s" }}>
                      Add to Meal
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   MEAL BUILDER
───────────────────────────────────────────────────────────────*/
const ingredients = [
  { name: "Organic Chicken", detail: "Free-range · 31g protein per 100g", color: "#c8d8b0", cal: 165 },
  { name: "Ripe Avocado", detail: "Monounsaturated fats · Vitamin E", color: "#b8d4a8", cal: 80 },
  { name: "Heirloom Quinoa", detail: "Complete protein · Fibre-rich", color: "#d4c8a0", cal: 120 },
  { name: "Wild Salmon", detail: "Omega-3 · Heart-healthy", color: "#c8b8a0", cal: 208 },
  { name: "Sweet Potato", detail: "Beta-carotene · Complex carbs", color: "#d4b890", cal: 86 },
  { name: "Baby Spinach", detail: "Iron · Folate · Antioxidants", color: "#b0c8a0", cal: 23 },
];

function MealBuilder() {
  const { isMobile, isTablet } = useBreakpoint();
  const [selected, setSelected] = useState([]);
  const totalCal = selected.reduce((s, n) => s + (ingredients.find(i => i.name === n)?.cal || 0), 0);
  const totalProt = Math.round(totalCal * 0.26);
  const totalCarbs = Math.round(totalCal * 0.14);
  const totalFat = Math.round(totalCal * 0.06);
  const px = isMobile ? "20px" : isTablet ? "32px" : "56px";

  return (
    <section id="build-meal" style={{ padding: `${isMobile ? 80 : 120}px ${px}`, background: "linear-gradient(170deg, #eae8e0 0%, #e0e8d8 100%)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 1fr", gap: isMobile ? 40 : 72, alignItems: "start" }}>

        {/* Left */}
        <div>
          <Reveal>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8cb88c", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 12 }}>Smart Nutrition</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 40 : isTablet ? 52 : "clamp(44px, 5vw, 68px)", fontWeight: 600, color: "#1a2e1a", marginBottom: 14, lineHeight: 1.1 }}>
              Build Your<br />Own <span style={{ fontStyle: "italic", color: "#8cb88c" }}>Ritual</span>
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 15 : 17, color: "#6a7060", lineHeight: 1.7, marginBottom: 36, maxWidth: 400 }}>
              Select your ingredients. Our Nutrition AI assembles your perfect macro balance in real time.
            </p>
          </Reveal>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ingredients.map((ing, i) => {
              const isSel = selected.includes(ing.name);
              return (
                <Reveal key={ing.name} delay={i * 0.06} y={16}>
                  <motion.div
                    onClick={() => setSelected(p => isSel ? p.filter(x => x !== ing.name) : [...p, ing.name])}
                    whileHover={{ x: 4 }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "14px 16px" : "18px 22px", borderRadius: 16, border: `1px solid ${isSel ? "rgba(45,74,45,0.35)" : "rgba(140,184,140,0.18)"}`, background: isSel ? "rgba(45,74,45,0.07)" : "rgba(245,240,232,0.7)", cursor: "pointer", transition: "all 0.25s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: ing.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(26,46,26,0.22)" }} />
                      </div>
                      <div>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#1a2e1a" }}>{ing.name}</div>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#8a9080", marginTop: 2 }}>{ing.detail}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, fontWeight: 700, color: "#4a5040" }}>{ing.cal} kcal</span>
                      <motion.div animate={{ scale: isSel ? 1 : 0.85, opacity: isSel ? 1 : 0.4 }}
                        style={{ width: 32, height: 32, borderRadius: "50%", background: isSel ? "#2d4a2d" : "rgba(45,74,45,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: isSel ? "#f0ebe0" : "#4a5040", fontSize: 17, fontWeight: 700, flexShrink: 0, transition: "background 0.2s" }}>
                        {isSel ? "✓" : "+"}
                      </motion.div>
                    </div>
                  </motion.div>
                </Reveal>
              );
            })}
          </div>
        </div>

        {/* Right — Nutrition Panel */}
        <Reveal delay={0.15}>
          <div style={{ position: isMobile || isTablet ? "relative" : "sticky", top: 100 }}>
            <div style={{ borderRadius: 28, background: "#1a2e1a", padding: isMobile ? 24 : 36, boxShadow: "0 28px 72px rgba(26,46,26,0.2)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -50, right: -50, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(140,184,140,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 28 : 34, fontWeight: 700, color: "#f0ebe0" }}>Nutrition AI</h3>
                <div style={{ padding: "5px 14px", borderRadius: 100, background: "rgba(140,184,140,0.15)", border: "1px solid rgba(140,184,140,0.3)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#8cb88c", letterSpacing: "0.08em", textTransform: "uppercase" }}>Live</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[["Calories", `${totalCal}`, "kcal"], ["Protein", `${totalProt}`, "g"], ["Carbs", `${totalCarbs}`, "g"], ["Fat", `${totalFat}`, "g"]].map(([label, val, unit]) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 18, padding: isMobile ? "16px 18px" : "20px 22px", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(240,235,224,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
                    <motion.div key={val} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}
                      style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 36 : 44, fontWeight: 700, color: "#c8d8b0", lineHeight: 1 }}>
                      {val}<span style={{ fontSize: 15, color: "#8cb88c" }}>{unit}</span>
                    </motion.div>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(140,184,140,0.1)", borderRadius: 18, padding: "18px 20px", border: "1px solid rgba(140,184,140,0.15)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(240,235,224,0.7)" }}>Daily Energy Score</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: "#8cb88c" }}>{Math.min(96, selected.length * 16)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 100, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <motion.div animate={{ width: `${Math.min(96, selected.length * 16)}%` }} transition={{ duration: 0.5 }}
                    style={{ height: "100%", background: "linear-gradient(90deg, #8cb88c, #c8d8b0)", borderRadius: 100 }} />
                </div>
              </div>
              {selected.length === 0 && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(240,235,224,0.35)", textAlign: "center", marginTop: 16 }}>Select ingredients to begin</p>
              )}
              <motion.button whileHover={{ background: "#c8d8b0" }} whileTap={{ scale: 0.97 }}
                style={{ width: "100%", marginTop: 20, padding: "17px", borderRadius: 14, border: "none", background: "#8cb88c", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#1a2e1a", cursor: "pointer", transition: "all 0.2s" }}>
                Order My Meal — {selected.length} item{selected.length !== 1 ? "s" : ""}
              </motion.button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   CALORIE PLANNER (inverse)
───────────────────────────────────────────────────────────────*/
const plannerDishes = [
  { name: "Verdure Salad", cal: 410, protein: 12, carbs: 38, fat: 22, tag: "Light", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600&auto=format&fit=crop" },
  { name: "Protein Harvest Bowl", cal: 530, protein: 42, carbs: 31, fat: 18, tag: "High Protein", image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=600&auto=format&fit=crop" },
  { name: "Forest Elixir Smoothie", cal: 290, protein: 6, carbs: 52, fat: 8, tag: "Low Cal", image: "https://images.unsplash.com/photo-1505252585461-04db1eb84625?q=80&w=600&auto=format&fit=crop" },
  { name: "Green Power Bowl", cal: 520, protein: 38, carbs: 44, fat: 14, tag: "Balanced", image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?q=80&w=600&auto=format&fit=crop" },
  { name: "Citrus Detox Plate", cal: 220, protein: 8, carbs: 34, fat: 6, tag: "Light", image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=600&auto=format&fit=crop" },
  { name: "Salmon Omega Bowl", cal: 620, protein: 48, carbs: 36, fat: 26, tag: "High Protein", image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=600&auto=format&fit=crop" },
  { name: "Quinoa Harvest Plate", cal: 460, protein: 22, carbs: 58, fat: 12, tag: "Balanced", image: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=600&auto=format&fit=crop" },
  { name: "Avocado Nourish Bowl", cal: 380, protein: 14, carbs: 28, fat: 24, tag: "Keto-Friendly", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600&auto=format&fit=crop" },
];

const GOALS = [
  { label: "Lose Weight", mult: 0.80, desc: "Gentle calorie deficit" },
  { label: "Maintain", mult: 1.0, desc: "Sustain your balance" },
  { label: "Build Muscle", mult: 1.15, desc: "Fuel your growth" },
];

function CaloriePlanner() {
  const { isMobile, isTablet } = useBreakpoint();
  const [target, setTarget] = useState(2000);
  const [goal, setGoal] = useState("Maintain");
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [plan, setPlan] = useState([]);
  const [generated, setGenerated] = useState(false);
  const px = isMobile ? "20px" : isTablet ? "32px" : "56px";

  const mult = GOALS.find(g => g.label === goal)?.mult || 1;
  const effectiveCal = Math.round(target * mult);
  const perMeal = Math.round(effectiveCal / mealsPerDay);

  const generatePlan = () => {
    const sorted = [...plannerDishes].sort((a, b) => Math.abs(a.cal - perMeal) - Math.abs(b.cal - perMeal));
    setPlan(Array.from({ length: mealsPerDay }, (_, i) => sorted[i % sorted.length]));
    setGenerated(true);
  };

  const totalPlanned = plan.reduce((s, d) => s + d.cal, 0);
  const gap = effectiveCal - totalPlanned;

  // Responsive controls layout
  const controlsCols = isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1.2fr 1fr 1fr";

  return (
    <section id="calorie-planner" style={{ padding: `${isMobile ? 80 : 120}px ${px}`, background: "#f5f0e8" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: isMobile ? 44 : 64 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8cb88c", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14 }}>Your Daily Plan</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 38 : isTablet ? 52 : "clamp(48px, 5vw, 76px)", fontWeight: 600, color: "#1a2e1a", lineHeight: 1.1, marginBottom: 18 }}>
              Tell Us Your Goal.<br />
              <span style={{ fontStyle: "italic", color: "#8cb88c" }}>We'll Build the Menu.</span>
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: isMobile ? 15 : 18, color: "#6a7060", lineHeight: 1.7, maxWidth: 500, margin: "0 auto" }}>
              Set your daily calorie target and wellness goal — our kitchen handpicks the perfect combination of dishes just for you.
            </p>
          </div>
        </Reveal>

        {/* Controls card */}
        <Reveal delay={0.1}>
          <div style={{ background: "#1a2e1a", borderRadius: isMobile ? 24 : 32, padding: isMobile ? "28px 24px" : isTablet ? "40px 36px" : "48px 52px", marginBottom: 44, boxShadow: "0 28px 72px rgba(26,46,26,0.22)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -60, right: -60, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(140,184,140,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

            <div style={{ display: "grid", gridTemplateColumns: controlsCols, gap: isMobile ? 32 : 44, position: "relative" }}>

              {/* Slider */}
              <div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(200,216,176,0.65)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>Daily Calorie Target</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 18 }}>
                  <motion.span key={target} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                    style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 52 : 62, fontWeight: 700, color: "#c8d8b0", lineHeight: 1 }}>
                    {target.toLocaleString()}
                  </motion.span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, color: "#8cb88c" }}>kcal</span>
                </div>
                <input type="range" min={1200} max={4000} step={50} value={target}
                  onChange={e => { setTarget(Number(e.target.value)); setGenerated(false); }}
                  style={{ width: "100%", cursor: "pointer", accentColor: "#8cb88c" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(240,235,224,0.3)" }}>1,200</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(240,235,224,0.3)" }}>4,000</span>
                </div>
                {/* Live summary */}
                <div style={{ marginTop: 22, background: "rgba(140,184,140,0.08)", borderRadius: 16, padding: "16px 18px", border: "1px solid rgba(140,184,140,0.15)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(240,235,224,0.45)", marginBottom: 4 }}>Adjusted target</div>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 34 : 40, fontWeight: 700, color: "#8cb88c", lineHeight: 1 }}>{effectiveCal.toLocaleString()}<span style={{ fontSize: 14 }}> kcal</span></div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(240,235,224,0.45)", marginBottom: 4 }}>Per meal</div>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 34 : 40, fontWeight: 700, color: "#c8d8b0", lineHeight: 1 }}>{perMeal}<span style={{ fontSize: 14 }}> kcal</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Goal selector */}
              <div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(200,216,176,0.65)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>Wellness Goal</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {GOALS.map(g => (
                    <motion.div key={g.label} onClick={() => { setGoal(g.label); setGenerated(false); }} whileHover={{ x: 3 }}
                      style={{ padding: "14px 18px", borderRadius: 14, border: `1px solid ${goal === g.label ? "rgba(140,184,140,0.55)" : "rgba(255,255,255,0.07)"}`, background: goal === g.label ? "rgba(140,184,140,0.12)" : "rgba(255,255,255,0.04)", cursor: "pointer", transition: "all 0.2s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: goal === g.label ? "#c8d8b0" : "rgba(240,235,224,0.55)" }}>{g.label}</span>
                        {goal === g.label && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#8cb88c" }} />}
                      </div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(240,235,224,0.32)", marginTop: 3 }}>{g.desc}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Meals per day + generate */}
              <div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(200,216,176,0.65)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>Meals Per Day</div>
                <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
                  {[2, 3, 4].map(n => (
                    <motion.button key={n} onClick={() => { setMealsPerDay(n); setGenerated(false); }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }}
                      style={{ flex: 1, padding: "18px 0", borderRadius: 14, border: `1px solid ${mealsPerDay === n ? "rgba(140,184,140,0.55)" : "rgba(255,255,255,0.07)"}`, background: mealsPerDay === n ? "rgba(140,184,140,0.15)" : "rgba(255,255,255,0.04)", fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 700, color: mealsPerDay === n ? "#c8d8b0" : "rgba(240,235,224,0.28)", cursor: "pointer", transition: "all 0.2s" }}>
                      {n}
                    </motion.button>
                  ))}
                </div>
                <motion.button onClick={generatePlan} whileHover={{ scale: 1.03, background: "#c8d8b0" }} whileTap={{ scale: 0.97 }}
                  style={{ width: "100%", padding: "18px", borderRadius: 16, border: "none", background: "#8cb88c", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, color: "#1a2e1a", cursor: "pointer", transition: "all 0.2s" }}>
                  Generate My Meal Plan ↓
                </motion.button>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Results */}
        <AnimatePresence>
          {generated && (
            <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>

              {/* Plan header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", marginBottom: 32, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0 }}>
                <div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8cb88c", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Your Personalised Plan</div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 36 : 48, fontWeight: 600, color: "#1a2e1a" }}>
                    {mealsPerDay} Meals · {goal}
                  </h3>
                </div>
                <div style={{ textAlign: isMobile ? "left" : "right" }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#8a9080", marginBottom: 3 }}>Total planned</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 32 : 40, fontWeight: 700, color: gap >= 0 ? "#2d4a2d" : "#a05040" }}>
                    {totalPlanned.toLocaleString()} kcal
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: gap >= 0 ? "#8cb88c" : "#c08070" }}>
                    {Math.abs(gap)} kcal {gap >= 0 ? "under" : "over"} target
                  </div>
                </div>
              </div>

              {/* Dish cards */}
              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : isTablet ? (mealsPerDay === 2 ? "1fr 1fr" : "1fr 1fr") : `repeat(${Math.min(mealsPerDay, 3)}, 1fr)`,
                gap: 20, marginBottom: 28,
              }}>
                {plan.map((dish, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1, duration: 0.6 }}
                    style={{ borderRadius: 22, overflow: "hidden", background: "#eae8e0", border: "1px solid rgba(140,184,140,0.18)", boxShadow: "0 4px 20px rgba(26,46,26,0.07)" }}>
                    <div style={{ position: "relative" }}>
                      <img src={dish.image} style={{ width: "100%", height: isMobile ? 180 : 200, objectFit: "cover", display: "block" }} alt={dish.name}
                        onError={e => { e.target.src = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600&auto=format&fit=crop"; }} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 40%, rgba(26,46,26,0.4) 100%)" }} />
                      <div style={{ position: "absolute", top: 12, left: 12, padding: "5px 12px", borderRadius: 100, background: "rgba(245,240,232,0.92)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#2d4a2d" }}>Meal {i + 1}</div>
                      <div style={{ position: "absolute", top: 12, right: 12, padding: "5px 12px", borderRadius: 100, background: "rgba(26,46,26,0.72)", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#c8d8b0" }}>{dish.tag}</div>
                    </div>
                    <div style={{ padding: isMobile ? "18px 20px" : "22px 24px" }}>
                      <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 24 : 28, fontWeight: 700, color: "#1a2e1a", marginBottom: 14, lineHeight: 1.15 }}>{dish.name}</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                        {[["Calories", `${dish.cal} kcal`], ["Protein", `${dish.protein}g`], ["Carbs", `${dish.carbs}g`], ["Fat", `${dish.fat}g`]].map(([k, v]) => (
                          <div key={k} style={{ background: "rgba(245,240,232,0.85)", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#8a9080", letterSpacing: "0.05em", textTransform: "uppercase" }}>{k}</div>
                            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700, color: "#2d4a2d", marginTop: 2 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <motion.button whileHover={{ background: "#2d4a2d" }} whileTap={{ scale: 0.97 }}
                        style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#1a2e1a", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: "#f0ebe0", cursor: "pointer", transition: "background 0.2s" }}>
                        Add to Order
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Day total banner */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                style={{ background: "linear-gradient(135deg, #1a2e1a 0%, #2d4a2d 100%)", borderRadius: 22, padding: isMobile ? "24px 22px" : "28px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 20 : 0 }}>
                <div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(200,216,176,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Full Day Macros</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 20 : 28, fontWeight: 700, color: "#c8d8b0" }}>
                    {plan.reduce((s, d) => s + d.protein, 0)}g protein · {plan.reduce((s, d) => s + d.carbs, 0)}g carbs · {plan.reduce((s, d) => s + d.fat, 0)}g fat
                  </div>
                </div>
                <motion.button whileHover={{ scale: 1.04, background: "#c8d8b0" }} whileTap={{ scale: 0.97 }}
                  style={{ padding: isMobile ? "15px 28px" : "18px 36px", borderRadius: 100, border: "none", background: "#8cb88c", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#1a2e1a", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap", width: isMobile ? "100%" : "auto" }}>
                  Order Full Day Plan
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   AUTH
───────────────────────────────────────────────────────────────*/
function AuthSection() {
  const { isMobile, isTablet } = useBreakpoint();
  const px = isMobile ? "20px" : isTablet ? "32px" : "56px";

  return (
    <section style={{ padding: `${isMobile ? 80 : 120}px ${px}`, background: "linear-gradient(170deg, #eae8e0 0%, #e0e8d8 100%)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: isMobile ? 44 : 64 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#8cb88c", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14 }}>Join the Community</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 36 : isTablet ? 50 : "clamp(44px, 5vw, 68px)", fontWeight: 600, color: "#1a2e1a" }}>
              Begin Your <span style={{ fontStyle: "italic", color: "#8cb88c" }}>Wellness</span> Journey
            </h2>
          </div>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24 }}>
          {/* Login */}
          <Reveal delay={0.1}>
            <div style={{ borderRadius: 28, background: "#f0ebe0", padding: isMobile ? 28 : 44, border: "1px solid rgba(140,184,140,0.2)", boxShadow: "0 8px 40px rgba(26,46,26,0.06)" }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 32 : 40, fontWeight: 700, color: "#1a2e1a", marginBottom: 28 }}>Welcome Back</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[["Email", "text"], ["Password", "password"]].map(([ph, type]) => (
                  <input key={ph} placeholder={ph} type={type}
                    style={{ padding: "16px 20px", borderRadius: 12, border: "1px solid rgba(140,184,140,0.25)", background: "rgba(245,240,232,0.7)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#1a2e1a", outline: "none", width: "100%" }}
                    onFocus={e => e.target.style.borderColor = "rgba(45,74,45,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(140,184,140,0.25)"} />
                ))}
                <motion.button whileHover={{ scale: 1.02, background: "#2d4a2d" }} whileTap={{ scale: 0.98 }}
                  style={{ padding: "17px", borderRadius: 12, border: "none", background: "#1a2e1a", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, color: "#f0ebe0", cursor: "pointer", transition: "background 0.2s", marginTop: 4 }}>
                  Enter Kitchen
                </motion.button>
              </div>
            </div>
          </Reveal>

          {/* Sign up */}
          <Reveal delay={isMobile ? 0 : 0.15}>
            <div style={{ borderRadius: 28, background: "#1a2e1a", padding: isMobile ? 28 : 44, boxShadow: "0 8px 40px rgba(26,46,26,0.15)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", bottom: -36, right: -36, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(140,184,140,0.12) 0%, transparent 70%)" }} />
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: isMobile ? 32 : 40, fontWeight: 700, color: "#f0ebe0", marginBottom: 28 }}>Start Fresh</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[["Full Name", "text"], ["Email", "text"], ["Password", "password"]].map(([ph, type]) => (
                  <input key={ph} placeholder={ph} type={type}
                    style={{ padding: "16px 20px", borderRadius: 12, border: "1px solid rgba(140,184,140,0.2)", background: "rgba(255,255,255,0.06)", fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#f0ebe0", outline: "none", width: "100%" }}
                    onFocus={e => e.target.style.borderColor = "rgba(140,184,140,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(140,184,140,0.2)"} />
                ))}
                <motion.button whileHover={{ scale: 1.02, background: "#c8d8b0" }} whileTap={{ scale: 0.98 }}
                  style={{ padding: "17px", borderRadius: 12, border: "none", background: "#8cb88c", fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, color: "#1a2e1a", cursor: "pointer", transition: "background 0.2s", marginTop: 4 }}>
                  Begin My Journey
                </motion.button>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   FOOTER
───────────────────────────────────────────────────────────────*/
function Footer() {
  const { isMobile } = useBreakpoint();
  return (
    <footer style={{ padding: isMobile ? "48px 20px" : "60px 56px", background: "#1a2e1a", borderTop: "1px solid rgba(140,184,140,0.1)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 28 : 0 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: "#c8d8b0", letterSpacing: "0.04em" }}>Healthy Kitchen</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "rgba(240,235,224,0.4)", marginTop: 5 }}>The art of intentional nourishment.</div>
        </div>
        <div style={{ display: "flex", gap: isMobile ? 24 : 36, flexWrap: "wrap" }}>
          {["Instagram", "Journal", "Contact"].map(link => (
            <a key={link} href="#" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(240,235,224,0.5)", textDecoration: "none", letterSpacing: "0.07em", textTransform: "uppercase", transition: "color 0.2s" }}
              onMouseEnter={e => e.target.style.color = "#8cb88c"}
              onMouseLeave={e => e.target.style.color = "rgba(240,235,224,0.5)"}>{link}</a>
          ))}
        </div>
        {!isMobile && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(240,235,224,0.3)" }}>© 2026 Healthy Kitchen</div>}
        {isMobile && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(240,235,224,0.3)" }}>© 2026 Healthy Kitchen</div>}
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────
   APP ROOT
───────────────────────────────────────────────────────────────*/
export default function HealthyKitchenApp() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(140,184,140,0.25); }
        input::placeholder { color: rgba(74,80,64,0.45); }
        input[type=range] {
          -webkit-appearance: none; appearance: none;
          height: 6px; border-radius: 100px;
          background: rgba(140,184,140,0.25); outline: none; width: 100%;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 22px; height: 22px;
          border-radius: 50%; background: #8cb88c; cursor: pointer;
          border: 3px solid #1a2e1a; box-shadow: 0 2px 8px rgba(26,46,26,0.35);
        }
        input[type=range]::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: #8cb88c; cursor: pointer; border: 3px solid #1a2e1a;
        }
        @media (max-width: 639px) {
          html { -webkit-text-size-adjust: 100%; }
        }
      `}</style>
      <Grain />
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#f5f0e8", overflowX: "hidden" }}>
        <Nav />
        <Hero />
        <MenuSection />
        <MealBuilder />
        <CaloriePlanner />
        <AuthSection />
        <Footer />
      </div>
    </>
  );
}