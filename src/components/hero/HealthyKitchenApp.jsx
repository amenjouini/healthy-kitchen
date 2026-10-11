import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useScroll, useTransform, useInView } from "framer-motion";
import { ShoppingBag, User } from "lucide-react";
import { useLang, useT, localized } from "@/i18n/LangContext";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useCatalogMeals, useCatalogIngredients } from "@/hooks/useCatalog";
import { useNutritionCalculator } from "@/hooks/useNutritionCalculator";
import { mealToCartItem, customBowlToCartItem } from "@/utils/cart";
import { formatMoney, formatNutrient } from "@/utils/format";
import { percentOfDailyReference } from "@shared/nutrition";
import AuthForms from "@/components/auth/AuthForms";
import { useToast } from "@/components/ui/Feedback";

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

export function Grain() {
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
export function Nav() {
  const {t,dir}=useLang();
  const tt=useT();
  const {isMobile}=useBreakpoint();
  const {user,hasStaffArea,hasAdminArea}=useAuth();
  const cart=useCart();
  const [scrolled,setScrolled]=useState(false);
  const [open,setOpen]=useState(false);
  const isRTL=dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";

  useEffect(()=>{
    const fn=()=>setScrolled(window.scrollY>40);
    fn();
    window.addEventListener("scroll",fn);
    return ()=>window.removeEventListener("scroll",fn);
  },[]);

  // Menu opens the full menu page; builder/planner are sections of the home page.
  const links=[[t.nav.menu,"/menu"],[t.nav.build,"/#build-meal"],[t.nav.plan,"/#calorie-planner"]];
  const accountHref=hasAdminArea?"/admin":hasStaffArea?"/staff":"/account";
  const accountLabel=user?(hasAdminArea||hasStaffArea?tt("Dashboard"):tt("My account")):t.nav.signIn;

  const cartButton=(
    <motion.button whileTap={{scale:0.9}} onClick={()=>cart.setOpen(true)} aria-label={tt("Open cart")}
      style={{position:"relative",width:44,height:44,borderRadius:100,border:"1px solid rgba(45,74,45,0.2)",
        background:"rgba(255,255,255,0.5)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#1a2e1a"}}>
      <ShoppingBag size={19}/>
      <AnimatePresence>
        {cart.count>0&&(
          <motion.span key={cart.count} initial={{scale:0}} animate={{scale:1}} exit={{scale:0}}
            transition={{type:"spring",stiffness:500,damping:20}}
            style={{position:"absolute",top:-4,[isRTL?"left":"right"]:-4,minWidth:20,height:20,padding:"0 5px",borderRadius:100,
              background:"#8cb88c",color:"#1a2e1a",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
            {cart.count}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );

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
          direction:dir,
        }}>

        {/* Logo */}
        <Link to="/" aria-label="Healthy Kitchen">
          <img src="/logo_png.png" alt="Healthy Kitchen"
            style={{height:isMobile?40:50,width:"auto",objectFit:"contain",display:"block"}}/>
        </Link>

        {/* Desktop links */}
        {!isMobile && (
          <div style={{display:"flex",gap:32}}>
            {links.map(([label,href])=>(
              <Link key={label} to={href}
                style={{fontFamily:ff,fontSize:14,fontWeight:500,color:"#4a5040",textDecoration:"none",
                  letterSpacing:isRTL?0:"0.04em",textTransform:isRTL?"none":"uppercase",transition:"color 0.2s"}}
                onMouseEnter={e=>e.target.style.color="#2d4a2d"}
                onMouseLeave={e=>e.target.style.color="#4a5040"}>{label}</Link>
            ))}
          </div>
        )}

        {/* Desktop right */}
        {!isMobile && (
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <LangSwitcher/>
            <Link to={user?accountHref:"/login"}
              style={{padding:"9px 18px",borderRadius:100,border:"1px solid rgba(45,74,45,0.28)",display:"inline-flex",alignItems:"center",gap:6,
                background:"transparent",fontFamily:ff,fontSize:13,fontWeight:500,color:"#2d4a2d",textDecoration:"none"}}>
              {user&&<User size={15}/>}{accountLabel}
            </Link>
            {cartButton}
          </div>
        )}

        {/* Mobile: switcher + cart + hamburger */}
        {isMobile && (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <LangSwitcher/>
            {cartButton}
            <button onClick={()=>setOpen(o=>!o)} aria-label={tt("Menu")} aria-expanded={open}
              style={{background:"none",border:"none",cursor:"pointer",padding:11,display:"flex",flexDirection:"column",gap:5}}>
              <motion.span animate={{rotate:open?45:0,y:open?7:0}}
                style={{display:"block",width:22,height:2,background:"#1a2e1a",borderRadius:2,transformOrigin:"center"}}/>
              <motion.span animate={{opacity:open?0:1}}
                style={{display:"block",width:22,height:2,background:"#1a2e1a",borderRadius:2}}/>
              <motion.span animate={{rotate:open?-45:0,y:open?-7:0}}
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
              padding:"20px 20px 24px",display:"flex",flexDirection:"column",direction:dir}}>
            {links.map(([label,href])=>(
              <Link key={label} to={href} onClick={()=>setOpen(false)}
                style={{fontFamily:ff,fontSize:16,fontWeight:600,color:"#1a2e1a",textDecoration:"none",
                  padding:"13px 0",borderBottom:"1px solid rgba(140,184,140,0.12)",
                  textAlign:isRTL?"right":"left"}}>
                {label}
              </Link>
            ))}
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <Link to={user?accountHref:"/login"} onClick={()=>setOpen(false)}
                style={{flex:1,padding:"12px",borderRadius:100,border:"1px solid rgba(45,74,45,0.28)",textAlign:"center",textDecoration:"none",
                  background:"transparent",fontFamily:ff,fontSize:14,color:"#2d4a2d"}}>
                {accountLabel}
              </Link>
              <Link to="/menu" onClick={()=>setOpen(false)}
                style={{flex:1,padding:"12px",borderRadius:100,border:"none",background:"#1a2e1a",textAlign:"center",textDecoration:"none",
                  fontFamily:ff,fontSize:14,fontWeight:600,color:"#f0ebe0"}}>
                {t.nav.getStarted}
              </Link>
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
  const {t,lang}=useLang();
  const navigate=useNavigate();
  const {data:meals}=useCatalogMeals();
  // Hero card shows a real featured dish (nutrition calculated from its recipe).
  const featured=(meals??[]).find(m=>m.isFeatured&&m.nutrition)??(meals??[])[0];
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
              style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"flex-start"}}>
              <motion.button onClick={()=>navigate("/menu")} whileHover={{scale:1.04,background:"#2d4a2d"}} whileTap={{scale:0.97}}
                style={{padding:isMobile?"14px 26px":"17px 36px",borderRadius:100,border:"none",
                  background:"#1a2e1a",fontFamily:ff,fontSize:isMobile?14:15,fontWeight:600,
                  color:"#f0ebe0",cursor:"pointer",transition:"background 0.2s"}}>
                {t.exploreBtn}
              </motion.button>
              <motion.button onClick={()=>document.getElementById("build-meal")?.scrollIntoView({behavior:"smooth"})} whileHover={{scale:1.04}} whileTap={{scale:0.97}}
                style={{padding:isMobile?"14px 26px":"17px 36px",borderRadius:100,
                  border:"1px solid rgba(45,74,45,0.3)",background:"transparent",
                  fontFamily:ff,fontSize:isMobile?14:15,fontWeight:500,color:"#2d4a2d",cursor:"pointer"}}>
                {t.buildBtn}
              </motion.button>
            </motion.div>

            <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.8,delay:0.9}}
              style={{display:"flex",gap:isMobile?24:44,marginTop:isMobile?40:56,
                justifyContent:"flex-start"}} id="stats">
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
                <img src={featured?.imageUrl??"https://images.unsplash.com/photo-1546793665-c74683f339c1?q=80&w=1200&auto=format&fit=crop"}
                  style={{width:"100%",height:isTablet?360:490,objectFit:"cover",display:"block"}} alt=""/>
                {featured&&<motion.div initial={{y:20,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:0.4,duration:0.8}}
                  onClick={()=>navigate(`/menu?m=${featured.slug}`)}
                  style={{position:"absolute",bottom:20,left:20,right:20,cursor:"pointer",
                    background:"rgba(245,240,232,0.9)",backdropFilter:"blur(20px)",
                    borderRadius:18,padding:"18px 22px",border:"1px solid rgba(255,255,255,0.6)",direction:t.dir}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,
                    flexDirection:"row"}}>
                    <div>
                      <div style={{fontFamily:serif,fontSize:20,fontWeight:700,color:"#1a2e1a"}}>{localized(featured,"name",lang)}</div>
                      <div style={{fontFamily:ff,fontSize:12,color:"#8a9080",marginTop:2}}>{localized(featured,"tag",lang)}</div>
                    </div>
                    <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:700,color:"#2d4a2d"}}>{formatNutrient(featured.nutrition.kcal,"kcal")} kcal</div>
                  </div>
                  <div style={{display:"flex",gap:24,justifyContent:"flex-start"}}>
                    {[[t.macroLabels[1],featured.nutrition.protein],[t.macroLabels[2],featured.nutrition.carbs],[t.macroLabels[3],featured.nutrition.fat]].map(([k,v])=>(
                      <div key={k} style={{textAlign:isRTL?"right":"left"}}>
                        <div style={{fontFamily:ff,fontSize:11,color:"#8a9080",letterSpacing:"0.04em",textTransform:"uppercase"}}>{k}</div>
                        <div style={{fontFamily:ff,fontSize:18,fontWeight:700,color:"#2d4a2d",marginTop:2}}>{Math.round(v)}g</div>
                      </div>
                    ))}
                  </div>
                </motion.div>}
              </div>
              {featured&&<motion.div animate={{y:[-5,5,-5]}} transition={{duration:4,repeat:Infinity,ease:"easeInOut"}}
                style={{position:"absolute",top:28,
                  [isRTL?"left":"right"]:-24,
                  background:"#f0ebe0",borderRadius:18,padding:"12px 18px",
                  boxShadow:"0 8px 24px rgba(26,46,26,0.1)",border:"1px solid rgba(140,184,140,0.3)",textAlign:"center"}}>
                <div style={{fontFamily:ff,fontSize:11,color:"#8a9080",letterSpacing:"0.04em",textTransform:"uppercase"}}>{t.priceLabel}</div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:700,color:"#1a2e1a",lineHeight:1,marginTop:2}}>
                  {formatMoney(featured.priceMillimes,{symbol:""})}<span style={{fontSize:15,color:"#8cb88c"}}> {t.currencySymbol}</span>
                </div>
              </motion.div>}
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
function MenuSection() {
  const {t,lang}=useLang();
  const tt=useT();
  const navigate=useNavigate();
  const cart=useCart();
  const toast=useToast();
  const {data:meals,loading}=useCatalogMeals();
  const {isMobile,isTablet}=useBreakpoint();
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";
  const serif=isRTL?"'Noto Sans Arabic',sans-serif":"'Cormorant Garamond',serif";
  const px=isMobile?"20px":isTablet?"32px":"56px";
  const cols=isMobile?"1fr":isTablet?"1fr 1fr":"repeat(3,1fr)";
  // Live catalogue: featured dishes first (prices & kcal come from the server).
  const dishes=useMemo(()=>{
    const list=meals??[];
    return [...list.filter(m=>m.isFeatured),...list.filter(m=>!m.isFeatured)].slice(0,3);
  },[meals]);

  return (
    <section id="menu" style={{padding:`${isMobile?80:120}px ${px}`,background:"#f5f0e8",direction:t.dir}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <Reveal>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:isMobile?"flex-start":"flex-end",
            marginBottom:isMobile?44:64,
            flexDirection:isMobile?"column":"row",gap:isMobile?16:0}}>
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
            <motion.button onClick={()=>navigate("/menu")} whileTap={{scale:0.97}}
              style={{padding:"11px 24px",minHeight:44,borderRadius:100,border:"1px solid rgba(45,74,45,0.25)",
              background:"transparent",fontFamily:ff,fontSize:14,fontWeight:500,
              color:"#2d4a2d",cursor:"pointer",whiteSpace:"nowrap"}}>
              {t.fullMenu}
            </motion.button>
          </div>
        </Reveal>

        <div style={{display:"grid",gridTemplateColumns:cols,gap:24}}>
          {loading&&[0,1,2].map(i=>(
            <motion.div key={i} animate={{opacity:[0.5,1,0.5]}} transition={{duration:1.4,repeat:Infinity}}
              style={{height:isMobile?380:420,borderRadius:24,background:"#eae8e0"}}/>
          ))}
          {dishes.map((dish,i)=>{
            const soldOut=dish.availability!=="available";
            return (
            <Reveal key={dish.id} delay={i*0.1}>
              <motion.div whileHover={{y:-8,boxShadow:"0 24px 56px rgba(26,46,26,0.13)"}}
                transition={{duration:0.4}}
                onClick={()=>navigate(`/menu?m=${dish.slug}`)}
                style={{borderRadius:24,overflow:"hidden",background:"#eae8e0",
                  border:"1px solid rgba(140,184,140,0.15)",
                  boxShadow:"0 4px 20px rgba(26,46,26,0.06)",cursor:"pointer"}}>
                <div style={{position:"relative",overflow:"hidden"}}>
                  <motion.img whileHover={{scale:1.05}} transition={{duration:0.6}}
                    src={dish.imageUrl}
                    style={{width:"100%",height:isMobile?210:250,objectFit:"cover",display:"block",filter:soldOut?"grayscale(1)":"none"}}
                    alt={localized(dish,"name",lang)}/>
                  {localized(dish,"tag",lang)&&<div style={{position:"absolute",top:14,[isRTL?"right":"left"]:14,padding:"5px 13px",
                    borderRadius:100,background:"rgba(245,240,232,0.9)",backdropFilter:"blur(8px)",
                    fontFamily:ff,fontSize:12,fontWeight:600,color:"#2d4a2d"}}>
                    {localized(dish,"tag",lang)}
                  </div>}
                </div>
                <div style={{padding:isMobile?"18px 20px 22px":"22px 26px 26px",textAlign:isRTL?"right":"left"}}>
                  <h3 style={{fontFamily:serif,fontSize:isMobile?24:28,fontWeight:700,color:"#1a2e1a",marginBottom:6}}>
                    {localized(dish,"name",lang)}
                  </h3>
                  <p style={{fontFamily:ff,fontSize:14,color:"#8a9080",lineHeight:1.6,marginBottom:18}}>{localized(dish,"description",lang)}</p>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    flexDirection:"row"}}>
                    <div style={{display:"flex",flexDirection:"column",gap:2}}>
                      <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:700,color:"#1a2e1a"}}>
                        {formatMoney(dish.priceMillimes,{symbol:""})} <span style={{fontSize:14,fontWeight:500,color:"#8a9080"}}>{t.currencySymbol}</span>
                      </span>
                      <span style={{fontFamily:ff,fontSize:12,color:"#8a9080"}}>{formatNutrient(dish.nutrition.kcal,"kcal")} kcal · {Math.round(dish.nutrition.protein)}g {t.macroUnits[0]}</span>
                    </div>
                    <motion.button whileHover={soldOut?undefined:{scale:1.06,background:"#2d4a2d"}} whileTap={soldOut?undefined:{scale:0.95}}
                      disabled={soldOut}
                      onClick={(e)=>{e.stopPropagation();cart.add(mealToCartItem(dish),1,{openCart:false});toast(tt("{name} added to your order",{name:localized(dish,"name",lang)}));}}
                      style={{padding:"10px 20px",minHeight:44,borderRadius:100,border:"none",background:"#1a2e1a",
                        fontFamily:ff,fontSize:13,fontWeight:600,color:"#f0ebe0",cursor:soldOut?"not-allowed":"pointer",opacity:soldOut?0.45:1}}>
                      {soldOut?tt("Sold out for now"):t.addToMeal}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </Reveal>
          );})}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════
   MEAL BUILDER
