// Ticket pricing: picks the single best discount for the customer and then
// adds member benefits. Pure, so the charge (createPaymentIntent) and the
// recorded total (confirm) always come from the same numbers, and it's
// unit-testable. The result feeds confirm_booking's
// total = round(full * (100 - discountPercent) / 100) - discountPence.

const STUDENT_PERCENT = 25;
const TUESDAY_STUDENT_PRICE = 300;
const THREE_D_SURCHARGE = 200;
// Stripe's minimum GBP charge; anything below is settled as a free checkout.
const MIN_CHARGE_PENCE = 30;

const applyPercent = (pence, percent) =>
  Math.round((pence * (100 - percent)) / 100);

/**
 * @param {object} input
 * @param {{pricePence:number,tier:string}[]} input.seats
 * @param {string} input.date          screening date, YYYY-MM-DD
 * @param {string} input.experienceId
 * @param {{code:string,discountPercent:number}|null} [input.promo]
 * @param {{plan:string,discountPercent:number}|null} [input.membership]
 * @param {boolean} [input.student]    verified student
 * @param {boolean} [input.freeTicketAvailable] monthly free ticket unused
 */
function priceTickets({
  seats,
  date,
  experienceId,
  promo = null,
  membership = null,
  student = false,
  freeTicketAvailable = false,
}) {
  const fullPence = seats.reduce((sum, seat) => sum + seat.pricePence, 0);
  const studentMember = membership?.plan === "student";
  const candidates = [
    { source: "none", label: null, discountPercent: 0, discountPence: 0 },
  ];
  if (promo)
    candidates.push({
      source: "promo",
      label: `Promo ${promo.code} (−${promo.discountPercent}%)`,
      promoCode: promo.code,
      discountPercent: promo.discountPercent,
      discountPence: 0,
    });
  if (membership?.discountPercent)
    candidates.push({
      source: "membership",
      label: `${membership.plan[0].toUpperCase()}${membership.plan.slice(1)} member (−${membership.discountPercent}%)`,
      discountPercent: membership.discountPercent,
      discountPence: 0,
    });
  if (student && !studentMember)
    candidates.push({
      source: "student",
      label: `Student discount (−${STUDENT_PERCENT}%)`,
      discountPercent: STUDENT_PERCENT,
      discountPence: 0,
    });
  // £3 Tuesdays for student members: flat price per ticket.
  const tuesday = new Date(`${date}T12:00:00Z`).getUTCDay() === 2;
  if (studentMember && tuesday) {
    const flat = TUESDAY_STUDENT_PRICE * seats.length;
    if (flat < fullPence)
      candidates.push({
        source: "student-tuesday",
        label: "Student Tuesday: £3 tickets",
        discountPercent: 0,
        discountPence: fullPence - flat,
        flatPerSeat: TUESDAY_STUDENT_PRICE,
      });
  }

  const finalOf = (c) =>
    Math.max(0, applyPercent(fullPence, c.discountPercent) - c.discountPence);
  const best = candidates.reduce((a, b) => (finalOf(b) < finalOf(a) ? b : a));
  const result = { ...best, perks: [] };

  // Student-member extras, applied on top of the best discount.
  if (studentMember && experienceId === "3d") {
    const waived = best.flatPerSeat
      ? 0
      : applyPercent(THREE_D_SURCHARGE * seats.length, best.discountPercent);
    if (waived > 0) {
      result.discountPence += waived;
      result.perks.push("Free 3D upgrade");
    }
  }
  let usesFreeTicket = false;
  if (studentMember && freeTicketAvailable && experienceId === "standard") {
    const standard = seats.filter((s) => s.tier === "standard");
    if (standard.length) {
      const cheapest = Math.min(...standard.map((s) => s.pricePence));
      const seatCost = best.flatPerSeat
        ? best.flatPerSeat
        : applyPercent(cheapest, best.discountPercent);
      result.discountPence += seatCost;
      result.perks.push("Monthly free ticket");
      usesFreeTicket = true;
    }
  }

  const amountPence = Math.max(
    0,
    applyPercent(fullPence, result.discountPercent) - result.discountPence,
  );
  return {
    fullPence,
    amountPence,
    discountPercent: result.discountPercent,
    discountPence: result.discountPence,
    savingsPence: fullPence - amountPence,
    source: result.source,
    promoCode: result.promoCode || null,
    labels: [result.label, ...result.perks].filter(Boolean),
    usesFreeTicket,
    free: amountPence < MIN_CHARGE_PENCE,
  };
}

module.exports = { priceTickets, STUDENT_PERCENT, MIN_CHARGE_PENCE };
