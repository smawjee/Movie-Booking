import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
export function AccountPanel() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [sessionEmail, setSessionEmail] = useState<string | null>(null),
    [mode, setMode] = useState<"signin" | "signup">("signin"),
    [status, setStatus] = useState<{ text: string; error: boolean } | null>(
      null,
    );
  useEffect(() => {
    supabase?.auth
      .getSession()
      .then(({ data }) => setSessionEmail(data.session?.user.email || null));
    const listener = supabase?.auth.onAuthStateChange((_event, session) =>
      setSessionEmail(session?.user.email || null),
    );
    return () => listener?.data.subscription.unsubscribe();
  }, []);
  if (!supabaseConfigured)
    return (
      <div className="supabase-setup card">
        <span className="eyebrow">Developer setup</span>
        <h2>Connect Supabase in four steps</h2>
        <p>
          Guest booking works now. Connect a project to enable real accounts,
          persistent bookings, memberships and realtime seat updates.
        </p>
        <ol>
          <li>
            Create a project at <strong>supabase.com</strong>.
          </li>
          <li>
            Run <code>supabase/migrations/20260910_initial_cinego.sql</code> in
            the SQL editor.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> and add the
            project URL and keys.
          </li>
          <li>
            Restart Express and Vite after changing environment variables.
          </li>
        </ol>
        <div className="env-example">
          <code>
            VITE_SUPABASE_URL=https://your-project.supabase.co
            <br />
            VITE_SUPABASE_ANON_KEY=your-anon-key
          </code>
        </div>
        <p className="notice">
          Keep <strong>SUPABASE_SERVICE_ROLE_KEY</strong> on the Express server
          only. Never prefix it with VITE_.
        </p>
      </div>
    );
  if (sessionEmail)
    return (
      <article className="card account-panel">
        <span className="eyebrow">Signed in</span>
        <h2>{sessionEmail}</h2>
        <p>
          Your bookings and membership can be protected by Supabase Row Level
          Security.
        </p>
        <button
          className="button secondary"
          onClick={() => supabase?.auth.signOut()}
        >
          Sign out
        </button>
      </article>
    );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const result =
      mode === "signin"
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({ email, password });
    setStatus(
      result.error
        ? { text: result.error.message, error: true }
        : { text: "Check your email to continue.", error: false },
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
    <form className="card account-panel" onSubmit={submit}>
      <span className="eyebrow">Supabase Auth</span>
      <h2>{mode === "signin" ? "Sign in" : "Create account"}</h2>
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {status && (
        <p
          className={status.error ? "error" : "auth-message"}
          role={status.error ? "alert" : undefined}
        >
          {status.text}
        </p>
      )}
      <button className="button">
        {mode === "signin" ? "Sign in" : "Create account"}
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
      {mode === "signin" && (
        <button type="button" className="text-button" onClick={resetPassword}>
          Forgot password?
        </button>
      )}
      <button
        type="button"
        className="button secondary"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "Create an account" : "I already have an account"}
      </button>
    </form>
  );
}
