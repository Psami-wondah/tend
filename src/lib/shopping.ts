import { generateObject } from "ai";
import { z } from "zod";
import { aiConfigured, model } from "./agent/model";
import { toMinor } from "./money";

/**
 * "Find Mum a shower chair under $60."
 *
 * Tend searches real retailers through Channel3's product API, picks the
 * best in-stock offer within budget, and *proposes* the purchase. Buying is
 * an ordinary payment intent: it goes through the family's mandate
 * (equipment always asks), the shop must be a payee the family has verified,
 * and PayPal pays it. The agent shops; it doesn't spend on its own.
 *
 * Without CHANNEL3_API_KEY, a small sample catalogue (clearly labelled)
 * stands in so the flow can be tried.
 */

export interface Offer {
  domain: string;
  url: string | null;
  priceMinor: number;
  currency: string;
  inStock: boolean;
}
export interface Product {
  id: string;
  title: string;
  brand: string | null;
  image: string | null;
  offers: Offer[];
}
export interface ShopResult {
  source: "channel3" | "sample";
  query: string;
  products: (Product & { best: Offer })[];
  pick: { productId: string; why: string } | null;
}

export const channel3Configured = () => Boolean(process.env.CHANNEL3_API_KEY);

type C3Product = {
  id: string;
  title: string;
  brands?: { name?: string }[];
  images?: { url?: string; is_main_image?: boolean }[];
  offers?: { url?: string; domain?: string; availability?: string; price?: { price?: number; currency?: string } }[];
};

async function searchChannel3(query: string, maxPrice: number | null, limit = 8): Promise<Product[]> {
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: { "x-api-key": process.env.CHANNEL3_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit,
      filters: { availability: ["InStock"], ...(maxPrice ? { price: { max_price: maxPrice } } : {}) },
    }),
  });
  if (!res.ok) throw new Error(`Channel3 search failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { products?: C3Product[] };
  return (json.products ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    brand: p.brands?.[0]?.name ?? null,
    image: (p.images?.find((i) => i.is_main_image) ?? p.images?.[0])?.url ?? null,
    offers: (p.offers ?? [])
      .filter((o) => typeof o.price?.price === "number" && o.domain)
      .map((o) => ({
        domain: o.domain!,
        url: o.url ?? null,
        priceMinor: toMinor(o.price!.price!),
        currency: (o.price!.currency ?? "USD").toUpperCase(),
        inStock: !o.availability || /instock|in_stock/i.test(o.availability),
      })),
  }));
}

/** Demo-mode stand-in. Made-up products at made-up shops; labelled in the UI. */
const SAMPLE: Product[] = [
  { id: "s-chair", title: "Folding shower chair with backrest", brand: "Sample", image: null, offers: [{ domain: "carestore.example", url: null, priceMinor: 3_999, currency: "USD", inStock: true }, { domain: "homehealth.example", url: null, priceMinor: 4_650, currency: "USD", inStock: true }] },
  { id: "s-stool", title: "Adjustable bath stool, non-slip feet", brand: "Sample", image: null, offers: [{ domain: "homehealth.example", url: null, priceMinor: 2_799, currency: "USD", inStock: true }] },
  { id: "s-bench", title: "Tub transfer bench", brand: "Sample", image: null, offers: [{ domain: "carestore.example", url: null, priceMinor: 6_499, currency: "USD", inStock: true }] },
  { id: "s-pills", title: "Weekly pill organiser with large lids", brand: "Sample", image: null, offers: [{ domain: "carestore.example", url: null, priceMinor: 1_250, currency: "USD", inStock: true }] },
  { id: "s-alarm", title: "Pill reminder with alarm and lights", brand: "Sample", image: null, offers: [{ domain: "homehealth.example", url: null, priceMinor: 2_899, currency: "USD", inStock: true }] },
  { id: "s-rail", title: "Bed assist rail with storage pocket", brand: "Sample", image: null, offers: [{ domain: "carestore.example", url: null, priceMinor: 5_499, currency: "USD", inStock: false }, { domain: "homehealth.example", url: null, priceMinor: 5_900, currency: "USD", inStock: true }] },
  { id: "s-grab", title: "Suction grab bar for the bathroom", brand: "Sample", image: null, offers: [{ domain: "homehealth.example", url: null, priceMinor: 2_299, currency: "USD", inStock: true }] },
  { id: "s-reacher", title: "Long reacher grabber, 32 inch", brand: "Sample", image: null, offers: [{ domain: "carestore.example", url: null, priceMinor: 1_499, currency: "USD", inStock: true }] },
];

const SYNONYMS: Record<string, string[]> = {
  shower: ["bath", "tub"],
  chair: ["stool", "bench"],
  pill: ["pills", "organiser", "reminder"],
  medicine: ["pill", "organiser", "reminder"],
  rail: ["bar", "grab"],
  grab: ["rail", "bar", "reacher"],
};

function searchSample(query: string, maxPrice: number | null): Product[] {
  const base = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const words = [...base, ...base.flatMap((w) => SYNONYMS[w.replace(/s$/, "")] ?? [])];
  return SAMPLE.map((p) => ({ p, score: words.filter((w) => p.title.toLowerCase().includes(w.replace(/s$/, ""))).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
    .filter((p) => maxPrice === null || p.offers.some((o) => o.priceMinor <= maxPrice * 100));
}

export function bestOffer(p: Product, maxMinor: number | null, currency: string): Offer | null {
  const ok = p.offers.filter((o) => o.inStock && o.currency === currency && (maxMinor === null || o.priceMinor <= maxMinor));
  return ok.sort((a, b) => a.priceMinor - b.priceMinor)[0] ?? null;
}

export async function shopFor(need: string, maxPrice: number | null, currency: string, mumNotes = ""): Promise<ShopResult> {
  const source = channel3Configured() ? "channel3" : "sample";
  const found = source === "channel3" ? await searchChannel3(need, maxPrice) : searchSample(need, maxPrice);
  const maxMinor = maxPrice === null ? null : Math.round(maxPrice * 100);
  const products = found
    .map((p) => ({ ...p, best: bestOffer(p, maxMinor, currency) }))
    .filter((p): p is Product & { best: Offer } => p.best !== null)
    .slice(0, 3);
  if (!products.length) return { source, query: need, products, pick: null };

  let pick: ShopResult["pick"];
  if (aiConfigured() && products.length > 1) {
    const { object } = await generateObject({
      model: model(),
      schema: z.object({ productId: z.enum(products.map((p) => p.id) as [string, ...string[]]), why: z.string().describe("One short sentence for the family.") }),
      system:
        "You help a family buy care supplies for their elderly mother. Pick the option that best fits the need for safety and value. Never give medical advice; if the need sounds medical, pick the plainest option and say a professional should advise.",
      prompt: `Need: ${need}${maxPrice ? ` (budget $${maxPrice})` : ""}. ${mumNotes}\nOptions:\n${products
        .map((p) => `${p.id}: ${p.title}${p.brand ? ` by ${p.brand}` : ""}, $${(p.best.priceMinor / 100).toFixed(2)} at ${p.best.domain}`)
        .join("\n")}`,
    });
    pick = object;
  } else {
    // Results arrive best match first; without a model, trust that order.
    pick = { productId: products[0].id, why: "The closest match to what you asked for, in stock and within budget." };
  }
  return { source, query: need, products, pick };
}
