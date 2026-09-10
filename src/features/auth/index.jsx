/* Auth feature — sign in / sign up / reset, and the post-recovery set-password
   screen. Moved verbatim out of ReleaseTracker.jsx (Phase 0). */
import { useState } from 'react';
import { card, inputStyle, primaryButton, Logo, Wordmark } from '@/ui.jsx';
import { Field, authLink } from '@shared/ui-kit.jsx';
import { ALLOWED_EMAIL_DOMAIN, emailDomainOk } from '@/constants.js';
import { IconCode, IconShieldCheck } from '@/illustrations.jsx';
import { IconBug } from '@/icons.jsx';

export function AuthScreen({ isSubmitting, onSignIn, onSignUp, onResetRequest }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Developer');

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';
  const domainBad = email.trim().length > 0 && !emailDomainOk(email);
  const invalid = isReset
    ? !email.trim() || domainBad
    : !email.trim() || domainBad || password.length < 6 || (isSignup && !name.trim());

  function submit() {
    if (invalid || isSubmitting) return;
    if (isReset) onResetRequest(email);
    else if (isSignup) onSignUp({ name, email, password, role });
    else onSignIn({ email, password });
  }

  const tab = (active) => ({
    flex: 1,
    padding: '8px 0',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'center',
    cursor: 'pointer',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    borderBottom: `2px solid ${active ? 'var(--brand)' : 'transparent'}`,
  });

  return (
    /* Full-viewport split: brand/illustration panel (left, ~55%) + form panel (right).
       Wraps to a single column under ~900px. */
    <div className="auth-split" style={{ background: 'var(--card)' }}>
        {/* brand panel */}
        <div
          className="auth-brand grid-dots"
          style={{
            flex: '1 1 480px',
            minWidth: 0,
            padding: 'clamp(28px, 4vw, 56px)',
            background: 'var(--ink-2)',
            color: 'var(--on-ink)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Wordmark size={40} tone="ink" />

          {/* Miaro Verify hero illustration (transparent PNG, public/brand/auth-hero.png) */}
          {/* flex:1 + minHeight:0 lets the picture shrink to whatever height is left,
              so the panel never grows past the viewport */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '24px 0' }}>
            <img
              src="/brand/auth-hero.png"
              alt="Developers and QA reviewing code, tracking builds and fixing bugs across a release pipeline"
              style={{ display: 'block', width: '100%', maxWidth: 860, height: '100%', maxHeight: 480, objectFit: 'contain' }}
            />
          </div>

          <div style={{ paddingTop: 8 }}>
            <h2 style={{ fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 700, lineHeight: 1.12, margin: 0, letterSpacing: '-0.02em' }}>
              Ship it. Test it.<br />
              <span style={{ color: 'var(--brand)' }}>Track every build.</span>
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--on-ink-dim)', margin: '14px 0 22px', maxWidth: 560 }}>
              From APK to TestFlight to web — one pipeline for dev and QA.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px' }}>
              {[
                [<IconCode size={16} />, 'Project-based release pipeline'],
                [<IconBug size={16} />, 'QA bug tracking & screenshots'],
                [<IconShieldCheck size={16} />, 'Checklists & role-based sign-off'],
              ].map(([icon, t]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: 'var(--brand-soft)',
                      color: 'var(--brand)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </span>
                  <span style={{ color: 'var(--on-ink)' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* form panel — the form column is centred and capped at 440px */}
        <div className="auth-form" style={{ flex: '1 1 400px', minWidth: 0, padding: 'clamp(28px, 4vw, 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* entrance animation lives on the form column only — a translateY on the
            100vh wrapper would add a scrollbar */}
        <div className="anim-in" style={{ width: '100%', maxWidth: 440 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.02em' }}>
            {isReset ? 'Reset password' : isSignup ? 'Create your account' : 'Welcome back'}
          </div>
          <div
            style={{
              fontSize: 15,
              color: 'var(--color-text-secondary)',
              marginBottom: 26,
            }}
          >
            {isReset
              ? 'We’ll email you a link to set a new password.'
              : isSignup
              ? 'Join your team on Miaro Verify'
              : 'Sign in to continue'}
          </div>

          {!isReset && (
            <div
              style={{
                display: 'flex',
                marginBottom: 20,
                borderBottom: '0.5px solid var(--color-border-tertiary)',
              }}
            >
              <div style={tab(!isSignup)} onClick={() => setMode('signin')}>
                Sign in
              </div>
              <div style={tab(isSignup)} onClick={() => setMode('signup')}>
                Create account
              </div>
            </div>
          )}

        {isSignup && (
          <Field label="Name">
            <input
              style={inputStyle}
              value={name}
              autoFocus
              placeholder="e.g. dev_ali"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </Field>
        )}

        {isSignup && (
          <Field label="Role">
            <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="Developer">Developer</option>
              <option value="QA">QA</option>
            </select>
          </Field>
        )}

        <Field label="Email">
          <input
            style={inputStyle}
            type="email"
            value={email}
            autoFocus={!isSignup}
            placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>

        {!isReset && (
          <Field label="Password">
            <input
              style={inputStyle}
              type="password"
              value={password}
              placeholder="At least 6 characters"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </Field>
        )}

        <div
          style={{
            fontSize: 11,
            color: '#dc2626',
            marginBottom: 14,
            minHeight: 14,
          }}
        >
          {domainBad
            ? `Use your @${ALLOWED_EMAIL_DOMAIN} email address.`
            : !isReset && password.length > 0 && password.length < 6
            ? 'Password must be at least 6 characters.'
            : ''}
        </div>

          <button
            style={{ ...primaryButton(invalid || isSubmitting), width: '100%', padding: '11px 16px' }}
            disabled={invalid || isSubmitting}
            onClick={submit}
          >
            {isSubmitting
              ? 'Please wait…'
              : isReset
              ? 'Send reset link'
              : isSignup
              ? 'Create account'
              : 'Sign in'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5 }}>
            {isReset ? (
              <button onClick={() => setMode('signin')} style={authLink}>
                ← Back to sign in
              </button>
            ) : (
              !isSignup && (
                <button onClick={() => setMode('reset')} style={authLink}>
                  Forgot password?
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SetPasswordScreen({ isSubmitting, onSetPassword }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const mismatch = pw2.length > 0 && pw !== pw2;
  const invalid = pw.length < 6 || pw !== pw2;
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div className="anim-in" style={{ ...card, width: '100%', maxWidth: 380, padding: 32, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Wordmark size={26} />
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Set a new password</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
          Choose a new password for your account.
        </div>
        <Field label="New password">
          <input
            style={inputStyle}
            type="password"
            value={pw}
            autoFocus
            placeholder="At least 6 characters"
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <Field label="Confirm password">
          <input
            style={{ ...inputStyle, borderColor: mismatch ? '#dc2626' : 'var(--color-border-tertiary)' }}
            type="password"
            value={pw2}
            placeholder="Re-enter password"
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !invalid && onSetPassword(pw)}
          />
        </Field>
        <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 14, minHeight: 14 }}>
          {mismatch ? 'Passwords do not match.' : pw.length > 0 && pw.length < 6 ? 'At least 6 characters.' : ''}
        </div>
        <button
          style={{ ...primaryButton(invalid || isSubmitting), width: '100%', padding: '11px 16px' }}
          disabled={invalid || isSubmitting}
          onClick={() => onSetPassword(pw)}
        >
          {isSubmitting ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </div>
  );
}
