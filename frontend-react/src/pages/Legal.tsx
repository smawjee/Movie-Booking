// Plain-language policies. Google's OAuth consent screen needs public privacy
// and terms links before the app can be published to all users.
export function Privacy() {
  return (
    <section className="section narrow">
      <span className="eyebrow">Legal</span>
      <h1 className="page-title">Privacy policy</h1>
      <p className="page-intro">
        Cinego is a portfolio demonstration project. This page explains what it
        stores and why.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          Account details: your email address, name and date of birth. If you
          sign in with Google we receive only your email address, name and
          profile picture.
        </li>
        <li>
          Bookings: the film, screening, seats, price and the email address
          tickets are sent to.
        </li>
        <li>
          Payments: handled by Stripe in test mode. We keep only the card brand,
          last four digits and a transaction reference — never full card numbers
          or CVVs.
        </li>
        <li>
          Verification: for ID or student checks we keep the document type, file
          name and size, not the document itself.
        </li>
      </ul>
      <h2>How it is used</h2>
      <p>
        Only to run your account, issue and email tickets, apply age ratings,
        memberships and discounts. Nothing is sold or shared for advertising.
      </p>
      <h2>Where it is stored</h2>
      <p>
        Account and booking data are stored in Supabase; payments are processed
        by Stripe. Questions to the Cinebot assistant may be sent to OpenAI to
        generate a reply.
      </p>
      <h2>Your choices</h2>
      <p>
        You can update your profile from your account page, and ask for your
        account and its data to be deleted at any time.
      </p>
    </section>
  );
}

export function Terms() {
  return (
    <section className="section narrow">
      <span className="eyebrow">Legal</span>
      <h1 className="page-title">Terms of service</h1>
      <p className="page-intro">
        Cinego is a portfolio demonstration project, not a real cinema.
      </p>
      <ul>
        <li>
          Screenings, seats and tickets are simulated and cannot be used for
          entry to any venue.
        </li>
        <li>
          Payments run in Stripe test mode: use test cards only, and no real
          money is taken.
        </li>
        <li>
          You must be 13 or older to create an account, and must give accurate
          details for age-rated bookings.
        </li>
        <li>
          The service is provided as is, may change or go offline at any time,
          and accounts may be removed.
        </li>
      </ul>
    </section>
  );
}
