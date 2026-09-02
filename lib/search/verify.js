const norm=s=>String(s||'').trim().toLowerCase();
export function verifyEnrichment({enrichment=[],evidence=[]}={}){
 const claims=Array.isArray(enrichment)?enrichment:enrichment.claims||[];
 const accepted=[],rejected=[];
 for(const claim of claims){const text=typeof claim==='string'?claim:claim.claim||claim.text||'';const matches=evidence.filter(e=>{const a=norm(e.claim),b=norm(text);return a&&b&&(a.includes(b)||b.includes(a));});if(matches.length)accepted.push({...((typeof claim==='object'&&claim)||{}),claim:text,evidence:matches});else rejected.push({...((typeof claim==='object'&&claim)||{}),claim:text});}
 const confidence=accepted.length?accepted.reduce((n,c)=>n+Math.max(...c.evidence.map(e=>Number(e.confidence)||0)),0)/accepted.length:0;
 return {accepted,rejected,confidence:+confidence.toFixed(3)};
}
