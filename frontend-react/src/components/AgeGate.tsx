import { useMemo, useState } from "react";
import type { AgeConfirmation } from "../types";
const minimum = (rating: string) =>
  rating === "18" ? 18 : rating === "15" ? 15 : rating === "12A" ? 12 : 0;
/** `accountAge` is the age from the signed-in account's date of birth; when
 *  known, the form only asks for the group declaration. */
export function AgeGate({
  rating,
  onConfirm,
  accountAge = null,
}: {
  rating: string;
  onConfirm: (value: AgeConfirmation) => void;
  accountAge?: number | null;
}) {
  const [dob, setDob] = useState("");
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState("");
  const age = useMemo(() => {
    if (accountAge !== null) return accountAge;
    if (!dob) return null;
    const birth = new Date(`${dob}T12:00:00`),
      now = new Date();
    if (Number.isNaN(birth.valueOf()) || birth > now) return null;
    let value = now.getFullYear() - birth.getFullYear();
    if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()))
      value--;
    return value;
  }, [dob, accountAge]);
  const submit = () => {
    const min = minimum(rating);
    if (age === null) {
      setError("Enter a valid date of birth.");
      return;
    }
    if ((rating === "15" || rating === "18") && age < min) {
      setError(`The lead booker must be at least ${min} for this screening.`);
      return;
    }
    if (!declared) {
      setError("Confirm that everyone in your group meets the rating rules.");
      return;
    }
    const ageBand =
      age >= 18
        ? "18-plus"
        : age >= 15
          ? "15-17"
          : age >= 12
            ? "12-14"
            : "under-12";
    setDob("");
    onConfirm({
      rating,
      ageBand,
      declared: true,
      policyVersion: "uk-2026-1",
      confirmedAt: new Date().toISOString(),
    });
  };
  return (
    <section className="age-gate card">
      <span className="eyebrow">Age confirmation</span>
      <h2>{rating} rated film</h2>
      <p>
        {rating === "12A"
          ? "Children under 12 must be accompanied by an adult."
          : rating === "15" || rating === "18"
            ? `All guests must be ${rating} or older.`
            : "Parental guidance may be advised."}{" "}
        Valid photo ID may be requested.
      </p>
      {accountAge === null ? (
        <label>
          Date of birth
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </label>
      ) : (
        <p className="muted small">Using the date of birth on your account.</p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={declared}
          onChange={(e) => setDeclared(e.target.checked)}
        />{" "}
        I confirm every guest meets the age rules and understands ID may be
        checked.
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" onClick={submit}>
        Confirm and choose seats
      </button>
    </section>
  );
}
