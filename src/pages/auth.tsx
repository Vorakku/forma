import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Breadcrumb, FormError, useSubmit } from "@/components/common";
import { useApp } from "@/lib/store";

import type { Bootstrap } from "@/lib/types";
type Mode = "login" | "signup" | "reset";
const COPY: Record<Mode, [string, string]> = {
  login: ["Welcome back.", "Your frames, favorites, and future perspectives."],
  signup: [
    "A fresh start.",
    "Save your favorites and keep your orders in sight.",
  ],
  reset: [
    "Start again.",
    "We’ll show a demo verification code here instead of emailing it.",
  ],
};
export function AuthPage({ next = "/account" }: { next?: string }) {
  const [mode, setMode] = useState<Mode>("login"),
    [challenge, setChallenge] = useState<{
      challengeId: string;
      demoCode?: string;
    } | null>(null);
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    perform = useApp((s) => s.perform),
    { error, busy, submit, setError } = useSubmit();
  const switchTo = (m: Mode) => {
    setMode(m);
    setChallenge(null);
    setError("");
  };
  const done = (message: string) => {
    toast(message);
    const target = params.get("next") ?? next;
    navigate(
      target === "checkout"
        ? "/checkout?step=1"
        : target.startsWith("product/")
          ? "/" + target
          : target.startsWith("/") && !target.startsWith("//")
            ? target
            : "/account",
    );
  };
  const onSubmit = submit(async (f) => {
    if (mode === "signup") {
      const r = await perform<Bootstrap>(
        "/auth/register",
        "POST",
        {
          firstName: f.firstName,
          lastName: f.lastName,
          email: f.email,
          password: f.password,
        },
        { silent: true },
      );
      done(`Your account is ready, ${r.user.firstName}.`);
    } else if (mode === "login") {
      const r = await perform<Bootstrap>(
        "/auth/login",
        "POST",
        { email: f.email, password: f.password },
        { silent: true },
      );
      done(`Welcome back, ${r.user.firstName}.`);
    } else if (!challenge)
      setChallenge(await perform("/auth/forgot", "POST", { email: f.email }));
    else {
      await perform("/auth/reset", "POST", {
        challengeId: challenge.challengeId,
        code: f.code,
        password: f.password,
      });
      switchTo("login");
      toast("Password reset. You can sign in now.");
    }
  });
  const signup = mode === "signup",
    reset = mode === "reset";
  return (
    <div className="page-wrap">
      <Breadcrumb parts={[{ label: "Your account" }]} />
      <div className="auth-wrap">
        <span className="eyebrow" style={{ textAlign: "center" }}>
          Your FORMA
        </span>
        <h1>{COPY[mode][0]}</h1>
        <p>{COPY[mode][1]}</p>
        <form onSubmit={onSubmit} key={mode + !!challenge}>
          <div className="form-grid">
            {signup && (
              <>
                <div className="field">
                  <label htmlFor="auth-first">First name</label>
                  <input
                    id="auth-first"
                    name="firstName"
                    autoComplete="given-name"
                    maxLength={50}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-last">Last name</label>
                  <input
                    id="auth-last"
                    name="lastName"
                    autoComplete="family-name"
                    maxLength={50}
                    required
                  />
                </div>
              </>
            )}
            {!(reset && challenge) && (
              <div className="field">
                <label htmlFor="auth-email">Email address</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={120}
                  required
                />
              </div>
            )}
            {reset && challenge && (
              <>
                {challenge.demoCode && (
                  <p
                    className="local-account-note"
                    style={{ gridColumn: "1/-1", marginTop: 0 }}
                  >
                    Demo recovery: your code is{" "}
                    <strong>{challenge.demoCode}</strong>. No email was sent.
                  </p>
                )}
                <div className="field">
                  <label htmlFor="auth-code">Verification code</label>
                  <input
                    id="auth-code"
                    name="code"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                  />
                </div>
              </>
            )}
            {(!reset || challenge) && (
              <div className="field">
                <label htmlFor="auth-password">
                  {reset ? "New password" : "Password"}
                </label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  minLength={signup || reset ? 8 : 1}
                  maxLength={128}
                  autoComplete={
                    signup || reset ? "new-password" : "current-password"
                  }
                  required
                />
                {(signup || reset) && (
                  <span className="form-note">
                    Use at least 8 characters. Use a demo password.
                  </span>
                )}
              </div>
            )}
          </div>
          <FormError message={error} />
          <button
            className="button full"
            type="submit"
            disabled={busy}
            style={{ marginTop: 25 }}
          >
            {signup
              ? "Create demo account"
              : reset
                ? challenge
                  ? "Reset password"
                  : "Get a demo code"
                : "Sign in"}
          </button>
        </form>
        {mode === "login" && (
          <button
            type="button"
            className="text-button small"
            style={{ display: "block", margin: "18px auto" }}
            onClick={() => switchTo("reset")}
          >
            Forgot your password?
          </button>
        )}
        <div className="auth-switch">
          {signup
            ? "Already have an account?"
            : reset
              ? "Remember your password?"
              : "New around here?"}{" "}
          <button
            type="button"
            onClick={() => switchTo(signup || reset ? "login" : "signup")}
          >
            {signup || reset ? "Sign in" : "Create an account"}
          </button>
        </div>
        <div className="local-account-note">
          This is a demo store. Use made-up details and a password you don't use
          elsewhere. Your bag and saved frames carry over when you sign in.
        </div>
      </div>
    </div>
  );
}
