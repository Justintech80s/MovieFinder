export function buildSearchPlan(intent={}){
 const raw=String(intent.raw||'').toLowerCase(),steps=[];
 const person=Boolean(intent.person||intent.personName||intent.people?.length);
 const relationship=Boolean(intent.concepts?.length)||/(influenc|similar|like |movement|style|theme|directed by|starring)/.test(raw);
 if(person){steps.push({tool:'personSearch'});steps.push({tool:'filmography'});}
 if(relationship)steps.push({tool:'cinemaGraph'});
 if(!steps.length)steps.push({tool:'baselineSearch'});
 const needsAvailability=Boolean(intent.streaming||intent.availability||/(stream|watch|available on)/.test(raw));
 if(needsAvailability)steps.push({tool:'availability'});
 return {steps,constraints:intent.constraints||{},needsAvailability,allowAI:intent.allowAI!==false};
}
