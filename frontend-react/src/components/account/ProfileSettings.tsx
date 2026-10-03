import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { account } from "../../lib/api";
import { latestDob } from "../../lib/age";
import { supabase } from "../../lib/supabase";
import type { Profile } from "../../types";

export function ProfileSettings({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(profile.fullName || "");
  const [dob, setDob] = useState(profile.dateOfBirth || "");
  const locked = profile.identity.status === "verified";
  const save = useMutation({
    mutationFn: () =>
      account.updateProfile({
        ...(fullName.trim() && { fullName: fullName.trim() }),
        ...(!locked && dob && { dateOfBirth: dob }),
      }),
    onSuccess: (data) => queryClient.setQueryData(["account", "profile"], data),
  });
  return (
    <div className="account-section">
      <div className="section-head">
        <h2>Profile</h2>
      </div>
      <form
        className="card form-grid profile-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Email
          <input value={profile.email || ""} disabled />
        </label>
        <label>
          Full name
          <input
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <label>
          Date of birth
          <input
            type="date"
            max={latestDob(0)}
            value={dob}
            disabled={locked}
            onChange={(e) => setDob(e.target.value)}
          />
          {locked && (
            <small className="field-hint">
              Locked after ID verification. Contact support to change it.
            </small>
          )}
        </label>
        {save.error && (
          <p className="error" role="alert">
            {save.error.message}
          </p>
        )}
        {save.isSuccess && (
          <p className="auth-message" role="status">
            Profile saved.
          </p>
        )}
        <div className="ticket-actions">
          <button className="button" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              queryClient.removeQueries({ queryKey: ["account"] });
              queryClient.removeQueries({ queryKey: ["membership"] });
              void supabase?.auth.signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}
