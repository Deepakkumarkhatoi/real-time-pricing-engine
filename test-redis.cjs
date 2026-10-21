
const { createClient } = require("redis");

async function main() {
  const client = createClient({
    url: "redis://127.0.0.1:6379"
  });

  client.on("error", (err) => {
    console.error("Redis error:", err.message);
  });

  await client.connect();

  console.log("Connection test:", await client.ping());

  await client.set("price:EURUSD", "1.0853");

  const price = await client.get("price:EURUSD");

  console.log("Retrieved price:", price);

  await client.quit();
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exitCode = 1;
});
