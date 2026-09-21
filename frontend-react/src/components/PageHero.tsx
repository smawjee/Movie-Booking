import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow: string;
  title: ReactNode;
  copy: string;
  image?: string;
  imageAlt?: string;
  tint?: "premium" | "food";
  as?: "h1" | "h2";
  cta?: ReactNode;
};

export function PageHero({
  eyebrow,
  title,
  copy,
  image,
  imageAlt,
  tint,
  as = "h2",
  cta,
}: PageHeroProps) {
  const Heading = as;
  if (!image) {
    return (
      <section className="page-hero-pattern">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <Heading>{title}</Heading>
          <p>{copy}</p>
          {cta}
        </div>
      </section>
    );
  }
  return (
    <section className="page-hero card" data-tint={tint}>
      <img src={image} alt={imageAlt || ""} />
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <Heading>{title}</Heading>
        <p>{copy}</p>
        {cta}
      </div>
    </section>
  );
}
