import {time} from './view-utils.mjs';

/** World time remains absolute minutes; a clock input carries its day separately. */
export function caseClock(minutes){return {clock:time(minutes),day:Math.floor(minutes/1440)+1};}
export function readCaseClock(clock,day=1){
 if(typeof clock!=='string'||!/^\d{2}:\d{2}$/.test(clock))throw new Error('Použij čas HH:MM.');
 const [h,m]=clock.split(':').map(Number),d=Number(day);
 if(h>23||m>59||!Number.isInteger(d)||d<1||d>77)throw new Error('Zadej platný čas a den návštěvy.');
 return (d-1)*1440+h*60+m;
}
export function caseTime(minutes,multiDay=false){const c=caseClock(minutes);return multiDay?`Den ${c.day} · ${c.clock}`:c.clock;}
