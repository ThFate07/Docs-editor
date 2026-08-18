"use client";

import type { Person } from "./docxHeader";

const STORAGE_KEY = "exp-doc-app.people.v1";
const listeners = new Set<() => void>();
const EMPTY_PEOPLE_SNAPSHOT: Person[] = [];
let cachedRaw: string | null | undefined;
let cachedPeople: Person[] = [];

type PersonInput = Omit<Person, "id">;

function cleanPerson(input: PersonInput): PersonInput {
  return {
    name: input.name.trim(),
    className: input.className.trim(),
    rollNo: input.rollNo.trim(),
  };
}

function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const person = value as Record<string, unknown>;
  return (
    typeof person.id === "string" &&
    typeof person.name === "string" &&
    typeof person.className === "string" &&
    typeof person.rollNo === "string"
  );
}

function newPersonId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function listBrowserPeople(): Person[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedPeople;
    cachedRaw = raw;
    if (!raw) {
      cachedPeople = [];
      return cachedPeople;
    }
    const parsed = JSON.parse(raw);
    cachedPeople = Array.isArray(parsed) ? parsed.filter(isPerson) : [];
    return cachedPeople;
  } catch {
    cachedPeople = [];
    return cachedPeople;
  }
}

export function saveBrowserPeople(people: Person[]): void {
  const raw = JSON.stringify(people);
  cachedRaw = raw;
  cachedPeople = people;
  window.localStorage.setItem(STORAGE_KEY, raw);
  for (const listener of listeners) listener();
}

export function addBrowserPerson(people: Person[], input: PersonInput): Person[] {
  const person: Person = { id: newPersonId(), ...cleanPerson(input) };
  return [...people, person];
}

export function updateBrowserPerson(people: Person[], id: string, input: PersonInput): Person[] {
  const cleaned = cleanPerson(input);
  return people.map((person) => (person.id === id ? { id, ...cleaned } : person));
}

export function deleteBrowserPerson(people: Person[], id: string): Person[] {
  return people.filter((person) => person.id !== id);
}

export function subscribeToBrowserPeople(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) listener();
  }

  listeners.add(listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function emptyBrowserPeopleSnapshot(): Person[] {
  return EMPTY_PEOPLE_SNAPSHOT;
}
