import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import AuthForms from '@/components/auth/AuthForms';
import { useAuth, homeFor } from '@/context/AuthContext';
import { useLang, useT } from '@/i18n/LangContext';

export default function Login() {
  const { user, ready } = useAuth();
  const { t: copy, dir } = useLang();
  const t = useT();
  useEffect(() => { document.title = `${t('Sign in')} · Healthy Kitchen`; }, [t]);
  if (ready && user) return <Navigate to={homeFor(user)} replace />;
  return (
    <div dir={dir} className="mx-auto max-w-5xl px-4 pb-24 pt-28 sm:px-8 sm:pt-32">
      <div className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">{copy.authLabel}</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold text-forest sm:text-6xl">
          {copy.authH2[0]} <span className="italic text-sage">{copy.authH2[1]}</span>
        </h1>
      </div>
      <AuthForms />
    </div>
  );
}
