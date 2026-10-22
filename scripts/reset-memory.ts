// Resets the demo traveller's memory (profile, preferences, trips) to the seeded state, in DynamoDB when GC_AWS=1.
import { resetMemory, getTrips, memorySource } from "../server/memory.js";
await resetMemory();
const trips = await getTrips();
console.log(`Memory reset (${memorySource()}): ${trips.map((t) => `${t.flight.number} for ${t.goalPlace}`).join(", ")}`);
