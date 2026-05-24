async function run() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        products: [{ name: "test", currentPrice: 10 }],
        invoices: [{ date: "2025-05-01", store: "Sup 1", total: 100 }, { date: "2025-05-02", store: "Sup 2", total: 400 }]
      })
    });
    console.log(res.status);
    console.log(await res.text());
  } catch (err) {
    console.error(err);
  }
}
run();
