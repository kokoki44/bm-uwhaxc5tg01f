// Setzt den Hash der Katalogdatei neu. Nur nach bewusstem Austausch von fahrzeugkatalog.xlsx ausführen.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const hash = createHash("sha256").update(readFileSync("fahrzeugkatalog.xlsx")).digest("hex");
writeFileSync("fahrzeugkatalog.sha256", hash + "\n");
console.log("Neuer Hash gesetzt:", hash);
