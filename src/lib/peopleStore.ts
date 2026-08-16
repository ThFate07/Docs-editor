import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Person } from "./docxHeader";

/**
 * Local-filesystem-backed store for the people list.
 *
 * This is intentionally isolated behind a small interface so it can be
 * swapped for Vercel Postgres / Vercel KV in production without touching
 * any calling code — see README "Deploying to Vercel" for the swap.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const PEOPLE_FILE = path.join(DATA_DIR, "people.json");

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(PEOPLE_FILE);
  } catch {
    await fs.writeFile(PEOPLE_FILE, "[]", "utf-8");
  }
}

export async function listPeople(): Promise<Person[]> {
  await ensureFile();
  const raw = await fs.readFile(PEOPLE_FILE, "utf-8");
  try {
    return JSON.parse(raw) as Person[];
  } catch {
    return [];
  }
}

export async function savePeople(people: Person[]): Promise<void> {
  await ensureFile();
  await fs.writeFile(PEOPLE_FILE, JSON.stringify(people, null, 2), "utf-8");
}

export async function addPerson(input: Omit<Person, "id">): Promise<Person> {
  const people = await listPeople();
  const person: Person = { id: randomUUID(), ...input };
  people.push(person);
  await savePeople(people);
  return person;
}

export async function updatePerson(id: string, input: Omit<Person, "id">): Promise<Person | null> {
  const people = await listPeople();
  const idx = people.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  people[idx] = { id, ...input };
  await savePeople(people);
  return people[idx];
}

export async function deletePerson(id: string): Promise<boolean> {
  const people = await listPeople();
  const next = people.filter((p) => p.id !== id);
  await savePeople(next);
  return next.length !== people.length;
}
