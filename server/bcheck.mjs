import fs from 'fs';
import { bearingDeg, haversineKm } from './src/geo.js';
const db = JSON.parse(fs.readFileSync('./db.json','utf8'));
const office = db.office;
const s1 = db.employees.filter(e=>e.shiftId==='S1' && e.addressValid);
for (const e of s1) {
  console.log(e.name.padEnd(12), e.gender, 'bearing=', bearingDeg(office,e).toFixed(1).padStart(6), 'dist=', haversineKm(office,e).toFixed(2));
}
