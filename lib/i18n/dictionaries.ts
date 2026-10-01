import type { Locale } from "./config";
import { fr, type Messages } from "./messages/fr";
import { en } from "./messages/en";

export const dictionaries: Record<Locale, Messages> = { fr, en };
