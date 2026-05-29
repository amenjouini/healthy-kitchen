import { useState, useEffect, useRef, createContext, useContext } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useInView } from "framer-motion";

/* ══════════════════════════════════════════════════
   TRANSLATIONS
══════════════════════════════════════════════════ */
const TRANSLATIONS = {
  fr: {
    dir: "ltr",
    nav: {
      menu: "Menu", build: "Composer", plan: "Mon Plan",
      signIn: "Connexion", getStarted: "Commencer",
    },
    badge: "Expérience Bien-Être Premium",
    heroH1: ["Nourrir", "votre", "Nature."],
    heroSub: "Un sanctuaire de saveurs et de vitalité. Chaque plat cuisiné avec intention — où l'art culinaire rencontre le bien-être holistique.",
    exploreBtn: "Explorer le Menu",
    buildBtn: "Composer un Repas",
    stats: [["12K+","Repas créés"],["98%","Satisfaction"],["24/7","Suivi Nutrition"]],
    dishCardName: "Bol Vert Énergie",
    dishCardSub: "Saisonnier · Bio · Choix du Chef",
    energyScore: "Score Énergie",
    menuLabel: "Sélection Curatée",
    menuH2: ["Plats", "Vedettes"],
    fullMenu: "Menu Complet →",
    addToMeal: "Ajouter",
    menuDishes: [
      { title:"Salade Verdure", sub:"Jeunes pousses, agrumes, microherbes", tag:"Saisonnier" },
      { title:"Bol Protéiné", sub:"Poulet grillé, céréales anciennes, tahini", tag:"Choix du Chef" },
      { title:"Élixir Forêt", sub:"Pressé à froid, adaptogènes, enzymes", tag:"Nouveau" },
    ],
    builderLabel: "Nutrition Intelligente",
    builderH2: ["Composez Votre", "Rituel"],
    builderSub: "Sélectionnez vos ingrédients. Notre IA Nutrition assemble votre équilibre macro parfait en temps réel.",
    aiTitle: "IA Nutrition", live: "En direct",
    macroLabels: ["Calories","Protéines","Glucides","Lipides"],
    priceLabel: "Prix",
    totalPriceLabel: "Total",
    currencySymbol: "DT",
    energyScoreLabel: "Score Énergie Quotidien",
    builderEmpty: "Sélectionnez des ingrédients pour commencer",
    builderOrder: n => `Commander mon Repas — ${n} article${n!==1?"s":""}`,
    ingredients: [
      { name:"Poulet Bio", detail:"Élevage plein air · 31g protéines/100g" },
      { name:"Avocat Mûr", detail:"Graisses mono-insaturées · Vitamine E" },
      { name:"Quinoa Heirloom", detail:"Protéine complète · Riche en fibres" },
      { name:"Saumon Sauvage", detail:"Oméga-3 · Bon pour le cœur" },
      { name:"Patate Douce", detail:"Bêta-carotène · Glucides complexes" },
      { name:"Épinards Tendres", detail:"Fer · Folate · Antioxydants" },
    ],
    plannerLabel: "Votre Plan Quotidien",
    plannerH2: ["Dites-nous Votre Objectif.", "On Compose le Menu."],
    plannerSub: "Définissez votre apport calorique et votre objectif bien-être — notre cuisine sélectionne la combinaison parfaite de plats rien que pour vous.",
    sliderLabel: "Objectif Calorique Quotidien",
    adjustedLabel: "Objectif ajusté", perMealLabel: "Par repas",
    goalLabel: "Objectif Bien-Être",
    mealsLabel: "Repas par Jour",
    generateBtn: "Générer Mon Plan de Repas ↓",
    planResultLabel: "Votre Plan Personnalisé",
    totalPlannedLabel: "Total planifié",
    underTarget: "kcal sous l'objectif", overTarget: "kcal au-dessus",
    mealCard: i => `Repas ${i+1}`,
    addOrder: "Ajouter à la Commande",
    macrosLabel: "Macros de la Journée",
    macroUnits: ["protéines","glucides","lipides"],
    orderFull: "Commander le Plan Complet",
    goals: [
      { label:"Perdre du Poids", mult:0.80, desc:"Léger déficit calorique" },
      { label:"Maintenir", mult:1.0, desc:"Équilibre durable" },
      { label:"Prendre de la Masse", mult:1.15, desc:"Surplus pour la croissance" },
    ],
    plannerDishes: [
      { name:"Salade Verdure", tag:"Léger" },
      { name:"Bol Protéiné", tag:"Riche Protéines" },
      { name:"Smoothie Élixir Forêt", tag:"Faible Cal." },
      { name:"Bol Vert Énergie", tag:"Équilibré" },
      { name:"Assiette Détox Agrumes", tag:"Léger" },
      { name:"Bol Oméga Saumon", tag:"Riche Protéines" },
      { name:"Assiette Quinoa", tag:"Équilibré" },
      { name:"Bol Avocat Nourrissant", tag:"Céto-Friendly" },
    ],
    authLabel: "Rejoignez la Communauté",
    authH2: ["Commencez Votre", "Voyage Bien-Être"],
    loginTitle: "Bon Retour",
    emailPh: "Email", passwordPh: "Mot de passe",
    loginBtn: "Entrer dans la Cuisine",
    signupTitle: "Nouveau Départ",
    fullNamePh: "Nom complet",
    signupBtn: "Commencer Mon Voyage",
    footerTagline: "L'art d'une nourriture intentionnelle.",
    footerLinks: ["Instagram","Journal","Contact"],
    copyright: "© 2026 Healthy Kitchen",
  },
  en: {
    dir: "ltr",
    nav: {
      menu: "Menu", build: "Build Meal", plan: "My Plan",
      signIn: "Sign In", getStarted: "Get Started",
    },
    badge: "Premium Wellness Experience",
    heroH1: ["Nourish","your","Nature."],
    heroSub: "A sanctuary of flavour and vitality. Every dish curated with intention — where culinary artistry meets holistic wellness.",
    exploreBtn: "Explore Menu",
    buildBtn: "Build a Meal",
    stats: [["12K+","Meals crafted"],["98%","Satisfaction"],["24/7","Nutrition AI"]],
    dishCardName: "Green Power Bowl",
    dishCardSub: "Seasonal · Organic · Chef's Pick",
    energyScore: "Energy Score",
    menuLabel: "Curated Selection",
    menuH2: ["Featured","Dishes"],
    fullMenu: "Full Menu →",
    addToMeal: "Add to Meal",
    menuDishes: [
      { title:"Verdure Salad", sub:"Heirloom greens, citrus, microherbs", tag:"Seasonal" },
      { title:"Protein Harvest", sub:"Grilled chicken, ancient grain, tahini", tag:"Chef's Pick" },
      { title:"Forest Elixir", sub:"Cold-pressed, adaptogens, enzymes", tag:"New" },
    ],
    builderLabel: "Smart Nutrition",
    builderH2: ["Build Your","Own Ritual"],
    builderSub: "Select your ingredients. Our Nutrition AI assembles your perfect macro balance in real time.",
    aiTitle: "Nutrition AI", live: "Live",
    macroLabels: ["Calories","Protein","Carbs","Fat"],
    priceLabel: "Price",
    totalPriceLabel: "Total",
    currencySymbol: "DT",
    energyScoreLabel: "Daily Energy Score",
    builderEmpty: "Select ingredients to begin",
    builderOrder: n => `Order My Meal — ${n} item${n!==1?"s":""}`,
    ingredients: [
      { name:"Organic Chicken", detail:"Free-range · 31g protein per 100g" },
      { name:"Ripe Avocado", detail:"Monounsaturated fats · Vitamin E" },
      { name:"Heirloom Quinoa", detail:"Complete protein · Fibre-rich" },
      { name:"Wild Salmon", detail:"Omega-3 · Heart-healthy" },
      { name:"Sweet Potato", detail:"Beta-carotene · Complex carbs" },
      { name:"Baby Spinach", detail:"Iron · Folate · Antioxidants" },
    ],
    plannerLabel: "Your Daily Plan",
    plannerH2: ["Tell Us Your Goal.","We'll Build the Menu."],
    plannerSub: "Set your daily calorie target and wellness goal — our kitchen handpicks the perfect combination of dishes just for you.",
    sliderLabel: "Daily Calorie Target",
    adjustedLabel: "Adjusted target", perMealLabel: "Per meal",
    goalLabel: "Wellness Goal",
    mealsLabel: "Meals Per Day",
    generateBtn: "Generate My Meal Plan ↓",
    planResultLabel: "Your Personalised Plan",
    totalPlannedLabel: "Total planned",
    underTarget: "kcal under target", overTarget: "kcal over target",
    mealCard: i => `Meal ${i+1}`,
    addOrder: "Add to Order",
    macrosLabel: "Full Day Macros",
    macroUnits: ["protein","carbs","fat"],
    orderFull: "Order Full Day Plan",
    goals: [
      { label:"Lose Weight", mult:0.80, desc:"Gentle calorie deficit" },
      { label:"Maintain", mult:1.0, desc:"Sustain your balance" },
      { label:"Build Muscle", mult:1.15, desc:"Fuel your growth" },
    ],
    plannerDishes: [
      { name:"Verdure Salad", tag:"Light" },
      { name:"Protein Harvest Bowl", tag:"High Protein" },
      { name:"Forest Elixir Smoothie", tag:"Low Cal" },
      { name:"Green Power Bowl", tag:"Balanced" },
      { name:"Citrus Detox Plate", tag:"Light" },
      { name:"Salmon Omega Bowl", tag:"High Protein" },
      { name:"Quinoa Harvest Plate", tag:"Balanced" },
      { name:"Avocado Nourish Bowl", tag:"Keto-Friendly" },
    ],
    authLabel: "Join the Community",
    authH2: ["Begin Your","Wellness Journey"],
    loginTitle: "Welcome Back",
    emailPh: "Email", passwordPh: "Password",
    loginBtn: "Enter Kitchen",
    signupTitle: "Start Fresh",
    fullNamePh: "Full Name",
    signupBtn: "Begin My Journey",
    footerTagline: "The art of intentional nourishment.",
    footerLinks: ["Instagram","Journal","Contact"],
    copyright: "© 2026 Healthy Kitchen",
  },
  ar: {
    dir: "rtl",
    nav: {
      menu: "القائمة", build: "تكوين وجبة", plan: "خطتي",
      signIn: "تسجيل الدخول", getStarted: "ابدأ الآن",
    },
    badge: "تجربة صحية متميزة",
    heroH1: ["غذِّ","طبيعتك","بحب."],
    heroSub: "ملاذ للنكهة والحيوية. كل طبق مُعَدّ بعناية — حيث يلتقي الفن الطهوي بالعافية الشاملة.",
    exploreBtn: "استعرض القائمة",
    buildBtn: "كوّن وجبتك",
    stats: [["12K+","وجبة مُعَدّة"],["98%","رضا العملاء"],["24/7","تتبع التغذية"]],
    dishCardName: "طبق الطاقة الخضراء",
    dishCardSub: "موسمي · عضوي · اختيار الشيف",
    energyScore: "نقاط الطاقة",
    menuLabel: "تشكيلة مختارة",
    menuH2: ["أطباقنا","المميزة"],
    fullMenu: "← القائمة الكاملة",
    addToMeal: "أضف للوجبة",
    menuDishes: [
      { title:"سلطة الخضار", sub:"خضار طازجة، حمضيات، أعشاب دقيقة", tag:"موسمي" },
      { title:"طبق البروتين", sub:"دجاج مشوي، حبوب قديمة، طحينة", tag:"اختيار الشيف" },
      { title:"إكسير الغابة", sub:"عصير بارد، مكيفات، إنزيمات", tag:"جديد" },
    ],
    builderLabel: "تغذية ذكية",
    builderH2: ["كوّن","طقوسك الخاصة"],
    builderSub: "اختر مكوناتك. يقوم الذكاء الاصطناعي للتغذية بتجميع توازن المكروغذائيات المثالي لك في الوقت الفعلي.",
    aiTitle: "ذكاء التغذية", live: "مباشر",
    macroLabels: ["السعرات","البروتين","الكربوهيدرات","الدهون"],
    priceLabel: "السعر",
    totalPriceLabel: "الإجمالي",
    currencySymbol: "د.ت",
    energyScoreLabel: "مؤشر الطاقة اليومي",
    builderEmpty: "اختر المكونات للبدء",
    builderOrder: n => `اطلب وجبتي — ${n} ${n===1?"عنصر":"عناصر"}`,
    ingredients: [
      { name:"دجاج عضوي", detail:"تربية حرة · 31 غ بروتين/100 غ" },
      { name:"أفوكادو ناضج", detail:"دهون أحادية · فيتامين E" },
      { name:"كينوا أصيلة", detail:"بروتين كامل · غنية بالألياف" },
      { name:"سلمون بري", detail:"أوميغا-3 · صحة القلب" },
      { name:"بطاطا حلوة", detail:"بيتا كاروتين · كربوهيدرات معقدة" },
      { name:"سبانخ طازجة", detail:"حديد · حمض الفوليك · مضادات أكسدة" },
    ],
    plannerLabel: "خطتك اليومية",
    plannerH2: ["أخبرنا بهدفك.","سنبني قائمتك."],
    plannerSub: "حدد هدفك اليومي من السعرات ونوع هدفك الصحي — ستختار مطبخنا التوليفة المثالية من الأطباق خصيصًا لك.",
    sliderLabel: "الهدف اليومي من السعرات",
    adjustedLabel: "الهدف المعدَّل", perMealLabel: "لكل وجبة",
    goalLabel: "هدفك الصحي",
    mealsLabel: "عدد الوجبات يومياً",
    generateBtn: "↓ توليد خطة وجباتي",
    planResultLabel: "خطتك الشخصية",
    totalPlannedLabel: "إجمالي المخطط",
    underTarget: "سعرة دون الهدف", overTarget: "سعرة فوق الهدف",
    mealCard: i => `وجبة ${i+1}`,
    addOrder: "أضف للطلب",
    macrosLabel: "مكروغذائيات اليوم",
    macroUnits: ["بروتين","كربوهيدرات","دهون"],
    orderFull: "اطلب خطة اليوم الكاملة",
    goals: [
      { label:"خسارة الوزن", mult:0.80, desc:"عجز خفيف في السعرات" },
      { label:"الحفاظ على الوزن", mult:1.0, desc:"استدامة التوازن" },
      { label:"بناء العضلات", mult:1.15, desc:"فائض لدعم النمو" },
    ],
    plannerDishes: [
      { name:"سلطة الخضار", tag:"خفيف" },
      { name:"bol البروتين", tag:"غني بالبروتين" },
      { name:"سموذي إكسير الغابة", tag:"منخفض السعرات" },
      { name:"طبق الطاقة الخضراء", tag:"متوازن" },
      { name:"طبق ديتوكس الحمضيات", tag:"خفيف" },
      { name:"bol سلمون أوميغا", tag:"غني بالبروتين" },
      { name:"طبق كينوا الحصاد", tag:"متوازن" },
      { name:"bol الأفوكادو المغذي", tag:"كيتو" },
    ],
    authLabel: "انضم إلى المجتمع",
    authH2: ["ابدأ رحلتك","نحو العافية"],
    loginTitle: "أهلاً بعودتك",
    emailPh: "البريد الإلكتروني", passwordPh: "كلمة المرور",
    loginBtn: "ادخل المطبخ",
    signupTitle: "بداية جديدة",
    fullNamePh: "الاسم الكامل",
    signupBtn: "ابدأ رحلتي",
    footerTagline: "فن التغذية المقصودة.",
    footerLinks: ["إنستغرام","المدوّنة","تواصل معنا"],
    copyright: "© 2026 Healthy Kitchen",
  },
};

