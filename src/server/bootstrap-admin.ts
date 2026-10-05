import {
  DEFAULT_AUTOMATION,
  DEFAULT_COMMERCIAL,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_ORGANIZATION,
  INITIAL_EVENT_TYPES,
  INITIAL_INVENTORY_CATEGORIES,
  INITIAL_LOST_REASONS,
  INITIAL_PAYMENT_METHODS,
  INITIAL_SOURCES,
  INITIAL_VENDOR_CATEGORIES,
} from "../domain/settings";
import { slugify } from "../domain/operations";
import { hashPassword } from "./auth";
import { connectDB, disconnectDB } from "./db";
import {
  EventType,
  InventoryCategory,
  LeadSource,
  LostReason,
  PaymentMethod,
  ServiceItem,
  Space,
  SystemSetting,
  User,
  VendorCategory,
} from "./models";

const ADMIN_EMAIL = "kelvin@theburnsbrothers.com";

async function catalog(model: typeof EventType, names: string[]) {
  for (const [index, name] of names.entries()) {
    const slug = slugify(name);
    await model.updateOne({ slug }, { $setOnInsert: { name, slug, sort: index, active: true } }, { upsert: true });
  }
}

async function ensureConfiguration() {
  const settings = [
    ["organization", { ...DEFAULT_ORGANIZATION, name: "HQ", legalName: "HQ Nairobi", city: "Nairobi" }],
    ["commercial", DEFAULT_COMMERCIAL],
    ["automation", DEFAULT_AUTOMATION],
    ["notifications", DEFAULT_NOTIFICATIONS],
    ["assignment", { defaultOwnerId: null }],
  ] as const;
  for (const [key, value] of settings) {
    await SystemSetting.updateOne({ key }, { $setOnInsert: { key, value } }, { upsert: true });
  }
  await catalog(EventType, INITIAL_EVENT_TYPES);
  await catalog(LeadSource, INITIAL_SOURCES);
  await catalog(LostReason, INITIAL_LOST_REASONS);
  await catalog(InventoryCategory, INITIAL_INVENTORY_CATEGORIES);
  await catalog(VendorCategory, INITIAL_VENDOR_CATEGORIES);
  await catalog(PaymentMethod, INITIAL_PAYMENT_METHODS);
  if ((await Space.countDocuments()) === 0) {
    for (const space of [
      ["The Courtyard", 80, "Open-air evening space"],
      ["The Gallery", 40, "Indoor room for dinners and launches"],
      ["The Library", 16, "Boardroom-style room"],
      ["The Terrace", 60, "Covered terrace"],
    ] as const) {
      await Space.create({ name: space[0], slug: slugify(space[0]), capacity: space[1], description: space[2], active: true, setupNotes: "Confirm layout the day before.", capabilities: ["banquet", "cocktail"] });
    }
  }
  if ((await ServiceItem.countDocuments()) === 0) {
    for (const [name, price] of [
      ["Venue hire — Courtyard", 120000],
      ["Venue hire — Gallery", 85000],
      ["Additional hour", 15000],
      ["Coffee and tea service", 800],
      ["Welcome pastries", 600],
    ] as const) {
      await ServiceItem.create({
        name,
        code: slugify(name),
        unitPriceCents: price * 100,
        unit: "event",
        category: "Hospitality",
        active: true,
        description: "Catalogue price. Change it on the quotation for the actual event.",
      });
    }
  }
}

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
  }
  await connectDB();
  await ensureConfiguration();
  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    existing.name = existing.name || "Kelvin";
    existing.role = "super_admin";
    existing.active = true;
    existing.archivedAt = null;
    await existing.save();
    console.log(`Updated ${ADMIN_EMAIL} to Super Admin. The existing password was left in place.`);
  } else {
    await User.create({
      name: "Kelvin",
      email: ADMIN_EMAIL,
      phone: "",
      role: "super_admin",
      active: true,
      passwordHash: await hashPassword(password),
    });
    console.log(`Created Super Admin ${ADMIN_EMAIL}.`);
  }
  await disconnectDB();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
