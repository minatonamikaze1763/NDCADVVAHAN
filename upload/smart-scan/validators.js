export function validPan(value) { return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(value || "").replace(/\s/g, "").toUpperCase()); }
export function validChassis(value) { return /^[A-Z0-9]{17}$/.test(String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase()); }
export function validPin(value) { return /^[1-9][0-9]{5}$/.test(String(value || "").replace(/\D/g, "")); }
export function validMobile(value) { return /^[6-9][0-9]{9}$/.test(String(value || "").replace(/\D/g, "")); }
export function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()); }
export function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false; const d = new Date(value + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; }
export function validAmount(value) { const n=Number(String(value || "").replace(/[₹,\s]/g, "")); return Number.isFinite(n) && n >= 0; }
const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function validAadhaar(value) { const digits = String(value || "").replace(/\D/g, ""); if (!/^\d{12}$/.test(digits)) return false; let c = 0; const a = digits.split("").reverse().map(Number); for (let i = 0; i < a.length; i++) c = d[c][p[i % 8][a[i]]]; return c === 0; }
export function validate(field, value) {
  const v = String(value || "").trim();
  const fn = ({panNumber:validPan,chassisNumber:validChassis,pincode:validPin,mobileNumber:validMobile,email:validEmail,aadhaarNumber:validAadhaar})[field];
  if (!v || !fn) return {valid:!!v, status:v ? "review" : "empty"};
  return {valid:fn(v), status:fn(v) ? "valid" : "invalid"};
}
