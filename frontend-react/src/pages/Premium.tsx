import { Link } from "@tanstack/react-router";
import { experiences } from "../lib/experiences";
import { PageHero } from "../components/PageHero";

function SeatPreview() {
  const seats = Array.from({ length: 36 }, (_, index) => index);
  return (
    <section className="seat-preview card" aria-labelledby="seat-preview-title">
      <div className="seat-preview-copy">
        <span className="eyebrow">Know before you book</span>
        <h2 id="seat-preview-title">
          See exactly what the seat map looks like.
        </h2>
        <p>
          Every booking includes a live auditorium map. Standard seats offer a
          clear view, premium recliners add space, and accessible positions are
          clearly marked.
        </p>
        <div className="seat-legend">
          <span>
            <i className="seat-dot available" /> Available
          </span>
          <span>
            <i className="seat-dot premium" /> Premium recliner
          </span>
          <span>
            <i className="seat-dot selected" /> Your selection
          </span>
          <span>
            <i className="seat-dot unavailable" /> Unavailable
          </span>
        </div>
      </div>
      <div
        className="mini-auditorium"
        aria-label="Example auditorium seating plan"
      >
        <div className="mini-screen">SCREEN</div>
        <div className="mini-seats">
          {seats.map((seat) => (
            <span
              key={seat}
              className={`${seat > 23 ? "premium" : "available"} ${seat === 27 || seat === 28 ? "selected" : ""} ${[4, 10, 20].includes(seat) ? "unavailable" : ""}`}
            />
          ))}
        </div>
        <small>
          Illustrative layout — the live map updates for each screening.
        </small>
      </div>
    </section>
  );
}

export function Premium() {
  return (
    <section className="section">
      <span className="eyebrow">Beyond standard</span>
      <h1 className="page-title">Six ways to feel every moment.</h1>
      <PageHero
        tint="premium"
        image="/images/premium-cinema.png"
        imageAlt="Luxury Cinego auditorium with reclining seats"
        eyebrow="Made for the big screen"
        title="More picture. More sound. More cinema."
        copy="Compare every auditorium before choosing your film. Premium surcharges are always shown upfront."
      />
      <div className="experience-grid">
        {Object.entries(experiences).map(([id, x]) => (
          <article className={`experience card format-${id}`} key={id}>
            <div className={`experience-image experience-image-${id}`}>
              <img
                src={`/images/screen-${id}.png`}
                alt={`${x.name} auditorium`}
              />
              <span>{x.name}</span>
            </div>
            <div className="experience-body">
              <span className="eyebrow">{id.toUpperCase()}</span>
              <h2>{x.name}</h2>
              <p>{x.copy}</p>
              {x.warning && <p className="warning">{x.warning}</p>}
              <Link className="button secondary" to="/movies" search={{}}>
                Find showtimes
              </Link>
            </div>
          </article>
        ))}
      </div>
      <SeatPreview />
    </section>
  );
}
