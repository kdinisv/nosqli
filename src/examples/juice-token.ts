import { request } from "undici";

async function main() {
  const baseUrl = process.env.JUICE_URL || "http://localhost:3000";
  const email = process.env.JUICE_EMAIL || "admin@juice-sh.op";
  const password = process.env.JUICE_PASSWORD || "admin123";
  const res = await request(`${baseUrl}/rest/user/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.body.text();
  try {
    const j = JSON.parse(text);
    // Try common fields
    const token =
      (j && (j.authentication?.token || j.token || j.authentication)) ||
      Object.values(j).find(
        (v) => typeof v === "string" && v.split(".").length === 3
      );
    if (typeof token === "string") {
      console.log(token);
      return;
    }
  } catch {
    // ignore
  }
  console.error("Failed to obtain token: " + text);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
