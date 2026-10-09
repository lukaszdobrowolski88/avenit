// Cennik formularzy — JEDNA implementacja dla webu (podsumowanie ceny w FormRenderer) i API
// (fn przelewy24-create-payment liczy kwotę płatności z definicji formularza, nie od klienta).
//
// Model (forms.fields / forms.settings):
//   • pole typu 'price' (priceConfig: basePrice, pricingType fixed|per_person|tiered, tiers,
//     datePricing {enabled, tiers [{until: 'YYYY-MM-DD', price}]});
//   • pole 'quantity' (liczba osób; validation.min/max);
//   • settings.groupRegistration (osoba kontaktowa + uczestnicy, min/maxParticipants);
//   • settings.addons.items [{id, price, scope per_person|per_registration, maxQuantity, available}];
//   • settings.discounts {enabled, rules [{type:'quantity', minQuantity, discountType, value, stackable}], stackingMode};
//   • settings.pricing.customAmount {enabled, min, max} — dowolna kwota (np. darowizna) w zł.
// Ceny w zł (mogą mieć grosze); kwota płatności = round(grandTotal * 100) groszy.

const pad = (n) => String(n).padStart(2, '0');
// Dzisiejsza data (YYYY-MM-DD) w lokalnej strefie przeglądarki; serwer podaje własną (Europe/Warsaw).
export function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Aktywny próg cennika datowego: pierwszy (wg daty) z `until` >= dziś; brak → null (cena bazowa).
export function activeDateTier(priceConfig, today = localYmd()) {
  const dp = priceConfig?.datePricing;
  if (!dp?.enabled || !Array.isArray(dp.tiers) || !dp.tiers.length) return null;
  const sorted = dp.tiers
    .filter((t) => t && t.until && t.price != null)
    .sort((a, b) => (String(a.until) < String(b.until) ? -1 : String(a.until) > String(b.until) ? 1 : 0));
  return sorted.find((t) => String(t.until).slice(0, 10) >= today) || null;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Rozbicie ceny (grupowa rejestracja, dodatki, rabaty). `opts.today` — 'YYYY-MM-DD' dla progów datowych.
export function calculatePriceBreakdown(fields, answers, settings, opts = {}) {
  const list = Array.isArray(fields) ? fields : [];
  const a = answers || {};
  const addonsConfig = settings?.addons || {};
  const discountsConfig = settings?.discounts || {};
  const groupConfig = settings?.groupRegistration || {};

  // 1. Cena bazowa z pola price (z uwzględnieniem cennika datowego)
  let baseUnitPrice = 0;
  let pricingType = 'fixed';
  let dateTier = null;
  const priceField = list.find((f) => f.type === 'price' && f.priceConfig);
  if (priceField) {
    baseUnitPrice = num(priceField.priceConfig.basePrice);
    pricingType = priceField.priceConfig.pricingType || 'fixed';
    dateTier = activeDateTier(priceField.priceConfig, opts.today || localYmd());
    if (dateTier) baseUnitPrice = num(dateTier.price);
  }

  // 2. Liczba uczestników (osoba kontaktowa + członkowie)
  let participantCount = 1;
  if (groupConfig.enabled && (a._participants || a._contactPerson)) {
    participantCount = (a._participants?.length || 0) + (a._contactPerson ? 1 : 0);
  } else {
    const quantityField = list.find((f) => f.type === 'quantity');
    if (quantityField) participantCount = parseInt(a[quantityField.id], 10) || 1;
  }

  // 3. Cena bazowa razem
  let baseTotal;
  switch (pricingType) {
    case 'per_person':
      baseTotal = baseUnitPrice * participantCount;
      break;
    case 'tiered': {
      const tier = priceField?.priceConfig?.tiers?.find((t) => participantCount >= t.minQty && participantCount <= t.maxQty);
      baseTotal = (tier ? num(tier.price) : baseUnitPrice) * participantCount;
      break;
    }
    default:
      baseTotal = baseUnitPrice;
  }

  // 4. Dodatki
  const addonsBreakdown = [];
  let addonsTotal = 0;
  if (addonsConfig.enabled && addonsConfig.items?.length > 0) {
    addonsConfig.items.forEach((addon) => {
      if (!addon.available && addon.available !== undefined) return;
      let totalQty = 0;
      if (addon.scope === 'per_person') {
        (a._participants || []).forEach((p) => { totalQty += (p?._addons?.[addon.id] || 0); });
        if (a._contactPerson?._addons?.[addon.id]) totalQty += a._contactPerson._addons[addon.id];
        if (a._addons?.[addon.id]) totalQty += a._addons[addon.id];
      } else {
        totalQty = a._registrationAddons?.[addon.id] || 0;
      }
      if (totalQty > 0) {
        const total = num(addon.price) * totalQty;
        addonsBreakdown.push({ id: addon.id, name: addon.name, unitPrice: num(addon.price), quantity: totalQty, total });
        addonsTotal += total;
      }
    });
  }

  // 5. Suma częściowa
  const subtotal = baseTotal + addonsTotal;

  // 6. Rabaty
  const appliedDiscounts = [];
  let discountTotal = 0;
  if (discountsConfig.enabled && discountsConfig.rules?.length > 0) {
    const qualifying = discountsConfig.rules
      .filter((rule) => rule.type === 'quantity' && participantCount >= rule.minQuantity)
      .map((rule) => {
        let amount = 0;
        switch (rule.discountType) {
          case 'percentage': amount = baseTotal * (num(rule.value) / 100); break;
          case 'fixed_per_person': amount = num(rule.value) * participantCount; break;
          case 'fixed_total': amount = num(rule.value); break;
          default: amount = 0;
        }
        return { ...rule, amount };
      })
      .sort((x, y) => y.amount - x.amount);

    if (discountsConfig.stackingMode === 'all') {
      qualifying.forEach((rule) => {
        if (rule.stackable || qualifying.length === 1) {
          appliedDiscounts.push({ label: rule.label, amount: rule.amount });
          discountTotal += rule.amount;
        }
      });
      if (appliedDiscounts.length === 0 && qualifying.length > 0) {
        appliedDiscounts.push({ label: qualifying[0].label, amount: qualifying[0].amount });
        discountTotal = qualifying[0].amount;
      }
    } else if (qualifying.length > 0) {
      appliedDiscounts.push({ label: qualifying[0].label, amount: qualifying[0].amount });
      discountTotal = qualifying[0].amount;
    }
  }

  const grandTotal = Math.max(0, subtotal - discountTotal);
  return {
    baseUnitPrice, participantCount, pricingType, baseTotal, addonsBreakdown, addonsTotal,
    subtotal, appliedDiscounts, discountTotal, grandTotal, activeDateTier: dateTier,
  };
}

// ── Dane do wyceny wysyłane na serwer (bez danych osobowych uczestników) ─────────────
const intIn = (v, min, max) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Tylko to, od czego zależy cena: liczba osób, dodatki, liczba uczestników grupy.
export function pricingAnswers(fields, answers) {
  const a = answers || {};
  const out = {};
  const q = (Array.isArray(fields) ? fields : []).find((f) => f.type === 'quantity');
  if (q && a[q.id] !== undefined && a[q.id] !== null && a[q.id] !== '') out[q.id] = a[q.id];
  if (isObj(a._addons)) out._addons = { ...a._addons };
  if (isObj(a._registrationAddons)) out._registrationAddons = { ...a._registrationAddons };
  if (a._contactPerson) out._contactPerson = { _addons: isObj(a._contactPerson._addons) ? { ...a._contactPerson._addons } : {} };
  if (Array.isArray(a._participants)) out._participants = a._participants.map((p) => ({ _addons: isObj(p?._addons) ? { ...p._addons } : {} }));
  return out;
}

// Serwer: dane do wyceny od klienta → w granicach formularza (liczby osób i dodatków nie da się
// podać ujemnych, ułamkowych ani ponad limit; nieznane dodatki pomijane).
export const MAX_QUANTITY = 1000;
export function sanitizePricingAnswers(fields, settings, raw) {
  const r = isObj(raw) ? raw : {};
  const out = {};
  const q = (Array.isArray(fields) ? fields : []).find((f) => f.type === 'quantity');
  if (q && r[q.id] !== undefined && r[q.id] !== null && r[q.id] !== '') {
    const min = Math.max(1, parseInt(q.validation?.min, 10) || 1);
    const max = Math.max(min, Math.min(MAX_QUANTITY, parseInt(q.validation?.max, 10) || MAX_QUANTITY));
    out[q.id] = intIn(r[q.id], min, max);
  }
  const items = settings?.addons?.enabled && Array.isArray(settings.addons.items) ? settings.addons.items : [];
  const addonMap = (src, scope) => {
    const res = {};
    if (!isObj(src)) return res;
    for (const addon of items) {
      if (addon?.scope === 'per_person' ? scope !== 'per_person' : scope !== 'per_registration') continue;
      if (src[addon.id] === undefined) continue;
      const qty = intIn(src[addon.id], 0, Math.max(1, Math.min(MAX_QUANTITY, parseInt(addon.maxQuantity, 10) || 1)));
      if (qty > 0) res[addon.id] = qty;
    }
    return res;
  };
  const group = settings?.groupRegistration || {};
  if (group.enabled && (r._contactPerson || Array.isArray(r._participants))) {
    const maxP = Math.max(1, Math.min(MAX_QUANTITY, parseInt(group.maxParticipants, 10) || 10));
    out._contactPerson = { _addons: addonMap(r._contactPerson?._addons, 'per_person') };
    out._participants = (Array.isArray(r._participants) ? r._participants : []).slice(0, maxP - 1)
      .map((p) => ({ _addons: addonMap(p?._addons, 'per_person') }));
  } else {
    out._addons = addonMap(r._addons, 'per_person');
  }
  out._registrationAddons = addonMap(r._registrationAddons, 'per_registration');
  return out;
}

// Dowolna kwota (np. darowizna) — tylko gdy formularz na to wprost pozwala.
export function customAmountRange(settings) {
  const c = settings?.pricing?.customAmount;
  if (!c || c.enabled !== true) return null;
  const min = Math.max(0, num(c.min));
  const max = num(c.max) > 0 ? num(c.max) : null;
  return { min, max };
}

// Kwota płatności w groszach z definicji formularza i odpowiedzi.
//   → { amount, currency, breakdown, custom } albo { error } (kod błędu)
// clientAmount (grosze) liczy się wyłącznie przy settings.pricing.customAmount.enabled —
// wtedy w [max(min, cena z cennika), max].
export function formPaymentAmount(form, rawAnswers, { today, clientAmount, maxGrosze = 10_000_000 } = {}) {
  const fields = Array.isArray(form?.fields) ? form.fields : [];
  const settings = isObj(form?.settings) ? form.settings : {};
  const currency = String(settings.pricing?.currency || 'PLN').toUpperCase();
  const breakdown = calculatePriceBreakdown(fields, sanitizePricingAnswers(fields, settings, rawAnswers), settings, { today });
  const priced = Math.round(breakdown.grandTotal * 100);
  const range = customAmountRange(settings);
  if (range) {
    const want = Number(clientAmount);
    if (!Number.isSafeInteger(want)) return { error: 'invalid_amount' };
    const lo = Math.max(100, Math.round(range.min * 100), priced);
    const hi = Math.min(maxGrosze, range.max != null ? Math.round(range.max * 100) : maxGrosze);
    if (want < lo || want > hi) return { error: 'amount_out_of_range', min: lo, max: hi };
    return { amount: want, currency, breakdown, custom: true };
  }
  if (!Number.isSafeInteger(priced) || priced < 100) return { error: 'nothing_to_pay' };
  if (priced > maxGrosze) return { error: 'amount_too_high' };
  return { amount: priced, currency, breakdown, custom: false };
}