/* ══════════════════════════════════════════════════
   CONTEXT
══════════════════════════════════════════════════ */
const LangCtx = createContext({ lang:"fr", t:TRANSLATIONS.fr, setLang:()=>{} });
const useLang = () => useContext(LangCtx);

/* ══════════════════════════════════════════════════
   HOOKS
══════════════════════════════════════════════════ */
function useBreakpoint() {
  const [w,setW] = useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{
    const fn=()=>setW(window.innerWidth);
    window.addEventListener("resize",fn);
    return ()=>window.removeEventListener("resize",fn);
  },[]);
  return { isMobile:w<640, isTablet:w>=640&&w<1024, isDesktop:w>=1024 };
}

function Reveal({children,delay=0,y=24}) {
  const ref=useRef(null);
  const inView=useInView(ref,{once:true,margin:"-50px"});
  return (
    <motion.div ref={ref}
      initial={{opacity:0,y}}
      animate={inView?{opacity:1,y:0}:{}}
      transition={{duration:0.8,delay,ease:[0.22,1,0.36,1]}}>
      {children}
    </motion.div>
  );
}

function Grain() {
  return (
    <div style={{
      position:"fixed",inset:0,pointerEvents:"none",zIndex:100,opacity:0.028,
      backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundSize:"180px 180px",
    }}/>
  );
}

