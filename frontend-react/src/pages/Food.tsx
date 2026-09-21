import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Minus } from "lucide-react";
import { money } from "../lib/api";
import { PageHero } from "../components/PageHero";

const products = [
  {
    name: "Sweet Popcorn",
    copy: "Freshly popped, warm and generously coated.",
    price: 399,
    crop: "popcorn",
    tag: "Vegetarian",
  },
  {
    name: "Loaded Nachos",
    copy: "Cheese sauce, tomato salsa and jalapeños.",
    price: 524,
    crop: "nachos",
    tag: "Vegetarian",
  },
  {
    name: "Movie Night Combo",
    copy: "Large popcorn, drink and a classic snack.",
    price: 649,
    crop: "combo",
    tag: "Best value",
  },
  {
    name: "Raspberry Slush",
    copy: "Frozen raspberry refreshment served ice cold.",
    price: 474,
    crop: "slush",
    tag: "Vegan",
  },
];

export function Food() {
  const [basket, setBasket] = useState<Record<string, number>>({});
  const basketTotal = products.reduce(
    (sum, item) => sum + item.price * (basket[item.name] || 0),
    0,
  );
  return (
    <section className="section">
      <span className="eyebrow">Express collection</span>
      <h1 className="page-title">Snacks sorted.</h1>
      <p className="page-intro">
        Order ahead with your tickets and collect from the express counter
        before the trailers.
      </p>
      <PageHero
        tint="food"
        image="/images/cinema-food.png"
        imageAlt="Popcorn and drinks ready for collection at the Cinego counter"
        eyebrow="Ready when you are"
        title="Skip the queue."
        copy="Add snacks to your booking and we will have them waiting at the express counter before your trailers finish."
      />
      <div className="food-grid">
        {products.map((item) => (
          <article className="food-card card" key={item.name}>
            <div className={`food-image food-image-${item.crop}`}>
              <img src={`/images/food-${item.crop}.png`} alt={item.name} />
            </div>
            <div className="food-body">
              <span className="food-tag">{item.tag}</span>
              <h2>{item.name}</h2>
              <p>{item.copy}</p>
              <div className="food-order">
                <strong>{money(item.price)}</strong>
                <div className="quantity" aria-label={`${item.name} quantity`}>
                  <button
                    aria-label={`Remove one ${item.name}`}
                    onClick={() =>
                      setBasket((current) => ({
                        ...current,
                        [item.name]: Math.max(0, (current[item.name] || 0) - 1),
                      }))
                    }
                  >
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <span>{basket[item.name] || 0}</span>
                  <button
                    aria-label={`Add one ${item.name}`}
                    onClick={() =>
                      setBasket((current) => ({
                        ...current,
                        [item.name]: (current[item.name] || 0) + 1,
                      }))
                    }
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="basket-bar card">
        <div>
          <span>Your food order</span>
          <strong>
            {Object.values(basket).reduce((a, b) => a + b, 0)} items ·{" "}
            {money(basketTotal)}
          </strong>
        </div>
        <Link className="button" to="/movies" search={{}}>
          Add to a booking
        </Link>
      </div>
    </section>
  );
}
