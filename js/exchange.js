// Official daily exchange rates (sell) of the Swiss Federal Office for Customs and Border
// Security (BAZG), read from the data feed behind https://www.rates.bazg.admin.ch.
// The feed is not officially documented and may change; callers fall back to manual
// conversion when it fails. Only the purchase date is sent.
//
// Rates are CHF per quoted unit ("100 JPY = 0.5612"). On weekends and holidays the feed
// returns the last working day's rates, which is what the BAZG applies too.

const API = 'https://www.backend-rates.bazg.admin.ch/daily';
const cache = new Map();

export class RateError extends Error {}

// isoDate "2026-06-13" -> { rateDate: "12.06.2026", quotes: Map(code -> { units, rate }) }
export function ratesFor(isoDate) {
  if (!cache.has(isoDate)) {
    const p = fetch(`${API}?d=${isoDate.replace(/-/g, '')}&locale=en`)
      .then((r) => {
        if (!r.ok) throw new RateError(`The BAZG rate service answered ${r.status}.`);
        return r.json();
      })
      .then((list) => {
        if (!Array.isArray(list) || !list.length) throw new RateError('No official rates were found for this date.');
        const quotes = new Map([['CHF', { units: 1, rate: 1 }]]);
        for (const q of list) {
          const [units, code] = String(q.currencyValue).split(' ');
          quotes.set(code.toUpperCase(), { units: Number(units), rate: Number(q.rate) });
        }
        return { rateDate: list[0].rateDate, quotes };
      });
    p.catch(() => cache.delete(isoDate)); // allow a retry after a failure
    cache.set(isoDate, p);
  }
  return cache.get(isoDate);
}

const fmt = (n) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
const quoteText = (code, q) => `${q.units} ${code} = ${q.rate} CHF`;

// Converts `amount` of `from` into `to` (CHF or EUR) at the BAZG rate of `isoDate`.
// Returns { value: "40.22", rateDate, explanation }.
export async function convert(amount, from, to, isoDate) {
  const { rateDate, quotes } = await ratesFor(isoDate);
  const qFrom = quotes.get(from);
  const qTo = quotes.get(to);
  if (!qFrom || !qTo) throw new RateError(`There is no official rate for ${!qFrom ? from : to} on this date.`);

  const chf = (amount * qFrom.rate) / qFrom.units;
  const result = Math.round(((chf * qTo.units) / qTo.rate) * 100) / 100;
  const used = [from, to].filter((c) => c !== 'CHF').map((c) => quoteText(c, quotes.get(c)));
  return {
    value: result.toFixed(2),
    rateDate,
    explanation: `${fmt(amount)} ${from} = ${fmt(result)} ${to} · BAZG rate of ${rateDate}: ${used.join(', ')}`,
  };
}