/* ══════════════════════════════════════════════════
   LANGUAGE SWITCHER
══════════════════════════════════════════════════ */
function LangSwitcher() {
  const {lang,setLang}=useLang();
  return (
    <div style={{display:"flex",gap:3,background:"rgba(45,74,45,0.09)",borderRadius:100,padding:"3px 4px",border:"1px solid rgba(45,74,45,0.13)"}}>
      {[["fr","FR"],["en","EN"],["ar","ع"]].map(([code,label])=>(
        <motion.button key={code} onClick={()=>setLang(code)} whileTap={{scale:0.93}}
          style={{
            padding:"5px 11px",borderRadius:100,border:"none",cursor:"pointer",
            fontFamily:code==="ar"?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif",
            fontSize:code==="ar"?14:12,fontWeight:700,
            color:lang===code?"#f0ebe0":"#4a5040",
            background:lang===code?"#1a2e1a":"transparent",
            transition:"all 0.2s",
          }}>
          {label}
        </motion.button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   NAV
══════════════════════════════════════════════════ */
function Nav() {
  const {t}=useLang();
  const {isMobile}=useBreakpoint();
  const [scrolled,setScrolled]=useState(false);
  const [open,setOpen]=useState(false);
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";

  useEffect(()=>{
    const fn=()=>setScrolled(window.scrollY>40);
    window.addEventListener("scroll",fn);
    return ()=>window.removeEventListener("scroll",fn);
  },[]);

  const links=[[t.nav.menu,"#menu"],[t.nav.build,"#build-meal"],[t.nav.plan,"#calorie-planner"]];

  return (
    <>
      <motion.nav
        initial={{y:-80,opacity:0}} animate={{y:0,opacity:1}}
        transition={{duration:0.9,ease:[0.22,1,0.36,1]}}
        style={{
          position:"fixed",top:0,left:0,right:0,zIndex:200,
          padding:isMobile?"0 16px":"0 40px",
          height:isMobile?64:72,
          display:"flex",alignItems:"center",justifyContent:"space-between",
          background:scrolled||open?"rgba(245,240,232,0.97)":"transparent",
          backdropFilter:scrolled||open?"blur(24px)":"none",
          borderBottom:scrolled||open?"1px solid rgba(140,184,140,0.18)":"none",
          transition:"all 0.4s ease",
          direction:t.dir,
        }}>

        {/* Logo */}
        <img src="/logo_png.png" alt="Healthy Kitchen"
          style={{height:isMobile?40:50,width:"auto",objectFit:"contain",display:"block"}}/>

        {/* Desktop links */}
        {!isMobile && (
          <div style={{display:"flex",gap:32}}>
            {links.map(([label,href])=>(
              <a key={label} href={href}
                style={{fontFamily:ff,fontSize:14,fontWeight:500,color:"#4a5040",textDecoration:"none",
                  letterSpacing:isRTL?0:"0.04em",textTransform:isRTL?"none":"uppercase",transition:"color 0.2s"}}
                onMouseEnter={e=>e.target.style.color="#2d4a2d"}
                onMouseLeave={e=>e.target.style.color="#4a5040"}>{label}</a>
            ))}
          </div>
        )}

        {/* Desktop right */}
        {!isMobile && (
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <LangSwitcher/>
            <button style={{padding:"9px 20px",borderRadius:100,border:"1px solid rgba(45,74,45,0.28)",
              background:"transparent",fontFamily:ff,fontSize:13,fontWeight:500,color:"#2d4a2d",cursor:"pointer"}}>
              {t.nav.signIn}
            </button>
            <motion.button whileHover={{scale:1.04}} whileTap={{scale:0.97}}
              style={{padding:"9px 20px",borderRadius:100,border:"none",background:"#1a2e1a",
                fontFamily:ff,fontSize:13,fontWeight:600,color:"#f0ebe0",cursor:"pointer"}}>
              {t.nav.getStarted}
            </motion.button>
          </div>
        )}

        {/* Mobile: switcher + hamburger */}
        {isMobile && (
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <LangSwitcher/>
            <button onClick={()=>setOpen(o=>!o)}
              style={{background:"none",border:"none",cursor:"pointer",padding:8,display:"flex",flexDirection:"column",gap:5}}>
              <motion.span animate={{rotate:open?45:0,y:open?9:0}}
                style={{display:"block",width:22,height:2,background:"#1a2e1a",borderRadius:2,transformOrigin:"center"}}/>
              <motion.span animate={{opacity:open?0:1}}
                style={{display:"block",width:22,height:2,background:"#1a2e1a",borderRadius:2}}/>
              <motion.span animate={{rotate:open?-45:0,y:open?-9:0}}
                style={{display:"block",width:22,height:2,background:"#1a2e1a",borderRadius:2,transformOrigin:"center"}}/>
            </button>
          </div>
        )}
      </motion.nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isMobile&&open&&(
          <motion.div initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-16}}
            transition={{duration:0.28}}
            style={{position:"fixed",top:64,left:0,right:0,zIndex:190,
              background:"rgba(245,240,232,0.98)",backdropFilter:"blur(24px)",
              borderBottom:"1px solid rgba(140,184,140,0.18)",
              padding:"20px 20px 24px",display:"flex",flexDirection:"column",direction:t.dir}}>
            {links.map(([label,href])=>(
              <a key={label} href={href} onClick={()=>setOpen(false)}
                style={{fontFamily:ff,fontSize:16,fontWeight:600,color:"#1a2e1a",textDecoration:"none",
                  padding:"13px 0",borderBottom:"1px solid rgba(140,184,140,0.12)",
                  textAlign:isRTL?"right":"left"}}>
                {label}
              </a>
            ))}
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button style={{flex:1,padding:"12px",borderRadius:100,border:"1px solid rgba(45,74,45,0.28)",
                background:"transparent",fontFamily:ff,fontSize:14,color:"#2d4a2d",cursor:"pointer"}}>
                {t.nav.signIn}
              </button>
              <button style={{flex:1,padding:"12px",borderRadius:100,border:"none",background:"#1a2e1a",
                fontFamily:ff,fontSize:14,fontWeight:600,color:"#f0ebe0",cursor:"pointer"}}>
                {t.nav.getStarted}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ══════════════════════════════════════════════════
   HERO
══════════════════════════════════════════════════ */
function Hero() {
  const {t}=useLang();
  const {isMobile,isTablet}=useBreakpoint();
  const {scrollY}=useScroll();
  const y=useTransform(scrollY,[0,600],[0,isMobile?-40:-120]);
  const opacity=useTransform(scrollY,[0,400],[1,0]);
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";
  const serif=isRTL?"'Noto Sans Arabic',sans-serif":"'Cormorant Garamond',serif";
  const px=isMobile?"20px":isTablet?"32px":"56px";

  return (
    <section style={{
      minHeight:"100vh",
      background:"linear-gradient(160deg,#f5f0e8 0%,#eae8e0 40%,#dde8d8 100%)",
      display:"flex",alignItems:"center",
      padding:`${isMobile?"100px":"120px"} ${px} 80px`,
      position:"relative",overflow:"hidden",direction:t.dir,
    }}>
      <div style={{position:"absolute",top:"5%",right:"5%",width:isMobile?260:480,height:isMobile?260:480,
        borderRadius:"50%",background:"radial-gradient(circle,rgba(140,184,140,0.18) 0%,transparent 70%)",
        filter:"blur(40px)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:"8%",left:"3%",width:isMobile?180:340,height:isMobile?180:340,
        borderRadius:"50%",background:"radial-gradient(circle,rgba(184,160,112,0.12) 0%,transparent 70%)",
        filter:"blur(50px)",pointerEvents:"none"}}/>

      <motion.div style={{y,opacity,width:"100%",maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"grid",
          gridTemplateColumns:isMobile||isTablet?"1fr":"1fr 1fr",
          gap:isMobile?48:80,alignItems:"center"}}>

          {/* Text */}
          <div>
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.6,delay:0.2}}
              style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 16px",borderRadius:100,
                background:"rgba(45,74,45,0.08)",border:"1px solid rgba(45,74,45,0.15)",marginBottom:28}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"#8cb88c"}}/>
              <span style={{fontFamily:ff,fontSize:12,color:"#4a5040",fontWeight:500,
                letterSpacing:isRTL?0:"0.08em",textTransform:isRTL?"none":"uppercase"}}>
                {t.badge}
              </span>
            </motion.div>

            <motion.h1 initial={{opacity:0,y:40}} animate={{opacity:1,y:0}}
              transition={{duration:0.9,delay:0.3,ease:[0.22,1,0.36,1]}}
              style={{fontFamily:serif,
                fontSize:isMobile?52:isTablet?68:"clamp(60px,6vw,92px)",
                fontWeight:600,lineHeight:1.1,color:"#1a2e1a",marginBottom:24,
                letterSpacing:isRTL?0:"-0.01em",textAlign:isRTL?"right":"left"}}>
              {t.heroH1[0]}<br/>
              <span style={{color:"#8cb88c",fontStyle:isRTL?"normal":"italic"}}>{t.heroH1[1]}</span><br/>
              {t.heroH1[2]}
            </motion.h1>

            <motion.p initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.8,delay:0.5}}
              style={{fontFamily:ff,fontSize:isMobile?15:17,lineHeight:1.75,color:"#6a7060",
                maxWidth:440,marginBottom:36,textAlign:isRTL?"right":"left"}}>
              {t.heroSub}
            </motion.p>

            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.7,delay:0.65}}
              style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:isRTL?"flex-end":"flex-start"}}>
              <motion.button whileHover={{scale:1.04,background:"#2d4a2d"}} whileTap={{scale:0.97}}
                style={{padding:isMobile?"14px 26px":"17px 36px",borderRadius:100,border:"none",
                  background:"#1a2e1a",fontFamily:ff,fontSize:isMobile?14:15,fontWeight:600,
                  color:"#f0ebe0",cursor:"pointer",transition:"background 0.2s"}}>
                {t.exploreBtn}
              </motion.button>
              <motion.button whileHover={{scale:1.04}} whileTap={{scale:0.97}}
                style={{padding:isMobile?"14px 26px":"17px 36px",borderRadius:100,
                  border:"1px solid rgba(45,74,45,0.3)",background:"transparent",
                  fontFamily:ff,fontSize:isMobile?14:15,fontWeight:500,color:"#2d4a2d",cursor:"pointer"}}>
                {t.buildBtn}
              </motion.button>
            </motion.div>

            <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.8,delay:0.9}}
              style={{display:"flex",gap:isMobile?24:44,marginTop:isMobile?40:56,
                justifyContent:isRTL?"flex-end":"flex-start"}} id="stats">
              {t.stats.map(([num,label])=>(
                <div key={num} style={{textAlign:isRTL?"right":"left"}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?34:44,
                    fontWeight:700,color:"#1a2e1a",lineHeight:1}}>{num}</div>
                  <div style={{fontFamily:ff,fontSize:isMobile?12:13,color:"#8a9080",marginTop:4}}>{label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Image card — tablet+ only */}
          {!isMobile&&(
            <motion.div initial={{opacity:0,x:isRTL?-40:40}} animate={{opacity:1,x:0}}
              transition={{duration:1.1,delay:0.4,ease:[0.22,1,0.36,1]}} style={{position:"relative"}}>
              <div style={{position:"absolute",top:-20,right:-20,bottom:-20,left:-20,
                borderRadius:"36px",border:"1px solid rgba(140,184,140,0.22)",pointerEvents:"none"}}/>
              <div style={{borderRadius:28,overflow:"hidden",background:"#e8e4dc",position:"relative",
                boxShadow:"0 32px 70px rgba(26,46,26,0.12)"}}>
                <img src="https://images.unsplash.com/photo-1546793665-c74683f339c1?q=80&w=1200&auto=format&fit=crop"
                  style={{width:"100%",height:isTablet?360:490,objectFit:"cover",display:"block"}} alt="Hero dish"/>
                <motion.div initial={{y:20,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:1.1,duration:0.8}}
                  style={{position:"absolute",bottom:20,left:20,right:20,
                    background:"rgba(245,240,232,0.9)",backdropFilter:"blur(20px)",
                    borderRadius:18,padding:"18px 22px",border:"1px solid rgba(255,255,255,0.6)",direction:t.dir}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,
                    flexDirection:isRTL?"row-reverse":"row"}}>
                    <div>
                      <div style={{fontFamily:serif,fontSize:20,fontWeight:700,color:"#1a2e1a"}}>{t.dishCardName}</div>
                      <div style={{fontFamily:ff,fontSize:12,color:"#8a9080",marginTop:2}}>{t.dishCardSub}</div>
                    </div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:"#2d4a2d"}}>520 kcal</div>
                  </div>
                  <div style={{display:"flex",gap:24,justifyContent:isRTL?"flex-end":"flex-start"}}>
                    {[["Protein","42g"],["Carbs","31g"],["Fat","14g"]].map(([k,v])=>(
                      <div key={k} style={{textAlign:isRTL?"right":"left"}}>
                        <div style={{fontFamily:ff,fontSize:11,color:"#8a9080",letterSpacing:"0.04em",textTransform:"uppercase"}}>{k}</div>
                        <div style={{fontFamily:ff,fontSize:18,fontWeight:700,color:"#2d4a2d",marginTop:2}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
              <motion.div animate={{y:[-5,5,-5]}} transition={{duration:4,repeat:Infinity,ease:"easeInOut"}}
                style={{position:"absolute",top:28,
                  [isRTL?"left":"right"]:-24,
                  background:"#f0ebe0",borderRadius:18,padding:"12px 18px",
                  boxShadow:"0 8px 24px rgba(26,46,26,0.1)",border:"1px solid rgba(140,184,140,0.3)",textAlign:"center"}}>
                <div style={{fontFamily:ff,fontSize:11,color:"#8a9080",letterSpacing:"0.04em",textTransform:"uppercase"}}>{t.energyScore}</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:700,color:"#1a2e1a",lineHeight:1,marginTop:2}}>
                  92<span style={{fontSize:15,color:"#8cb88c"}}>%</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </section>
  );
}

/* ══════════════════════════════════════════════════
   MENU
══════════════════════════════════════════════════ */
const DISH_IMAGES=[
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1505252585461-04db1eb84625?q=80&w=1200&auto=format&fit=crop",
];
const DISH_CALS=["410 kcal","530 kcal","290 kcal"];
const DISH_PRICES=[18.5, 24.0, 12.0]; // DT

function MenuSection() {
  const {t}=useLang();
  const {isMobile,isTablet}=useBreakpoint();
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";
  const serif=isRTL?"'Noto Sans Arabic',sans-serif":"'Cormorant Garamond',serif";
  const px=isMobile?"20px":isTablet?"32px":"56px";
  const cols=isMobile?"1fr":isTablet?"1fr 1fr":"repeat(3,1fr)";

  return (
    <section id="menu" style={{padding:`${isMobile?80:120}px ${px}`,background:"#f5f0e8",direction:t.dir}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <Reveal>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:isMobile?"flex-start":"flex-end",
            marginBottom:isMobile?44:64,
            flexDirection:isMobile?"column":isRTL?"row-reverse":"row",gap:isMobile?16:0}}>
            <div>
              <div style={{fontFamily:ff,fontSize:13,color:"#8cb88c",
                letterSpacing:isRTL?0:"0.18em",textTransform:isRTL?"none":"uppercase",
                marginBottom:12,textAlign:isRTL?"right":"left"}}>{t.menuLabel}</div>
              <h2 style={{fontFamily:serif,fontSize:isMobile?42:isTablet?54:"clamp(46px,5vw,72px)",
                fontWeight:600,color:"#1a2e1a",lineHeight:1.1,textAlign:isRTL?"right":"left"}}>
                {t.menuH2[0]}<br/>
                <span style={{fontStyle:isRTL?"normal":"italic",color:"#8cb88c"}}>{t.menuH2[1]}</span>
              </h2>
            </div>
            <button style={{padding:"11px 24px",borderRadius:100,border:"1px solid rgba(45,74,45,0.25)",
              background:"transparent",fontFamily:ff,fontSize:14,fontWeight:500,
              color:"#2d4a2d",cursor:"pointer",whiteSpace:"nowrap"}}>
              {t.fullMenu}
            </button>
          </div>
        </Reveal>

        <div style={{display:"grid",gridTemplateColumns:cols,gap:24}}>
          {t.menuDishes.map((dish,i)=>(
            <Reveal key={i} delay={i*0.1}>
              <motion.div whileHover={{y:-8,boxShadow:"0 24px 56px rgba(26,46,26,0.13)"}}
                transition={{duration:0.4}}
                style={{borderRadius:24,overflow:"hidden",background:"#eae8e0",
                  border:"1px solid rgba(140,184,140,0.15)",
                  boxShadow:"0 4px 20px rgba(26,46,26,0.06)",cursor:"pointer"}}>
                <div style={{position:"relative",overflow:"hidden"}}>
                  <motion.img whileHover={{scale:1.05}} transition={{duration:0.6}}
                    src={DISH_IMAGES[i]}
                    style={{width:"100%",height:isMobile?210:250,objectFit:"cover",display:"block"}}
                    alt={dish.title}/>
                  <div style={{position:"absolute",top:14,[isRTL?"right":"left"]:14,padding:"5px 13px",
                    borderRadius:100,background:"rgba(245,240,232,0.9)",backdropFilter:"blur(8px)",
                    fontFamily:ff,fontSize:12,fontWeight:600,color:"#2d4a2d"}}>
                    {dish.tag}
                  </div>
                </div>
                <div style={{padding:isMobile?"18px 20px 22px":"22px 26px 26px",textAlign:isRTL?"right":"left"}}>
                  <h3 style={{fontFamily:serif,fontSize:isMobile?24:28,fontWeight:700,color:"#1a2e1a",marginBottom:6}}>
                    {dish.title}
                  </h3>
                  <p style={{fontFamily:ff,fontSize:14,color:"#8a9080",lineHeight:1.6,marginBottom:18}}>{dish.sub}</p>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    flexDirection:isRTL?"row-reverse":"row"}}>
                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                      <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:700,color:"#1a2e1a"}}>
                        {DISH_PRICES[i]} <span style={{fontSize:14,fontWeight:500,color:"#8a9080"}}>{t.currencySymbol}</span>
                      </span>
                      <span style={{fontFamily:ff,fontSize:12,color:"#8a9080"}}>{DISH_CALS[i]}</span>
                    </div>
                    <motion.button whileHover={{scale:1.06,background:"#2d4a2d"}} whileTap={{scale:0.95}}
                      style={{padding:"10px 20px",borderRadius:100,border:"none",background:"#1a2e1a",
                        fontFamily:ff,fontSize:13,fontWeight:600,color:"#f0ebe0",cursor:"pointer",
                        transition:"background 0.2s"}}>
                      {t.addToMeal}
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

/* ══════════════════════════════════════════════════
   MEAL BUILDER
══════════════════════════════════════════════════ */
const ING_COLORS=["#c8d8b0","#b8d4a8","#d4c8a0","#c8b8a0","#d4b890","#b0c8a0"];
const ING_CALS=[165,80,120,208,86,23];
const ING_PRICES=[8.5,4.0,3.5,12.0,2.5,1.5]; // DT per portion

function MealBuilder() {
  const {t}=useLang();
  const {isMobile,isTablet}=useBreakpoint();
  const [selected,setSelected]=useState([]);
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";
  const serif=isRTL?"'Noto Sans Arabic',sans-serif":"'Cormorant Garamond',serif";
  const px=isMobile?"20px":isTablet?"32px":"56px";
  const totalCal=selected.reduce((s,idx)=>s+ING_CALS[idx],0);
  const totalPrice=selected.reduce((s,idx)=>s+ING_PRICES[idx],0);
  const totalProt=Math.round(totalCal*0.26);
  const totalCarbs=Math.round(totalCal*0.14);
  const totalFat=Math.round(totalCal*0.06);

  return (
    <section id="build-meal" style={{padding:`${isMobile?80:120}px ${px}`,
      background:"linear-gradient(170deg,#eae8e0 0%,#e0e8d8 100%)",direction:t.dir}}>
      <div style={{maxWidth:1200,margin:"0 auto",display:"grid",
        gridTemplateColumns:isMobile||isTablet?"1fr":"1fr 1fr",
        gap:isMobile?40:72,alignItems:"start"}}>

        <div>
          <Reveal>
            <div style={{fontFamily:ff,fontSize:13,color:"#8cb88c",
              letterSpacing:isRTL?0:"0.18em",textTransform:isRTL?"none":"uppercase",
              marginBottom:12,textAlign:isRTL?"right":"left"}}>{t.builderLabel}</div>
            <h2 style={{fontFamily:serif,
              fontSize:isMobile?38:isTablet?50:"clamp(42px,5vw,66px)",
              fontWeight:600,color:"#1a2e1a",marginBottom:14,lineHeight:1.15,
              textAlign:isRTL?"right":"left"}}>
              {t.builderH2[0]}<br/>
              <span style={{fontStyle:isRTL?"normal":"italic",color:"#8cb88c"}}>{t.builderH2[1]}</span>
            </h2>
            <p style={{fontFamily:ff,fontSize:isMobile?15:16,color:"#6a7060",lineHeight:1.7,
              marginBottom:36,maxWidth:400,textAlign:isRTL?"right":"left"}}>
              {t.builderSub}
            </p>
          </Reveal>

          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {t.ingredients.map((ing,i)=>{
              const isSel=selected.includes(i);
              return (
                <Reveal key={i} delay={i*0.06} y={16}>
                  <motion.div
                    onClick={()=>setSelected(p=>isSel?p.filter(x=>x!==i):[...p,i])}
                    whileHover={{x:isRTL?-4:4}}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:isMobile?"13px 15px":"17px 20px",borderRadius:16,
                      border:`1px solid ${isSel?"rgba(45,74,45,0.35)":"rgba(140,184,140,0.18)"}`,
                      background:isSel?"rgba(45,74,45,0.07)":"rgba(245,240,232,0.7)",
                      cursor:"pointer",transition:"all 0.25s",
                      flexDirection:isRTL?"row-reverse":"row"}}>
                    <div style={{display:"flex",alignItems:"center",gap:14,
                      flexDirection:isRTL?"row-reverse":"row"}}>
                      <div style={{width:38,height:38,borderRadius:11,background:ING_COLORS[i],
                        flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:"rgba(26,46,26,0.22)"}}/>
                      </div>
                      <div style={{textAlign:isRTL?"right":"left"}}>
                        <div style={{fontFamily:ff,fontSize:isMobile?14:15,fontWeight:600,color:"#1a2e1a"}}>{ing.name}</div>
                        <div style={{fontFamily:ff,fontSize:12,color:"#8a9080",marginTop:2}}>{ing.detail}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10,
                      flexDirection:isRTL?"row-reverse":"row"}}>
                      <div style={{textAlign:isRTL?"left":"right"}}>
                        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,fontWeight:700,color:"#2d4a2d",lineHeight:1}}>
                          {ING_PRICES[i]} <span style={{fontSize:12,fontWeight:500,color:"#8a9080"}}>{t.currencySymbol}</span>
                        </div>
                        <div style={{fontFamily:ff,fontSize:12,color:"#8a9080",marginTop:2}}>{ING_CALS[i]} kcal</div>
                      </div>
                      <motion.div animate={{scale:isSel?1:0.85,opacity:isSel?1:0.4}}
                        style={{width:30,height:30,borderRadius:"50%",
                          background:isSel?"#2d4a2d":"rgba(45,74,45,0.15)",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          color:isSel?"#f0ebe0":"#4a5040",fontSize:16,fontWeight:700,
                          flexShrink:0,transition:"background 0.2s"}}>
                        {isSel?"✓":"+"}
                      </motion.div>
                    </div>
                  </motion.div>
                </Reveal>
              );
            })}
          </div>
        </div>

        <Reveal delay={0.15}>
          <div style={{position:isMobile||isTablet?"relative":"sticky",top:100}}>
            <div style={{borderRadius:28,background:"#1a2e1a",padding:isMobile?22:34,
              boxShadow:"0 28px 72px rgba(26,46,26,0.2)",position:"relative",overflow:"hidden",direction:t.dir}}>
              <div style={{position:"absolute",top:-50,[isRTL?"left":"right"]:-50,width:200,height:200,
                borderRadius:"50%",background:"radial-gradient(circle,rgba(140,184,140,0.15) 0%,transparent 70%)",
                pointerEvents:"none"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:26,
                flexDirection:isRTL?"row-reverse":"row"}}>
                <h3 style={{fontFamily:serif,fontSize:isMobile?26:32,fontWeight:700,color:"#f0ebe0"}}>{t.aiTitle}</h3>
                <div style={{padding:"5px 13px",borderRadius:100,background:"rgba(140,184,140,0.15)",
                  border:"1px solid rgba(140,184,140,0.3)",fontFamily:ff,fontSize:11,fontWeight:600,
                  color:"#8cb88c",letterSpacing:isRTL?0:"0.08em",textTransform:isRTL?"none":"uppercase"}}>
                  {t.live}
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:18}}>
                {[[t.macroLabels[0],`${totalCal}`,"kcal"],[t.macroLabels[1],`${totalProt}`,"g"],
                  [t.macroLabels[2],`${totalCarbs}`,"g"],[t.macroLabels[3],`${totalFat}`,"g"]].map(([label,val,unit])=>(
                  <div key={label} style={{background:"rgba(255,255,255,0.05)",borderRadius:16,
                    padding:isMobile?"14px 16px":"18px 20px",border:"1px solid rgba(255,255,255,0.07)",
                    textAlign:isRTL?"right":"left"}}>
                    <div style={{fontFamily:ff,fontSize:11,color:"rgba(240,235,224,0.5)",
                      letterSpacing:isRTL?0:"0.06em",textTransform:isRTL?"none":"uppercase",marginBottom:7}}>
                      {label}
                    </div>
                    <motion.div key={val} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
                      transition={{duration:0.3}}
                      style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?34:42,
                        fontWeight:700,color:"#c8d8b0",lineHeight:1}}>
                      {val}<span style={{fontSize:14,color:"#8cb88c"}}>{unit}</span>
                    </motion.div>
                  </div>
                ))}
              </div>

              {/* Total Price */}
              <div style={{background:"rgba(200,216,176,0.12)",borderRadius:16,
                padding:"16px 20px",border:"1px solid rgba(200,216,176,0.2)",marginBottom:14,
                display:"flex",justifyContent:"space-between",alignItems:"center",
                flexDirection:isRTL?"row-reverse":"row"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexDirection:isRTL?"row-reverse":"row"}}>
                  
                  <span style={{fontFamily:ff,fontSize:13,fontWeight:600,color:"rgba(240,235,224,0.8)"}}>
                    {t.totalPriceLabel}
                  </span>
                </div>
                <motion.div key={totalPrice} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
                  transition={{duration:0.3}}
                  style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?28:34,
                    fontWeight:700,color:"#c8d8b0",lineHeight:1}}>
                  {totalPrice.toFixed(1)} <span style={{fontSize:14,color:"#8cb88c"}}>{t.currencySymbol}</span>
                </motion.div>
              </div>

              <div style={{background:"rgba(140,184,140,0.1)",borderRadius:16,padding:"16px 18px",
                border:"1px solid rgba(140,184,140,0.15)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:11,
                  flexDirection:isRTL?"row-reverse":"row"}}>
                  <span style={{fontFamily:ff,fontSize:13,color:"rgba(240,235,224,0.7)"}}>{t.energyScoreLabel}</span>
                  <span style={{fontFamily:ff,fontSize:13,fontWeight:700,color:"#8cb88c"}}>
                    {Math.min(96,selected.length*16)}%
                  </span>
                </div>
                <div style={{height:6,borderRadius:100,background:"rgba(255,255,255,0.08)",overflow:"hidden"}}>
                  <motion.div animate={{width:`${Math.min(96,selected.length*16)}%`}} transition={{duration:0.5}}
                    style={{height:"100%",background:"linear-gradient(90deg,#8cb88c,#c8d8b0)",borderRadius:100}}/>
                </div>
              </div>

              {selected.length===0&&(
                <p style={{fontFamily:ff,fontSize:13,color:"rgba(240,235,224,0.35)",textAlign:"center",marginTop:14}}>
                  {t.builderEmpty}
                </p>
              )}
              <motion.button whileHover={{background:"#c8d8b0"}} whileTap={{scale:0.97}}
                style={{width:"100%",marginTop:18,padding:"16px",borderRadius:13,border:"none",
                  background:"#8cb88c",fontFamily:ff,fontSize:15,fontWeight:700,
                  color:"#1a2e1a",cursor:"pointer",transition:"all 0.2s"}}>
                {t.builderOrder(selected.length)}
              </motion.button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════
   CALORIE PLANNER
