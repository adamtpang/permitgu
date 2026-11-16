// Every date on the site is shown in Guam time. The server runs in UTC and visitors
// may be anywhere, so a date left to the default would land on the wrong day.

const GUAM = "Pacific/Guam";

export function guamDate(value: Date | string) {
  return new Date(value).toLocaleDateString("en-US", { timeZone: GUAM, month: "long", day: "numeric", year: "numeric" });
}

export function guamDateTime(value: Date | string) {
  return new Date(value).toLocaleString("en-US", { timeZone: GUAM, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function guamStamp(value: Date | string) {
  return `${new Date(value).toLocaleString("en-US", { timeZone: GUAM, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} ChST`;
}
