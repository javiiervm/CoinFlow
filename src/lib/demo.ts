import type { Piggybank, Transaction } from "./models";

// Preview-only example records. No financial data is stored or synced in demo mode.
const today = new Date();
function date(monthOffset: number, day: number): string {
  const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, day);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

export const demoPiggybanks: Piggybank[] = [
  { id: "demo-b1", user_id: "demo", name: "Viaje a Japón", type: "savings", goal: 3500, currency: "EUR" },
  { id: "demo-b2", user_id: "demo", name: "Gastos del mes", type: "budget", goal: 700, currency: "EUR" },
  { id: "demo-b3", user_id: "demo", name: "Nuevo ordenador", type: "savings", goal: 1800, currency: "EUR" }
];

const rows: Array<[string, "income" | "expense", number, number, number, string, string | null, "EUR" | "USD"]> = [
  ["Nómina", "income", 2450, 0, 2, "Trabajo", null, "EUR"],
  ["Alquiler", "expense", 690, 0, 3, "Vivienda", null, "EUR"],
  ["Supermercado", "expense", 92.45, 0, 6, "Alimentación", null, "EUR"],
  ["Café y desayuno", "expense", 12.8, 0, 7, "Restauración", null, "EUR"],
  ["Ahorro para Japón", "income", 450, 0, 4, "Ahorro", "demo-b1", "EUR"],
  ["Presupuesto mensual", "income", 310, 0, 2, "Presupuesto", "demo-b2", "EUR"],
  ["Comida del sábado", "expense", 54, 0, 5, "Restauración", "demo-b2", "EUR"],
  ["Ahorro para PC", "income", 620, 0, 3, "Ahorro", "demo-b3", "EUR"],
  ["Nómina", "income", 2370, -1, 2, "Trabajo", null, "EUR"],
  ["Transporte", "expense", 65, -1, 9, "Transporte", null, "EUR"],
  ["Nómina", "income", 2400, -2, 2, "Trabajo", null, "EUR"],
  ["Compras", "expense", 390, -2, 13, "Compras", null, "EUR"],
  ["Nómina", "income", 2280, -3, 2, "Trabajo", null, "EUR"],
  ["Ocio", "expense", 245, -3, 21, "Ocio", null, "EUR"],
  ["Nómina", "income", 2310, -4, 2, "Trabajo", null, "EUR"],
  ["Comida", "expense", 320, -4, 17, "Alimentación", null, "EUR"],
  ["Nómina", "income", 2200, -5, 2, "Trabajo", null, "EUR"],
  ["Compras", "expense", 275, -5, 14, "Compras", null, "EUR"],
  ["Proyecto freelance", "income", 310, 0, 6, "Trabajo", null, "USD"]
];

export const demoTransactions: Transaction[] = rows.map((row, index) => ({
  id: "demo-t" + index, user_id: "demo", concept: row[0], type: row[1],
  amount: row[2], occurred_on: date(row[3], row[4]), category: row[5],
  piggybank_id: row[6], currency: row[7], external: false
}));
