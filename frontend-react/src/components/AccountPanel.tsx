import { useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { ageFrom, latestDob, MIN_ACCOUNT_AGE, passwordStrength } from "../lib/age";

/** Signed-out view: sign in, or create an account with an age check. */
export function AccountPanel() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [fullName, setFullName] = useState(""),
    [dob, setDob] = useState(""),
    [terms, setTerms] = useState(false),
    [mode, setMode] = useState<"signin" | "signup">("signin"),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState<{ text: string; error: boolean } | null>(
      null,
    );
  if (!supabaseConfigured)
    return (
      <div className="supabase-setup card">
        <span className="eyebrow">Developer setup</span>
        <h2>Connect Supabase to enable accounts</h2>
        <p>
          Guest booking works now. Add <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> and restart
          to enable accounts, memberships and saved tickets.
        </p>
      </div>
    );
  const strength = passwordStrength(password);
  const age = ageFrom(dob);
  const signup = mode === "signup";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (signup) {
      if (!fullName.trim())
        return setStatus({ text: "Enter your full name.", error: true });
      if (age === null)
        return setStatus({ text: "Enter a valid date of birth.", error: true });
      if (age < MIN_ACCOUNT_AGE)
        return setStatus({
          text: `You must be ${MIN_ACCOUNT_AGE} or older to create a Cinego account. Under-${MIN_ACCOUNT_AGE}s can still visit with an adult who books for them.`,
          error: true,
        });
      if (!strength.acceptable)
        return setStatus({
          text: "Choose a stronger password (8+ characters with at least three of: upper/lower case, a number, a symbol).",
          error: true,
        });
      if (!terms)
        return setStatus({
          text: "Accept the terms and privacy policy to continue.",
          error: true,
        });
    }
    setBusy(true);
    const result = signup
      ? await supabase!.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            // Copied into the profile on first sign-in (see Account page).
            data: { full_name: fullName.trim(), date_of_birth: dob },
          },
        })
      : await supabase!.auth.signInWithPassword({ email, password });
    setBusy(false);
    setStatus(
      result.error
        ? { text: result.error.message, error: true }
        : signup && !result.data.session
          ? {
              text: "Check your inbox to confirm your email, then sign in.",
              error: false,
            }
          : null,
    );
  };
  const googleSignIn = async () => {
    const { error } = await supabase!.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setStatus({ text: error.message, error: true });
  };
  const resetPassword = async () => {
    if (!email)
      return setStatus({ text: "Enter your email address first.", error: true });
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account`,
    });
    setStatus(
      error
        ? { text: error.message, error: true }
        : { text: "Password reset email sent.", error: false },
    );
  };
  return (
    <form className="card account-panel" onSubmit={submit} noValidate>
      <span className="eyebrow">Your Cinego account</span>
      <h2>{signup ? "Create account" : "Sign in"}</h2>
      {signup && (
        <label>
          Full name
          <input
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
      )}
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {signup && (
        <label>
          Date of birth
          <input
            type="date"
            autoComplete="bday"
            required
            max={latestDob(0)}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          <small className="field-hint">
            Used to check age ratings when you book. You must be{" "}
            {MIN_ACCOUNT_AGE}+ to register; you can verify your ID later for
            15 and 18 films.
          </small>
        </label>
      )}
      <label>
        Password
        <input
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {signup && password && (
        <div className="password-meter" aria-live="polite">
          <div className="meter" data-score={strength.score}>
            <span style={{ width: `${(strength.score / 4) * 100}%` }} />
          </div>
          <small>{strength.label}</small>
          <ul>
            {strength.checks.map((c) => (
              <li key={c.label} className={c.ok ? "ok" : undefined}>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {signup && (
        <label className="check">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />{" "}
          I accept the terms of use and privacy policy, and confirm the
          details above are true.
        </label>
      )}
      {status && (
        <p
          className={status.error ? "error" : "auth-message"}
          role={status.error ? "alert" : "status"}
        >
          {status.text}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </button>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <button
        type="button"
        className="button google-button"
        onClick={googleSignIn}
      >
        <strong>G</strong> Continue with Google
      </button>
      {!signup && (
        <button type="button" className="text-button" onClick={resetPassword}>
          Forgot password?
        </button>
      )}
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setMode(signup ? "signin" : "signup");
          setStatus(null);
        }}
      >
        {signup ? "I already have an account" : "Create an account"}
      </button>
    </form>
  );
}
