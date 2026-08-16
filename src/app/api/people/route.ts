import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { addPerson, listPeople } from "@/lib/peopleStore";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const people = await listPeople();
  return NextResponse.json({ people });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { name, className, rollNo } = body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const person = await addPerson({
    name: name.trim(),
    className: (className ?? "").trim(),
    rollNo: (rollNo ?? "").trim(),
  });
  return NextResponse.json({ person }, { status: 201 });
}
