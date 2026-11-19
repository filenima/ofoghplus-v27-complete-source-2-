// بررسی اینکه سرور dev با کدام DB کار می‌کند — از طریق API
const res = await fetch("http://localhost:3000/api/health");
console.log("health:", res.status);
const j = await res.json().catch(() => ({}));
console.log(JSON.stringify(j).slice(0, 300));