══════════════════════════════════════════════════ */
const PLANNER_IMAGES=[
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1512058564366-18510be2db19?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1505252585461-04db1eb84625?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1546793665-c74683f339c1?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=600&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600&auto=format&fit=crop",
];
const PLANNER_NUTRITION=[
  {cal:410,protein:12,carbs:38,fat:22},{cal:530,protein:42,carbs:31,fat:18},
  {cal:290,protein:6,carbs:52,fat:8},{cal:520,protein:38,carbs:44,fat:14},
  {cal:220,protein:8,carbs:34,fat:6},{cal:620,protein:48,carbs:36,fat:26},
  {cal:460,protein:22,carbs:58,fat:12},{cal:380,protein:14,carbs:28,fat:24},
];

function CaloriePlanner() {
  const {t}=useLang();
  const {isMobile,isTablet}=useBreakpoint();
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";
  const serif=isRTL?"'Noto Sans Arabic',sans-serif":"'Cormorant Garamond',serif";
  const px=isMobile?"20px":isTablet?"32px":"56px";
  const [target,setTarget]=useState(2000);
  const [goalIdx,setGoalIdx]=useState(1);
  const [mealsPerDay,setMealsPerDay]=useState(3);
  const [plan,setPlan]=useState([]);
  const [generated,setGenerated]=useState(false);

  const effectiveCal=Math.round(target*t.goals[goalIdx].mult);
  const perMeal=Math.round(effectiveCal/mealsPerDay);

  const generatePlan=()=>{
    const items=PLANNER_NUTRITION.map((n,i)=>({...n,...t.plannerDishes[i],image:PLANNER_IMAGES[i]}));
    const sorted=[...items].sort((a,b)=>Math.abs(a.cal-perMeal)-Math.abs(b.cal-perMeal));
    setPlan(Array.from({length:mealsPerDay},(_,i)=>sorted[i%sorted.length]));
    setGenerated(true);
  };

  const totalPlanned=plan.reduce((s,d)=>s+d.cal,0);
  const gap=effectiveCal-totalPlanned;

  return (
    <section id="calorie-planner" style={{padding:`${isMobile?80:120}px ${px}`,background:"#f5f0e8",direction:t.dir}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>

        {/* Header */}
        <Reveal>
          <div style={{textAlign:"center",marginBottom:isMobile?44:64}}>
            <div style={{fontFamily:ff,fontSize:13,color:"#8cb88c",
              letterSpacing:isRTL?0:"0.18em",textTransform:isRTL?"none":"uppercase",marginBottom:14}}>
              {t.plannerLabel}
            </div>
            <h2 style={{fontFamily:serif,
              fontSize:isMobile?36:isTablet?50:"clamp(46px,5vw,72px)",
              fontWeight:600,color:"#1a2e1a",lineHeight:1.15,marginBottom:18}}>
              {t.plannerH2[0]}<br/>
              <span style={{fontStyle:isRTL?"normal":"italic",color:"#8cb88c"}}>{t.plannerH2[1]}</span>
            </h2>
            <p style={{fontFamily:ff,fontSize:isMobile?15:17,color:"#6a7060",lineHeight:1.7,
              maxWidth:500,margin:"0 auto"}}>{t.plannerSub}</p>
          </div>
        </Reveal>

        {/* Controls card */}
        <Reveal delay={0.1}>
          <div style={{background:"#1a2e1a",borderRadius:isMobile?22:30,
            padding:isMobile?"26px 20px":isTablet?"38px 32px":"46px 50px",
            marginBottom:40,boxShadow:"0 28px 72px rgba(26,46,26,0.22)",
            position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-60,[isRTL?"left":"right"]:-60,width:260,height:260,
              borderRadius:"50%",background:"radial-gradient(circle,rgba(140,184,140,0.1) 0%,transparent 70%)",
              pointerEvents:"none"}}/>

            <div style={{display:"grid",
              gridTemplateColumns:isMobile?"1fr":isTablet?"1fr 1fr":"1.2fr 1fr 1fr",
              gap:isMobile?28:42,position:"relative"}}>

              {/* Slider */}
              <div>
                <div style={{fontFamily:ff,fontSize:11,color:"rgba(200,216,176,0.65)",
                  letterSpacing:isRTL?0:"0.1em",textTransform:isRTL?"none":"uppercase",
                  marginBottom:14,textAlign:isRTL?"right":"left"}}>
                  {t.sliderLabel}
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:16,
                  justifyContent:isRTL?"flex-end":"flex-start"}}>
                  <motion.span key={target} initial={{y:-8,opacity:0}} animate={{y:0,opacity:1}}
                    style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?48:58,
                      fontWeight:700,color:"#c8d8b0",lineHeight:1}}>
                    {target.toLocaleString()}
                  </motion.span>
                  <span style={{fontFamily:ff,fontSize:16,color:"#8cb88c"}}>kcal</span>
                </div>
                <input type="range" min={1200} max={4000} step={50} value={target}
                  onChange={e=>{setTarget(Number(e.target.value));setGenerated(false);}}
                  style={{width:"100%",cursor:"pointer",accentColor:"#8cb88c",direction:"ltr"}}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                  <span style={{fontFamily:ff,fontSize:11,color:"rgba(240,235,224,0.3)"}}>1,200</span>
                  <span style={{fontFamily:ff,fontSize:11,color:"rgba(240,235,224,0.3)"}}>4,000</span>
                </div>
                <div style={{marginTop:20,background:"rgba(140,184,140,0.08)",borderRadius:14,
                  padding:"14px 16px",border:"1px solid rgba(140,184,140,0.15)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",
                    flexDirection:isRTL?"row-reverse":"row"}}>
                    <div style={{textAlign:isRTL?"right":"left"}}>
                      <div style={{fontFamily:ff,fontSize:11,color:"rgba(240,235,224,0.45)",marginBottom:4}}>
                        {t.adjustedLabel}
                      </div>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?30:36,
                        fontWeight:700,color:"#8cb88c",lineHeight:1}}>
                        {effectiveCal.toLocaleString()}<span style={{fontSize:13}}> kcal</span>
                      </div>
                    </div>
                    <div style={{textAlign:isRTL?"left":"right"}}>
                      <div style={{fontFamily:ff,fontSize:11,color:"rgba(240,235,224,0.45)",marginBottom:4}}>
                        {t.perMealLabel}
                      </div>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?30:36,
                        fontWeight:700,color:"#c8d8b0",lineHeight:1}}>
                        {perMeal}<span style={{fontSize:13}}> kcal</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Goals */}
              <div>
                <div style={{fontFamily:ff,fontSize:11,color:"rgba(200,216,176,0.65)",
                  letterSpacing:isRTL?0:"0.1em",textTransform:isRTL?"none":"uppercase",
                  marginBottom:14,textAlign:isRTL?"right":"left"}}>{t.goalLabel}</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {t.goals.map((g,i)=>(
                    <motion.div key={i} onClick={()=>{setGoalIdx(i);setGenerated(false);}}
                      whileHover={{x:isRTL?-3:3}}
                      style={{padding:"13px 16px",borderRadius:13,
                        border:`1px solid ${goalIdx===i?"rgba(140,184,140,0.55)":"rgba(255,255,255,0.07)"}`,
                        background:goalIdx===i?"rgba(140,184,140,0.12)":"rgba(255,255,255,0.04)",
                        cursor:"pointer",transition:"all 0.2s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                        flexDirection:isRTL?"row-reverse":"row"}}>
                        <span style={{fontFamily:ff,fontSize:14,fontWeight:600,
                          color:goalIdx===i?"#c8d8b0":"rgba(240,235,224,0.55)"}}>{g.label}</span>
                        {goalIdx===i&&<div style={{width:7,height:7,borderRadius:"50%",background:"#8cb88c"}}/>}
                      </div>
                      <div style={{fontFamily:ff,fontSize:11,color:"rgba(240,235,224,0.32)",marginTop:3,
                        textAlign:isRTL?"right":"left"}}>{g.desc}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Meals + Generate */}
              <div>
                <div style={{fontFamily:ff,fontSize:11,color:"rgba(200,216,176,0.65)",
                  letterSpacing:isRTL?0:"0.1em",textTransform:isRTL?"none":"uppercase",
                  marginBottom:14,textAlign:isRTL?"right":"left"}}>{t.mealsLabel}</div>
                <div style={{display:"flex",gap:10,marginBottom:26}}>
                  {[2,3,4].map(n=>(
                    <motion.button key={n} onClick={()=>{setMealsPerDay(n);setGenerated(false);}}
                      whileHover={{scale:1.06}} whileTap={{scale:0.95}}
                      style={{flex:1,padding:"16px 0",borderRadius:13,
                        border:`1px solid ${mealsPerDay===n?"rgba(140,184,140,0.55)":"rgba(255,255,255,0.07)"}`,
                        background:mealsPerDay===n?"rgba(140,184,140,0.15)":"rgba(255,255,255,0.04)",
                        fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:700,
                        color:mealsPerDay===n?"#c8d8b0":"rgba(240,235,224,0.28)",
                        cursor:"pointer",transition:"all 0.2s"}}>
                      {n}
                    </motion.button>
                  ))}
                </div>
                <motion.button onClick={generatePlan}
                  whileHover={{scale:1.03,background:"#c8d8b0"}} whileTap={{scale:0.97}}
                  style={{width:"100%",padding:"17px",borderRadius:14,border:"none",background:"#8cb88c",
                    fontFamily:ff,fontSize:15,fontWeight:700,color:"#1a2e1a",cursor:"pointer",transition:"all 0.2s"}}>
                  {t.generateBtn}
                </motion.button>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Results */}
        <AnimatePresence>
          {generated&&(
            <motion.div initial={{opacity:0,y:36}} animate={{opacity:1,y:0}} exit={{opacity:0}}
              transition={{duration:0.7,ease:[0.22,1,0.36,1]}}>

              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:isMobile?"flex-start":"flex-end",marginBottom:28,
                flexDirection:isMobile?"column":isRTL?"row-reverse":"row",gap:isMobile?12:0}}>
                <div style={{textAlign:isRTL?"right":"left"}}>
                  <div style={{fontFamily:ff,fontSize:12,color:"#8cb88c",
                    letterSpacing:isRTL?0:"0.14em",textTransform:isRTL?"none":"uppercase",marginBottom:8}}>
                    {t.planResultLabel}
                  </div>
                  <h3 style={{fontFamily:serif,fontSize:isMobile?32:44,fontWeight:600,color:"#1a2e1a"}}>
                    {mealsPerDay} · {t.goals[goalIdx].label}
                  </h3>
                </div>
                <div style={{textAlign:isRTL?"left":"right"}}>
                  <div style={{fontFamily:ff,fontSize:13,color:"#8a9080",marginBottom:3}}>{t.totalPlannedLabel}</div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?30:38,
                    fontWeight:700,color:gap>=0?"#2d4a2d":"#a05040"}}>
                    {totalPlanned.toLocaleString()} kcal
                  </div>
                  <div style={{fontFamily:ff,fontSize:13,color:gap>=0?"#8cb88c":"#c08070"}}>
                    {Math.abs(gap)} {gap>=0?t.underTarget:t.overTarget}
                  </div>
                </div>
              </div>

              <div style={{display:"grid",
                gridTemplateColumns:isMobile?"1fr":isTablet?"1fr 1fr":`repeat(${Math.min(mealsPerDay,3)},1fr)`,
                gap:18,marginBottom:24}}>
                {plan.map((dish,i)=>(
                  <motion.div key={i} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}
                    transition={{delay:i*0.1,duration:0.6}}
                    style={{borderRadius:20,overflow:"hidden",background:"#eae8e0",
                      border:"1px solid rgba(140,184,140,0.18)",boxShadow:"0 4px 20px rgba(26,46,26,0.07)"}}>
                    <div style={{position:"relative"}}>
                      <img src={dish.image}
                        style={{width:"100%",height:isMobile?170:195,objectFit:"cover",display:"block"}}
                        alt={dish.name} onError={e=>{e.target.src=PLANNER_IMAGES[0];}}/>
                      <div style={{position:"absolute",inset:0,
                        background:"linear-gradient(to bottom,transparent 40%,rgba(26,46,26,0.4) 100%)"}}/>
                      <div style={{position:"absolute",top:12,[isRTL?"right":"left"]:12,
                        padding:"5px 11px",borderRadius:100,background:"rgba(245,240,232,0.92)",
                        fontFamily:ff,fontSize:11,fontWeight:600,color:"#2d4a2d"}}>
                        {t.mealCard(i)}
                      </div>
                      <div style={{position:"absolute",top:12,[isRTL?"left":"right"]:12,
                        padding:"5px 11px",borderRadius:100,background:"rgba(26,46,26,0.72)",
                        fontFamily:ff,fontSize:11,fontWeight:600,color:"#c8d8b0"}}>
                        {dish.tag}
                      </div>
                    </div>
                    <div style={{padding:isMobile?"16px 18px":"20px 22px",direction:t.dir}}>
                      <h4 style={{fontFamily:serif,fontSize:isMobile?22:26,fontWeight:700,color:"#1a2e1a",
                        marginBottom:12,lineHeight:1.2,textAlign:isRTL?"right":"left"}}>{dish.name}</h4>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
                        {[["Calories",`${dish.cal} kcal`],["Protein",`${dish.protein}g`],
                          ["Carbs",`${dish.carbs}g`],["Fat",`${dish.fat}g`]].map(([k,v])=>(
                          <div key={k} style={{background:"rgba(245,240,232,0.85)",borderRadius:9,
                            padding:"9px 11px",textAlign:isRTL?"right":"left"}}>
                            <div style={{fontFamily:ff,fontSize:10,color:"#8a9080",
                              letterSpacing:isRTL?0:"0.04em",textTransform:isRTL?"none":"uppercase"}}>{k}</div>
                            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,fontWeight:700,
                              color:"#2d4a2d",marginTop:1}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <motion.button whileHover={{background:"#2d4a2d"}} whileTap={{scale:0.97}}
                        style={{width:"100%",padding:"12px",borderRadius:11,border:"none",background:"#1a2e1a",
                          fontFamily:ff,fontSize:13,fontWeight:600,color:"#f0ebe0",cursor:"pointer",
                          transition:"background 0.2s"}}>
                        {t.addOrder}
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.5}}
                style={{background:"linear-gradient(135deg,#1a2e1a 0%,#2d4a2d 100%)",borderRadius:20,
                  padding:isMobile?"22px 20px":"26px 38px",display:"flex",justifyContent:"space-between",
                  alignItems:"center",
                  flexDirection:isMobile?"column":isRTL?"row-reverse":"row",gap:isMobile?18:0}}>
                <div style={{textAlign:isRTL?"right":"left"}}>
                  <div style={{fontFamily:ff,fontSize:11,color:"rgba(200,216,176,0.55)",
                    letterSpacing:isRTL?0:"0.1em",textTransform:isRTL?"none":"uppercase",marginBottom:6}}>
                    {t.macrosLabel}
                  </div>
                  <div style={{fontFamily:serif,fontSize:isMobile?18:26,fontWeight:700,color:"#c8d8b0"}}>
                    {plan.reduce((s,d)=>s+d.protein,0)}g {t.macroUnits[0]} · {plan.reduce((s,d)=>s+d.carbs,0)}g {t.macroUnits[1]} · {plan.reduce((s,d)=>s+d.fat,0)}g {t.macroUnits[2]}
                  </div>
                </div>
                <motion.button whileHover={{scale:1.04,background:"#c8d8b0"}} whileTap={{scale:0.97}}
                  style={{padding:isMobile?"14px 26px":"17px 34px",borderRadius:100,border:"none",
                    background:"#8cb88c",fontFamily:ff,fontSize:14,fontWeight:700,color:"#1a2e1a",
                    cursor:"pointer",transition:"all 0.2s",whiteSpace:"nowrap",
                    width:isMobile?"100%":"auto"}}>
                  {t.orderFull}
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════ */
function AuthSection() {
  const {t}=useLang();
  const {isMobile,isTablet}=useBreakpoint();
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";
  const serif=isRTL?"'Noto Sans Arabic',sans-serif":"'Cormorant Garamond',serif";
  const px=isMobile?"20px":isTablet?"32px":"56px";

  return (
    <section style={{padding:`${isMobile?80:120}px ${px}`,
      background:"linear-gradient(170deg,#eae8e0 0%,#e0e8d8 100%)",direction:t.dir}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <Reveal>
          <div style={{textAlign:"center",marginBottom:isMobile?44:64}}>
            <div style={{fontFamily:ff,fontSize:13,color:"#8cb88c",
              letterSpacing:isRTL?0:"0.18em",textTransform:isRTL?"none":"uppercase",marginBottom:14}}>
              {t.authLabel}
            </div>
            <h2 style={{fontFamily:serif,
              fontSize:isMobile?34:isTablet?48:"clamp(42px,5vw,66px)",fontWeight:600,color:"#1a2e1a"}}>
              {t.authH2[0]}{" "}
              <span style={{fontStyle:isRTL?"normal":"italic",color:"#8cb88c"}}>{t.authH2[1]}</span>
            </h2>
          </div>
        </Reveal>

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:22}}>
          <Reveal delay={0.1}>
            <div style={{borderRadius:26,background:"#f0ebe0",padding:isMobile?26:42,
              border:"1px solid rgba(140,184,140,0.2)",boxShadow:"0 8px 40px rgba(26,46,26,0.06)"}}>
              <h3 style={{fontFamily:serif,fontSize:isMobile?30:38,fontWeight:700,color:"#1a2e1a",
                marginBottom:26,textAlign:isRTL?"right":"left"}}>{t.loginTitle}</h3>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[[t.emailPh,"text"],[t.passwordPh,"password"]].map(([ph,type])=>(
                  <input key={ph} placeholder={ph} type={type}
                    style={{padding:"15px 18px",borderRadius:12,border:"1px solid rgba(140,184,140,0.25)",
                      background:"rgba(245,240,232,0.7)",fontFamily:ff,fontSize:15,color:"#1a2e1a",
                      outline:"none",width:"100%",textAlign:isRTL?"right":"left",direction:t.dir}}
                    onFocus={e=>e.target.style.borderColor="rgba(45,74,45,0.5)"}
                    onBlur={e=>e.target.style.borderColor="rgba(140,184,140,0.25)"}/>
                ))}
                <motion.button whileHover={{scale:1.02,background:"#2d4a2d"}} whileTap={{scale:0.98}}
                  style={{padding:"16px",borderRadius:12,border:"none",background:"#1a2e1a",
                    fontFamily:ff,fontSize:15,fontWeight:700,color:"#f0ebe0",
                    cursor:"pointer",transition:"background 0.2s",marginTop:4}}>
                  {t.loginBtn}
                </motion.button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={isMobile?0:0.15}>
            <div style={{borderRadius:26,background:"#1a2e1a",padding:isMobile?26:42,
              boxShadow:"0 8px 40px rgba(26,46,26,0.15)",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",bottom:-36,[isRTL?"left":"right"]:-36,width:180,height:180,
                borderRadius:"50%",background:"radial-gradient(circle,rgba(140,184,140,0.12) 0%,transparent 70%)"}}/>
              <h3 style={{fontFamily:serif,fontSize:isMobile?30:38,fontWeight:700,color:"#f0ebe0",
                marginBottom:26,textAlign:isRTL?"right":"left"}}>{t.signupTitle}</h3>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[[t.fullNamePh,"text"],[t.emailPh,"text"],[t.passwordPh,"password"]].map(([ph,type])=>(
                  <input key={ph} placeholder={ph} type={type}
                    style={{padding:"15px 18px",borderRadius:12,border:"1px solid rgba(140,184,140,0.2)",
                      background:"rgba(255,255,255,0.06)",fontFamily:ff,fontSize:15,color:"#f0ebe0",
                      outline:"none",width:"100%",textAlign:isRTL?"right":"left",direction:t.dir}}
                    onFocus={e=>e.target.style.borderColor="rgba(140,184,140,0.5)"}
                    onBlur={e=>e.target.style.borderColor="rgba(140,184,140,0.2)"}/>
                ))}
                <motion.button whileHover={{scale:1.02,background:"#c8d8b0"}} whileTap={{scale:0.98}}
                  style={{padding:"16px",borderRadius:12,border:"none",background:"#8cb88c",
                    fontFamily:ff,fontSize:15,fontWeight:700,color:"#1a2e1a",
                    cursor:"pointer",transition:"background 0.2s",marginTop:4}}>
                  {t.signupBtn}
                </motion.button>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════
   FOOTER
══════════════════════════════════════════════════ */
function Footer() {
  const {t}=useLang();
  const {isMobile}=useBreakpoint();
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";

  return (
    <footer style={{padding:isMobile?"44px 20px":"58px 56px",background:"#1a2e1a",
      borderTop:"1px solid rgba(140,184,140,0.1)",direction:t.dir}}>
      <div style={{maxWidth:1200,margin:"0 auto",display:"flex",justifyContent:"space-between",
        alignItems:isMobile?"flex-start":"center",
        flexDirection:isMobile?"column":isRTL?"row-reverse":"row",gap:isMobile?24:0}}>
        <div>
          <img src="/logo-footer2.png" alt="Healthy Kitchen"
            style={{height:isMobile?38:48,width:"auto",objectFit:"contain",display:"block"}}/>
          <div style={{fontFamily:ff,fontSize:13,color:"rgba(240,235,224,0.4)",marginTop:5,
            textAlign:isRTL?"right":"left"}}>{t.footerTagline}</div>
        </div>
        <div style={{display:"flex",gap:isMobile?20:32,flexWrap:"wrap"}}>
          {t.footerLinks.map((link,i)=>(
            <a key={i} href="https://www.instagram.com/healthy_kitchen_tn/" target="_blank" rel="noreferrer"
              style={{fontFamily:ff,fontSize:13,color:"rgba(240,235,224,0.5)",textDecoration:"none",
                letterSpacing:isRTL?0:"0.07em",textTransform:isRTL?"none":"uppercase",transition:"color 0.2s"}}
              onMouseEnter={e=>e.target.style.color="#8cb88c"}
              onMouseLeave={e=>e.target.style.color="rgba(240,235,224,0.5)"}>{link}</a>
          ))}
        </div>
        <div style={{fontFamily:ff,fontSize:12,color:"rgba(240,235,224,0.3)"}}>{t.copyright}</div>
      </div>
    </footer>
  );
}

/* ══════════════════════════════════════════════════
   APP ROOT
══════════════════════════════════════════════════ */
export default function HealthyKitchenApp() {
  const [lang,setLang]=useState("fr");
  const t=TRANSLATIONS[lang];

  return (
    <LangCtx.Provider value={{lang,t,setLang}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=DM+Sans:wght@400;500;600;700;800&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::selection{background:rgba(140,184,140,0.25);}
        input::placeholder{color:rgba(74,80,64,0.45);}
        input[type=range]{-webkit-appearance:none;appearance:none;height:6px;border-radius:100px;background:rgba(140,184,140,0.25);outline:none;width:100%;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#8cb88c;cursor:pointer;border:3px solid #1a2e1a;box-shadow:0 2px 8px rgba(26,46,26,0.35);}
        input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#8cb88c;cursor:pointer;border:3px solid #1a2e1a;}
        @media(max-width:639px){html{-webkit-text-size-adjust:100%;}}
      `}</style>
      <Grain/>
      <div style={{fontFamily:"'DM Sans',sans-serif",background:"#f5f0e8",overflowX:"hidden",direction:t.dir}}>
        <Nav/>
        <Hero/>
        <MenuSection/>
        <MealBuilder/>
        <CaloriePlanner/>
        <AuthSection/>
        <Footer/>
      </div>
    </LangCtx.Provider>
  );
}