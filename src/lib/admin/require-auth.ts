import "server-only";
import { headers } from "next/headers";
import { isAuthorized } from "./auth";

/** Actions are independently reachable POST endpoints: proxy is not enough. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAuthorized((await headers()).get("authorization")))) {
    throw new Error("Admin access required.");
  }
}