══════════════════════════════════════════════════ */
/**
 * "Build your own" — previously computed macros as fixed percentages of calories
 * (protein = kcal × 0.26 g, …) with no portion weights. It now uses real ingredients
 * (per-100 g values from the API) and the shared calculator; the server recomputes the
 * same numbers when the order is placed.
 */
function MealBuilder() {
  const {t,lang}=useLang();
  const tt=useT();
  const cart=useCart();
  const {data:ingredients,loading}=useCatalogIngredients();
  const {isMobile,isTablet}=useBreakpoint();
  const [portions,setPortions]=useState({}); // ingredientId → portions (1–3)
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";
  const serif=isRTL?"'Noto Sans Arabic',sans-serif":"'Cormorant Garamond',serif";
  const px=isMobile?"20px":isTablet?"32px":"56px";

  const picks=useMemo(()=>(ingredients??[]).filter(i=>portions[i.id]).map(i=>({ingredient:i,portions:portions[i.id]})),[ingredients,portions]);
  const lines=useMemo(()=>picks.map(p=>({ingredient:p.ingredient,quantity:p.ingredient.portionQty*p.portions})),[picks]);
  const calc=useNutritionCalculator(lines,1);
  const n=calc.total;
  const totalPrice=picks.reduce((s,p)=>s+p.ingredient.portionPriceMillimes*p.portions,0);
  const dailyShare=Math.min(100,percentOfDailyReference(n.kcal,"kcal"));
  const count=picks.reduce((s,p)=>s+p.portions,0);

  const toggle=(ing)=>setPortions(p=>{const next={...p}; if(next[ing.id]) delete next[ing.id]; else next[ing.id]=1; return next;});
  const step=(ing,delta)=>setPortions(p=>{const v=(p[ing.id]??0)+delta; const next={...p}; if(v<=0) delete next[ing.id]; else next[ing.id]=Math.min(3,v); return next;});
  const order=()=>{
    if(!picks.length) return;
    cart.add(customBowlToCartItem(picks,n.kcal,lang),1);
    setPortions({});
  };

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
            {loading&&[0,1,2,3].map(i=>(
              <motion.div key={i} animate={{opacity:[0.5,1,0.5]}} transition={{duration:1.4,repeat:Infinity}} style={{height:72,borderRadius:16,background:"rgba(245,240,232,0.7)"}}/>
            ))}
            {(ingredients??[]).map((ing,i)=>{
              const qty=portions[ing.id]??0;
              const isSel=qty>0;
              const portionKcal=ing.nutrition.kcal*(ing.portionQty*(ing.baseUnit==="g"?1:ing.gramsPerUnit))/100;
              return (
                <Reveal key={ing.id} delay={i*0.06} y={16}>
                  <motion.div
                    role="button" tabIndex={ing.available?0:-1} aria-pressed={isSel}
                    onClick={()=>ing.available&&toggle(ing)}
                    onKeyDown={e=>{if((e.key==="Enter"||e.key===" ")&&ing.available){e.preventDefault();toggle(ing);}}}
                    whileHover={ing.available?{x:isRTL?-4:4}:undefined}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
                      padding:isMobile?"13px 15px":"17px 20px",borderRadius:16,minHeight:64,
                      border:`1px solid ${isSel?"rgba(45,74,45,0.35)":"rgba(140,184,140,0.18)"}`,
                      background:isSel?"rgba(45,74,45,0.07)":"rgba(245,240,232,0.7)",
                      cursor:ing.available?"pointer":"not-allowed",opacity:ing.available?1:0.5,
                      flexDirection:"row"}}>
                    <div style={{display:"flex",alignItems:"center",gap:14,minWidth:0}}>
                      <div style={{width:38,height:38,borderRadius:11,background:ing.color??"#c8d8b0",
                        flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:"rgba(26,46,26,0.22)"}}/>
                      </div>
                      <div style={{textAlign:isRTL?"right":"left",minWidth:0}}>
                        <div style={{fontFamily:ff,fontSize:isMobile?14:15,fontWeight:600,color:"#1a2e1a"}}>{localized(ing,"name",lang)}</div>
                        <div style={{fontFamily:ff,fontSize:12,color:"#8a9080",marginTop:2}}>
                          {ing.available?localized(ing,"detail",lang):tt("Sold out for now")}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                      <div style={{textAlign:isRTL?"left":"right"}}>
                        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:17,fontWeight:700,color:"#2d4a2d",lineHeight:1}}>
                          {formatMoney(ing.portionPriceMillimes,{symbol:""})} <span style={{fontSize:12,fontWeight:500,color:"#8a9080"}}>{t.currencySymbol}</span>
                        </div>
                        <div style={{fontFamily:ff,fontSize:12,color:"#8a9080",marginTop:2}}>{ing.portionQty} {ing.baseUnit} · {Math.round(portionKcal)} kcal</div>
                      </div>
                      {isSel?(
                        <div onClick={e=>e.stopPropagation()} style={{display:"flex",alignItems:"center",gap:2,background:"#2d4a2d",borderRadius:100,padding:2}}>
                          <motion.button whileTap={{scale:0.85}} onClick={()=>step(ing,-1)} aria-label="−"
                            style={{width:32,height:32,borderRadius:"50%",border:"none",background:"transparent",color:"#f0ebe0",fontSize:18,cursor:"pointer"}}>−</motion.button>
                          <span style={{minWidth:18,textAlign:"center",color:"#f0ebe0",fontFamily:ff,fontSize:13,fontWeight:700}}>{qty}</span>
                          <motion.button whileTap={{scale:0.85}} onClick={()=>step(ing,1)} disabled={qty>=3} aria-label="+"
                            style={{width:32,height:32,borderRadius:"50%",border:"none",background:"transparent",color:"#f0ebe0",fontSize:18,cursor:"pointer",opacity:qty>=3?0.4:1}}>+</motion.button>
                        </div>
                      ):(
                        <motion.div animate={{scale:0.85,opacity:0.4}}
                          style={{width:30,height:30,borderRadius:"50%",background:"rgba(45,74,45,0.15)",
                            display:"flex",alignItems:"center",justifyContent:"center",color:"#4a5040",fontSize:16,fontWeight:700,flexShrink:0}}>
                          +
                        </motion.div>
                      )}
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
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:26,flexDirection:"row"}}>
                <h3 style={{fontFamily:serif,fontSize:isMobile?26:32,fontWeight:700,color:"#f0ebe0"}}>{t.aiTitle}</h3>
                <div style={{padding:"5px 13px",borderRadius:100,background:"rgba(140,184,140,0.15)",
                  border:"1px solid rgba(140,184,140,0.3)",fontFamily:ff,fontSize:11,fontWeight:600,
                  color:"#8cb88c",letterSpacing:isRTL?0:"0.08em",textTransform:isRTL?"none":"uppercase"}}>
                  {t.live}
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11,marginBottom:12}}>
                {[[t.macroLabels[0],formatNutrient(n.kcal,"kcal"),"kcal"],[t.macroLabels[1],formatNutrient(n.protein,"protein"),"g"],
                  [t.macroLabels[2],formatNutrient(n.carbs,"carbs"),"g"],[t.macroLabels[3],formatNutrient(n.fat,"fat"),"g"]].map(([label,val,unit])=>(
                  <div key={label} style={{background:"rgba(255,255,255,0.05)",borderRadius:16,
                    padding:isMobile?"14px 16px":"18px 20px",border:"1px solid rgba(255,255,255,0.07)",
                    textAlign:isRTL?"right":"left"}}>
                    <div style={{fontFamily:ff,fontSize:11,color:"rgba(240,235,224,0.5)",
                      letterSpacing:isRTL?0:"0.06em",textTransform:isRTL?"none":"uppercase",marginBottom:7}}>
                      {label}
                    </div>
                    <motion.div key={val} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
                      transition={{type:"spring",stiffness:400,damping:25}}
                      style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?34:42,
                        fontWeight:700,color:"#c8d8b0",lineHeight:1}}>
                      {val}<span style={{fontSize:14,color:"#8cb88c"}}>{unit}</span>
                    </motion.div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:18,
                fontFamily:ff,fontSize:12,color:"rgba(240,235,224,0.6)"}}>
                <span>{tt("Fiber")} {formatNutrient(n.fiber,"fiber")} g</span>
                <span>{tt("Sugars")} {formatNutrient(n.sugar,"sugar")} g</span>
                <span>{tt("Sodium")} {formatNutrient(n.sodium,"sodium")} mg</span>
                <span>{Math.round(calc.totalWeightG)} g</span>
              </div>

              {/* Total Price */}
              <div style={{background:"rgba(200,216,176,0.12)",borderRadius:16,
                padding:"16px 20px",border:"1px solid rgba(200,216,176,0.2)",marginBottom:14,
                display:"flex",justifyContent:"space-between",alignItems:"center",flexDirection:"row"}}>
                <span style={{fontFamily:ff,fontSize:13,fontWeight:600,color:"rgba(240,235,224,0.8)"}}>
                  {t.totalPriceLabel}
                </span>
                <motion.div key={totalPrice} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
                  transition={{type:"spring",stiffness:400,damping:25}}
                  style={{fontFamily:"'Cormorant Garamond',serif",fontSize:isMobile?28:34,
                    fontWeight:700,color:"#c8d8b0",lineHeight:1}}>
                  {formatMoney(totalPrice,{symbol:""})} <span style={{fontSize:14,color:"#8cb88c"}}>{t.currencySymbol}</span>
                </motion.div>
              </div>

              {/* Share of a 2,000 kcal reference day (replaces the former invented "energy score") */}
              <div style={{background:"rgba(140,184,140,0.1)",borderRadius:16,padding:"16px 18px",
                border:"1px solid rgba(140,184,140,0.15)"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:11,flexDirection:"row"}}>
                  <span style={{fontFamily:ff,fontSize:13,color:"rgba(240,235,224,0.7)"}}>{t.energyScoreLabel}</span>
                  <span style={{fontFamily:ff,fontSize:13,fontWeight:700,color:"#8cb88c"}}>
                    {Math.round(dailyShare)}%
                  </span>
                </div>
                <div style={{height:6,borderRadius:100,background:"rgba(255,255,255,0.08)",overflow:"hidden"}}>
                  <motion.div animate={{width:`${dailyShare}%`}} transition={{type:"spring",stiffness:120,damping:20}}
                    style={{height:"100%",background:"linear-gradient(90deg,#8cb88c,#c8d8b0)",borderRadius:100}}/>
                </div>
              </div>

              {picks.length===0&&(
                <p style={{fontFamily:ff,fontSize:13,color:"rgba(240,235,224,0.35)",textAlign:"center",marginTop:14}}>
                  {t.builderEmpty}
                </p>
              )}
              <motion.button onClick={order} disabled={!picks.length} whileHover={picks.length?{background:"#c8d8b0"}:undefined} whileTap={picks.length?{scale:0.97}:undefined}
                style={{width:"100%",marginTop:18,padding:"16px",minHeight:52,borderRadius:13,border:"none",
                  background:"#8cb88c",fontFamily:ff,fontSize:15,fontWeight:700,
                  color:"#1a2e1a",cursor:picks.length?"pointer":"not-allowed",opacity:picks.length?1:0.55}}>
                {t.builderOrder(count)}
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
function CaloriePlanner() {
  const {t,lang}=useLang();
  const tt=useT();
  const cart=useCart();
  const toast=useToast();
  const {data:meals}=useCatalogMeals();
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

  // Plans from dishes that can actually be ordered now, using their calculated nutrition.
  const orderable=useMemo(()=>(meals??[]).filter(m=>m.availability==="available"&&m.nutrition),[meals]);
  const generatePlan=()=>{
    if(!orderable.length) return;
    const items=orderable.map(m=>({meal:m,cal:m.nutrition.kcal,protein:m.nutrition.protein,carbs:m.nutrition.carbs,fat:m.nutrition.fat,image:m.imageUrl}));
    const sorted=[...items].sort((a,b)=>Math.abs(a.cal-perMeal)-Math.abs(b.cal-perMeal));
    setPlan(Array.from({length:mealsPerDay},(_,i)=>sorted[i%sorted.length]));
    setGenerated(true);
  };
  const addToCart=(list)=>{
    list.forEach(d=>cart.add(mealToCartItem(d.meal),1,{openCart:false}));
    toast(list.length===1?tt("{name} added to your order",{name:localized(list[0].meal,"name",lang)}):tt("Your plan was added to your order"));
  };

  const totalPlanned=Math.round(plan.reduce((s,d)=>s+d.cal,0));
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
                  justifyContent:"flex-start"}}>
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
                    flexDirection:"row"}}>
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
                        flexDirection:"row"}}>
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
                <motion.button onClick={generatePlan} disabled={!orderable.length}
                  whileHover={orderable.length?{scale:1.03,background:"#c8d8b0"}:undefined} whileTap={orderable.length?{scale:0.97}:undefined}
                  style={{width:"100%",padding:"17px",minHeight:52,borderRadius:14,border:"none",background:"#8cb88c",opacity:orderable.length?1:0.5,
                    fontFamily:ff,fontSize:15,fontWeight:700,color:"#1a2e1a",cursor:orderable.length?"pointer":"not-allowed"}}>
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
                flexDirection:isMobile?"column":"row",gap:isMobile?12:0}}>
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
                        alt={localized(dish.meal,"name",lang)} onError={e=>{e.target.style.visibility="hidden";}}/>
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
                        {localized(dish.meal,"tag",lang)}
                      </div>
                    </div>
                    <div style={{padding:isMobile?"16px 18px":"20px 22px",direction:t.dir}}>
                      <h4 style={{fontFamily:serif,fontSize:isMobile?22:26,fontWeight:700,color:"#1a2e1a",
                        marginBottom:12,lineHeight:1.2,textAlign:isRTL?"right":"left"}}>{localized(dish.meal,"name",lang)}</h4>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
                        {[[t.macroLabels[0],`${Math.round(dish.cal)} kcal`],[t.macroLabels[1],`${Math.round(dish.protein)}g`],
                          [t.macroLabels[2],`${Math.round(dish.carbs)}g`],[t.macroLabels[3],`${Math.round(dish.fat)}g`]].map(([k,v])=>(
                          <div key={k} style={{background:"rgba(245,240,232,0.85)",borderRadius:9,
                            padding:"9px 11px",textAlign:isRTL?"right":"left"}}>
                            <div style={{fontFamily:ff,fontSize:10,color:"#8a9080",
                              letterSpacing:isRTL?0:"0.04em",textTransform:isRTL?"none":"uppercase"}}>{k}</div>
                            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:19,fontWeight:700,
                              color:"#2d4a2d",marginTop:1}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <motion.button onClick={()=>addToCart([dish])} whileHover={{background:"#2d4a2d"}} whileTap={{scale:0.97}}
                        style={{width:"100%",padding:"12px",minHeight:44,borderRadius:11,border:"none",background:"#1a2e1a",
                          fontFamily:ff,fontSize:13,fontWeight:600,color:"#f0ebe0",cursor:"pointer"}}>
                        {t.addOrder} · {formatMoney(dish.meal.priceMillimes)}
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.5}}
                style={{background:"linear-gradient(135deg,#1a2e1a 0%,#2d4a2d 100%)",borderRadius:20,
                  padding:isMobile?"22px 20px":"26px 38px",display:"flex",justifyContent:"space-between",
                  alignItems:"center",
                  flexDirection:isMobile?"column":"row",gap:isMobile?18:0}}>
                <div style={{textAlign:isRTL?"right":"left"}}>
                  <div style={{fontFamily:ff,fontSize:11,color:"rgba(200,216,176,0.55)",
                    letterSpacing:isRTL?0:"0.1em",textTransform:isRTL?"none":"uppercase",marginBottom:6}}>
                    {t.macrosLabel}
                  </div>
                  <div style={{fontFamily:serif,fontSize:isMobile?18:26,fontWeight:700,color:"#c8d8b0"}}>
                    {Math.round(plan.reduce((s,d)=>s+d.protein,0))}g {t.macroUnits[0]} · {Math.round(plan.reduce((s,d)=>s+d.carbs,0))}g {t.macroUnits[1]} · {Math.round(plan.reduce((s,d)=>s+d.fat,0))}g {t.macroUnits[2]}
                  </div>
                </div>
                <motion.button onClick={()=>{addToCart(plan);cart.setOpen(true);}} whileHover={{scale:1.04,background:"#c8d8b0"}} whileTap={{scale:0.97}}
                  style={{padding:isMobile?"14px 26px":"17px 34px",minHeight:48,borderRadius:100,border:"none",
                    background:"#8cb88c",fontFamily:ff,fontSize:14,fontWeight:700,color:"#1a2e1a",
                    cursor:"pointer",whiteSpace:"nowrap",
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

        <Reveal delay={0.1}>
          <AuthForms/>
        </Reveal>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════
   FOOTER
══════════════════════════════════════════════════ */
export function Footer() {
  const {t}=useLang();
  const {isMobile}=useBreakpoint();
  const isRTL=t.dir==="rtl";
  const ff=isRTL?"'Noto Sans Arabic',sans-serif":"'DM Sans',sans-serif";

  return (
    <footer style={{padding:isMobile?"44px 20px":"58px 56px",background:"#1a2e1a",
      borderTop:"1px solid rgba(140,184,140,0.1)",direction:t.dir}}>
      <div style={{maxWidth:1200,margin:"0 auto",display:"flex",justifyContent:"space-between",
        alignItems:isMobile?"flex-start":"center",
        flexDirection:isMobile?"column":"row",gap:isMobile?24:0}}>
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
   HOME PAGE (nav, footer and grain come from CustomerLayout)
══════════════════════════════════════════════════ */
export default function HealthyKitchenApp() {
  const {user}=useAuth();
  return (
    <>
      <style>{`
        input::placeholder{color:rgba(74,80,64,0.45);}
        input[type=range]{-webkit-appearance:none;appearance:none;height:6px;border-radius:100px;background:rgba(140,184,140,0.25);outline:none;width:100%;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#8cb88c;cursor:pointer;border:3px solid #1a2e1a;box-shadow:0 2px 8px rgba(26,46,26,0.35);}
        input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#8cb88c;cursor:pointer;border:3px solid #1a2e1a;}
      `}</style>
      <Hero/>
      <MenuSection/>
      <MealBuilder/>
      <CaloriePlanner/>
      {!user&&<AuthSection/>}
    </>
  );
}
