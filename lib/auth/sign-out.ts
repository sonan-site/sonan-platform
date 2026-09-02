"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";

export async function signOut(): Promise<void> {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/sign-in");
}
