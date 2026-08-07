/**
 * Sensible per-vertical defaults so a new signup starts with real data
 * instead of blank forms (spec §11 — "pre-built vertical templates").
 * Prices are indicative AED starting points; tenants edit freely after signup.
 */
export interface DefaultService {
  name: string;
  category: string;
  duration_minutes: number;
  price: number;
}

export const VERTICALS = [
  "cleaning",
  "salon",
  "repair",
  "tutoring",
  "pet_care",
  "fitness",
  "spa_laundry",
  "generic",
] as const;
export type Vertical = (typeof VERTICALS)[number];

export const VERTICAL_DEFAULT_SERVICES: Record<Vertical, DefaultService[]> = {
  cleaning: [
    { name: "Standard Home Cleaning", category: "Cleaning", duration_minutes: 120, price: 150 },
    { name: "Deep Cleaning", category: "Cleaning", duration_minutes: 240, price: 350 },
    { name: "Move-out Cleaning", category: "Cleaning", duration_minutes: 300, price: 450 },
  ],
  salon: [
    { name: "Haircut", category: "Hair", duration_minutes: 45, price: 80 },
    { name: "Hair Color", category: "Hair", duration_minutes: 120, price: 250 },
    { name: "Manicure", category: "Nails", duration_minutes: 45, price: 60 },
  ],
  repair: [
    { name: "AC Service", category: "HVAC", duration_minutes: 60, price: 120 },
    { name: "Plumbing Callout", category: "Plumbing", duration_minutes: 60, price: 100 },
    { name: "Electrical Repair", category: "Electrical", duration_minutes: 60, price: 130 },
  ],
  tutoring: [
    { name: "1:1 Session (60 min)", category: "Tutoring", duration_minutes: 60, price: 100 },
    { name: "Group Session (90 min)", category: "Tutoring", duration_minutes: 90, price: 150 },
  ],
  pet_care: [
    { name: "Dog Grooming", category: "Grooming", duration_minutes: 60, price: 120 },
    { name: "Cat Grooming", category: "Grooming", duration_minutes: 45, price: 100 },
    { name: "Pet Sitting (per visit)", category: "Sitting", duration_minutes: 30, price: 50 },
  ],
  fitness: [
    { name: "Personal Training Session", category: "Training", duration_minutes: 60, price: 150 },
    { name: "Group Class", category: "Training", duration_minutes: 45, price: 60 },
  ],
  spa_laundry: [
    { name: "Massage (60 min)", category: "Spa", duration_minutes: 60, price: 200 },
    { name: "Wash & Fold (per bag)", category: "Laundry", duration_minutes: 30, price: 40 },
    { name: "Dry Cleaning (per item)", category: "Laundry", duration_minutes: 15, price: 20 },
  ],
  generic: [{ name: "Standard Service", category: "General", duration_minutes: 60, price: 100 }],
};

export function isVertical(value: string): value is Vertical {
  return (VERTICALS as readonly string[]).includes(value);
}
