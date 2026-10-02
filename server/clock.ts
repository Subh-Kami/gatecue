// Server clock. For filming, GATECUE_DEMO_NOW pins "now" to a scenario time and
// GATECUE_DEMO_SPEEDUP makes it run faster. Not part of any tool schema.
let startReal = Date.now();
// Demo only: lets the simulator move the scenario clock between scenes while filming.
export function setDemoNow(iso: string): boolean {
  if (!process.env.GATECUE_DEMO_NOW || isNaN(new Date(iso).getTime())) return false;
  process.env.GATECUE_DEMO_NOW = iso; startReal = Date.now(); return true;
}
export function now(): Date {
  const pinned = process.env.GATECUE_DEMO_NOW;
  if (!pinned) return new Date();
  const speed = Math.max(1, Number(process.env.GATECUE_DEMO_SPEEDUP ?? 1));
  return new Date(new Date(pinned).getTime() + (Date.now() - startReal) * speed);
}
export function speedup(): number {
  return process.env.GATECUE_DEMO_NOW ? Math.max(1, Number(process.env.GATECUE_DEMO_SPEEDUP ?? 1)) : 1;
}
