import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQS = [
  {
    q: "Can I order through WhatsApp?",
    a: "Yes! Send us a message on WhatsApp with your product list and address. We'll confirm availability, share the total, and accept UPI or COD.",
  },
  {
    q: "How long does delivery take?",
    a: "Hyderabad local orders are delivered in 1–2 days. Pan-India orders typically take 3–5 business days via Delhivery or BlueDart.",
  },
  {
    q: "Do you accept returns?",
    a: "We accept returns on sealed, unopened items within 7 days. Opened consumables (paints, glues, resins) are non-returnable. Damaged-in-transit items get a full replacement.",
  },
  {
    q: "Is there a minimum for bulk orders?",
    a: "For bulk / school orders, we typically start from 20 units of the same product. Use the bulk enquiry form or WhatsApp us for custom pricing.",
  },
  {
    q: "What payment methods do you accept?",
    a: "UPI (all apps), credit/debit cards, net banking, wallets, and Cash on Delivery. All payments are processed securely via Razorpay.",
  },
  {
    q: "Can you pack craft kits for events?",
    a: "Absolutely. We pack individual activity kits for schools, birthday parties, and corporate workshops. Share your requirements via the bulk enquiry form.",
  },
];

export function FaqSection() {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Help before checkout</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-fraunces, serif)" }}>
          Common questions
        </h2>
      </div>
      <Accordion type="single" collapsible className="space-y-2">
        {FAQS.map((faq, i) => (
          <AccordionItem
            key={i}
            value={`faq-${i}`}
            className="border border-border rounded-xl px-5 data-[state=open]:border-primary/40 data-[state=open]:bg-accent/20 transition-all"
          >
            <AccordionTrigger className="text-sm font-semibold text-foreground py-4 hover:no-underline text-left">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
