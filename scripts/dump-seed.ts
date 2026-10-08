// Prints the starting catalog as JSON (used by the SQL tests).
import { seedCatalog } from '../src/core'

console.log(JSON.stringify(seedCatalog()))
