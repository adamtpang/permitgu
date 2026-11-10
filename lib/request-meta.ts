import "server-only";
import { headers } from "next/headers";

export async function requestMeta() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || headerList.get("x-real-ip") || null;
  return { ip, userAgent: headerList.get("user-agent") };
}
