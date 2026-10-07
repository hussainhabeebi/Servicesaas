/** Business-provided rates and brochure-supported services. No ratings, credentials or opening hours are assumed. */
export const DANFE_CONTENT = {
  businessName: "Our Danfe Cleaning Company",
  heroText: "Hourly cleaning in Sharjah, UAE. AED 25 per hour, or AED 35 per hour with cleaning materials. Tell us what your space needs and book your visit online.",
  phone: "+971562145676",
  address: "Sharjah, UAE",
  logoUrl: "/brand/danfe-logo.jpeg",
  gallery: ["/brand/danfe-brochure.jpeg"],
  design: "danfe" as const,
  languages: ["en" as const],
};
export const DANFE_SERVICES = [
  { name: "Normal Hourly Cleaning", price: 25, duration_minutes: 60, category: "Cleaning", description: "Hourly cleaning in Sharjah at AED 25 per hour. Supply your own cleaning materials and discuss your home or office requirements with our team." },
  { name: "Hourly Cleaning with Materials", price: 35, duration_minutes: 60, category: "Cleaning", description: "Hourly cleaning in Sharjah at AED 35 per hour with cleaning materials. Contact our team to confirm the materials needed for your space." },
];
export const DANFE_PAGES = [
  { path: "/services/hourly-cleaning", title: "Hourly Cleaning in Sharjah | Our Danfe", heading: "Hourly cleaning in Sharjah", description: "Book Our Danfe hourly cleaning in Sharjah at AED 25 per hour. Online booking, saved addresses, visit tracking and customer account access.", paragraphs: ["Plan your cleaning around your day. Our Danfe offers normal hourly cleaning in Sharjah at AED 25 per hour, with your own cleaning materials.", "Tell the team whether the visit is for a home, apartment or office, and share the rooms and tasks you want prioritised. The service catalogue shows the bookable visit duration; contact the team to arrange longer visits or contractual cleaning.", "Book online, save your address in your customer account and follow your visit status. You can also contact the team on WhatsApp to discuss your requirements before booking."] },
  { path: "/services/cleaning-with-materials", title: "Cleaning with Materials in Sharjah | Our Danfe", heading: "Cleaning with materials in Sharjah", description: "Our Danfe cleaning with materials is AED 35 per hour in Sharjah. Discuss your cleaning requirements, request an estimate and book online.", paragraphs: ["Choose cleaning with materials at AED 35 per hour when you need the team to supply cleaning materials for the visit.", "Share any surface-care instructions, preferences and cleaning priorities with the team. Confirm the materials needed for your space before the visit.", "Use your customer account to manage bookings, view published invoices and arrange payment. The catalogue price is shown before booking; applicable VAT and any configured deposit appear on the invoice."] },
  { path: "/services/technical-services", title: "Technical & Maintenance Services in Sharjah | Our Danfe", heading: "Technical services in Sharjah", description: "Contact Our Danfe for AC, ventilation, plumbing, electrical, painting, partitions and maintenance enquiries in Sharjah, UAE. Request a tailored quotation.", paragraphs: ["Our Danfe's supplied technical services brochure lists air-conditioning, ventilation and air-filtration system installation and maintenance; plaster, floor and wall tiling and painting; false ceilings and light partitions; electrical fittings and fixtures; electromechanical equipment; plumbing and sanitary installation; and swimming pool installation and refurbishment.", "These jobs need a separate assessment and quotation. The AED 25 and AED 35 hourly prices apply to the cleaning services, not technical installation or maintenance work.", "Send the team your location, a description of the issue and relevant photos on WhatsApp. Discuss the scope, scheduling and quotation before confirming technical work."] },
];
export const DANFE_FAQ = [
  { question: "What is the normal hourly cleaning rate?", answer: "The normal hourly cleaning rate is AED 25 per hour. Cleaning with materials is AED 35 per hour. Applicable VAT and configured deposits are shown on your invoice." },
  { question: "Where is Our Danfe based?", answer: "Our Danfe is based in Sharjah, UAE. Contact the team to confirm service coverage for your address before booking." },
  { question: "Can I manage my booking online?", answer: "Yes. Ask the business for a secure customer account invitation, then sign in to manage visits, view invoices, submit reviews and save addresses. Guest booking is also available." },
  { question: "Are technical services charged at the cleaning hourly rate?", answer: "No. AC, electrical, plumbing, installation and other technical jobs require a separate scope assessment and quotation." },
];
