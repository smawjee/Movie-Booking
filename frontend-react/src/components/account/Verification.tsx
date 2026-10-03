import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, GraduationCap, IdCard, Upload } from "lucide-react";
import { account } from "../../lib/api";
import { ageFrom, latestDob, MIN_ACCOUNT_AGE } from "../../lib/age";
import type { DocumentMeta, Profile } from "../../types";

const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

/** Picks a document photo. The file itself never leaves the browser (demo). */
function DocumentPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DocumentMeta | null;
  onChange: (meta: DocumentMeta | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  return (
    <label className="doc-picker">
      <span>{label}</span>
      <span className="doc-drop">
        {preview ? (
          <img src={preview} alt="Selected document preview" />
        ) : (
          <Upload size={22} aria-hidden="true" />
        )}
        <span>
          {value
            ? `${value.name} · ${Math.round(value.size / 1024)} KB`
            : "Take a photo or choose a file (JPG, PNG, HEIC or PDF)"}
        </span>
      </span>
      <input
        type="file"
        accept={ACCEPTED}
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (preview) URL.revokeObjectURL(preview);
          setPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
          onChange(file ? { name: file.name, type: file.type, size: file.size } : null);
        }}
      />
    </label>
  );
}

const StatusPill = ({ status }: { status: string }) => (
  <span className={`status-pill ${status}`}>
    {status === "verified"
      ? "Verified"
      : status === "pending"
        ? "Checking…"
        : status === "rejected"
          ? "Not verified"
          : status === "expired"
            ? "Expired"
            : "Not started"}
  </span>
);

function IdentityVerify({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState<
    "passport" | "driving_licence" | "national_id"
  >("passport");
  const [dob, setDob] = useState(profile.dateOfBirth || "");
  const [doc, setDoc] = useState<DocumentMeta | null>(null);
  const submit = useMutation({
    mutationFn: () =>
      account.verifyIdentity({ documentType, dateOfBirth: dob, document: doc! }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["account", "profile"] }),
  });
  const status = profile.identity.status;
  const age = ageFrom(dob);
  return (
    <article className="card verify-card">
      <div className="verify-head">
        <IdCard size={22} aria-hidden="true" />
        <div>
          <h3>Photo ID</h3>
          <p className="muted small">
            Verifying once lets you book 15 and 18 films without an age check
            every time. It is required for 18-rated films when you’re signed
            in.
          </p>
        </div>
        <StatusPill status={status} />
      </div>
      {status === "verified" ? (
        <p className="auth-message">
          <BadgeCheck size={16} aria-hidden="true" /> ID verified
          {profile.identity.verifiedAt &&
            ` on ${new Date(profile.identity.verifiedAt).toLocaleDateString("en-GB")}`}
          . Age on file: {profile.age}.
        </p>
      ) : status === "pending" ? (
        <p className="notice" role="status">
          Checking your document… this takes a few seconds.
        </p>
      ) : (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <label>
            Document type
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
            >
              <option value="passport">Passport</option>
              <option value="driving_licence">Driving licence</option>
              <option value="national_id">National ID card</option>
            </select>
          </label>
          <label>
            Date of birth (as shown on the document)
            <input
              type="date"
              max={latestDob(0)}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </label>
          <DocumentPicker label="Photo of your document" value={doc} onChange={setDoc} />
          {status === "rejected" && !submit.error && (
            <p className="error">
              Your last check didn’t pass. Make sure the date of birth matches
              your account and the photo is clear.
            </p>
          )}
          {submit.error && (
            <p className="error" role="alert">
              {submit.error.message}
            </p>
          )}
          <button
            className="button"
            disabled={!doc || age === null || age < MIN_ACCOUNT_AGE || submit.isPending}
          >
            {submit.isPending ? "Submitting…" : "Verify my ID"}
          </button>
        </form>
      )}
    </article>
  );
}

function StudentVerify({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [institution, setInstitution] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [code, setCode] = useState("");
  const [doc, setDoc] = useState<DocumentMeta | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["account", "profile"] });
  const start = useMutation({
    mutationFn: () => account.studentStart({ studentEmail, institution }),
  });
  const confirm = useMutation({
    mutationFn: () => account.studentConfirm({ code, document: doc! }),
    onSettled: refresh,
  });
  const status = profile.student.status;
  return (
    <article className="card verify-card">
      <div className="verify-head">
        <GraduationCap size={22} aria-hidden="true" />
        <div>
          <h3>Student status</h3>
          <p className="muted small">
            Verified students get 25% off every ticket and can join the
            Student membership (£4.99/month).
          </p>
        </div>
        <StatusPill status={status} />
      </div>
      {status === "verified" ? (
        <p className="auth-message">
          <BadgeCheck size={16} aria-hidden="true" /> Verified with{" "}
          {profile.student.email}
          {profile.student.verifiedUntil &&
            ` until ${new Date(profile.student.verifiedUntil).toLocaleDateString("en-GB")}`}
          . Your 25% student discount applies automatically at checkout.
        </p>
      ) : status === "pending" ? (
        <p className="notice" role="status">
          Checking your student ID… this takes a few seconds.
        </p>
      ) : !start.data ? (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            start.mutate();
          }}
        >
          <p className="step-label">Step 1 of 2: confirm your student email</p>
          <label>
            University or college
            <input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="e.g. University of Edinburgh"
            />
          </label>
          <label>
            Student email address
            <input
              type="email"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              placeholder="s1234567@ed.ac.uk"
            />
          </label>
          {status === "expired" && (
            <p className="notice">Your student status has expired. Verify again to keep your discount.</p>
          )}
          {start.error && (
            <p className="error" role="alert">
              {start.error.message}
            </p>
          )}
          <button
            className="button"
            disabled={!institution.trim() || !studentEmail || start.isPending}
          >
            {start.isPending ? "Sending code…" : "Send verification code"}
          </button>
        </form>
      ) : (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <p className="step-label">Step 2 of 2: enter your code and add your student ID</p>
          <p className="muted small">We sent a 6-digit code to {start.data.sentTo}.</p>
          {start.data.demoCode && (
            <p className="notice">
              Demo mode (email isn’t configured on this server): your code is{" "}
              <strong>{start.data.demoCode}</strong>
            </p>
          )}
          <label>
            6-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <DocumentPicker label="Photo of your student ID card" value={doc} onChange={setDoc} />
          {confirm.error && (
            <p className="error" role="alert">
              {confirm.error.message}
            </p>
          )}
          <button
            className="button"
            disabled={code.length !== 6 || !doc || confirm.isPending}
          >
            {confirm.isPending ? "Verifying…" : "Verify student status"}
          </button>
          <button type="button" className="text-button" onClick={() => start.reset()}>
            Use a different email
          </button>
        </form>
      )}
    </article>
  );
}

export function Verification({ profile }: { profile: Profile }) {
  return (
    <div className="account-section">
      <div className="section-head">
        <div>
          <h2>Verification</h2>
          <p className="muted">
            Demo verification: documents are checked in your browser and never
            uploaded or stored. A real deployment would use an identity
            provider.
          </p>
        </div>
      </div>
      <div className="verify-grid">
        <IdentityVerify profile={profile} />
        <StudentVerify profile={profile} />
      </div>
    </div>
  );
}
