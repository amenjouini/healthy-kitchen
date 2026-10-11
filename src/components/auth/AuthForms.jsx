import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth, homeFor } from '@/context/AuthContext';
import { useLang, useT } from '@/i18n/LangContext';
import { errorMessage } from '@/lib/api';

/**
 * Login + signup cards in the landing page's original visual style (cream login card,
 * dark signup card). Now functional: they call the auth API and route by role.
 */
export default function AuthForms() {
  const { t: copy, dir } = useLang();
  const t = useT();
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});
  const isRTL = dir === 'rtl';

  const go = (user) => navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(user));

  const submitLogin = async (e) => {
    e.preventDefault();
    setBusy('login'); setErrors({});
    try { go(await login(loginForm.email, loginForm.password)); } catch (err) { setErrors({ login: errorMessage(err, t) }); } finally { setBusy(null); }
  };
  const submitSignup = async (e) => {
    e.preventDefault();
    if (signupForm.password.length < 8) { setErrors({ signup: t('Password must be at least 8 characters') }); return; }
    setBusy('signup'); setErrors({});
    try {
      go(await signup({ ...signupForm, phone: signupForm.phone || undefined }));
    } catch (err) { setErrors({ signup: errorMessage(err, t) }); } finally { setBusy(null); }
  };

  const light = 'w-full min-h-12 rounded-xl border border-sage/25 bg-cream/70 px-4 text-[15px] text-forest outline-none focus:border-moss/50';
  const dark = 'w-full min-h-12 rounded-xl border border-sage/20 bg-white/5 px-4 text-[15px] text-linen outline-none placeholder:text-linen/40 focus:border-sage/50';

  return (
    <div className="grid gap-5 md:grid-cols-2" dir={dir}>
      <form onSubmit={submitLogin} className="rounded-[26px] border border-sage/20 bg-linen p-6 shadow-[0_8px_40px_rgba(26,46,26,0.06)] sm:p-10">
        <h3 className={`mb-6 font-serif text-3xl font-bold text-forest sm:text-4xl ${isRTL ? 'text-right' : ''}`}>{copy.loginTitle}</h3>
        <div className="flex flex-col gap-3">
          <input className={light} type="email" required autoComplete="email" placeholder={copy.emailPh} aria-label={copy.emailPh} value={loginForm.email} onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))} />
          <input className={light} type="password" required autoComplete="current-password" placeholder={copy.passwordPh} aria-label={copy.passwordPh} value={loginForm.password} onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))} />
          {errors.login && <p className="text-sm font-medium text-clay" role="alert">{errors.login}</p>}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={busy === 'login'} className="mt-1 min-h-13 cursor-pointer rounded-xl bg-forest text-[15px] font-bold text-linen disabled:opacity-60">
            {busy === 'login' ? '…' : copy.loginBtn}
          </motion.button>
        </div>
      </form>
      <form onSubmit={submitSignup} className="relative overflow-hidden rounded-[26px] bg-forest p-6 shadow-[0_8px_40px_rgba(26,46,26,0.15)] sm:p-10">
        <h3 className={`mb-6 font-serif text-3xl font-bold text-linen sm:text-4xl ${isRTL ? 'text-right' : ''}`}>{copy.signupTitle}</h3>
        <div className="flex flex-col gap-3">
          <input className={dark} required autoComplete="name" placeholder={copy.fullNamePh} aria-label={copy.fullNamePh} value={signupForm.name} onChange={(e) => setSignupForm((f) => ({ ...f, name: e.target.value }))} />
          <input className={dark} type="email" required autoComplete="email" placeholder={copy.emailPh} aria-label={copy.emailPh} value={signupForm.email} onChange={(e) => setSignupForm((f) => ({ ...f, email: e.target.value }))} />
          <input className={dark} type="tel" autoComplete="tel" placeholder={t('Phone (WhatsApp, optional)')} aria-label={t('Phone (WhatsApp, optional)')} value={signupForm.phone} onChange={(e) => setSignupForm((f) => ({ ...f, phone: e.target.value }))} />
          <input className={dark} type="password" required minLength={8} autoComplete="new-password" placeholder={copy.passwordPh} aria-label={copy.passwordPh} value={signupForm.password} onChange={(e) => setSignupForm((f) => ({ ...f, password: e.target.value }))} />
          {errors.signup && <p className="text-sm font-medium text-[#f0b0a0]" role="alert">{errors.signup}</p>}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={busy === 'signup'} className="mt-1 min-h-13 cursor-pointer rounded-xl bg-sage text-[15px] font-bold text-forest disabled:opacity-60">
            {busy === 'signup' ? '…' : copy.signupBtn}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
