import type { ClientSession } from "mongoose";
import { formatReference } from "../domain/operations";
import { sessionOptions } from "./db";
import { Counter } from "./models";

export async function nextReference(prefix: string, session?: ClientSession | null, at = new Date()) {
  const year = at.getUTCFullYear();
  const key = `${prefix}-${year}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, ...sessionOptions(session) },
  );
  return formatReference(prefix, year, counter.seq);
}
