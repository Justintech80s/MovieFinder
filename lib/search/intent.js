const SERVICES = [
  ['netflix','Netflix'],['hulu','Hulu'],['max','Max'],['hbo max','Max'],['prime video','Prime Video'],['amazon prime','Prime Video'],['disney+','Disney+'],['disney plus','Disney+'],['apple tv+','Apple TV+'],['paramount+','Paramount+'],['peacock','Peacock'],['tubi','Tubi'],['pluto tv','Pluto TV'],['criterion channel','Criterion Channel'],['mubi','MUBI'],['fubotv','fuboTV']
];

const DIRECTORS = new Set(['quentin tarantino','martin scorsese','christopher nolan','spike lee','steven spielberg','clint eastwood','francis ford coppola','ridley scott','james cameron','david fincher','paul thomas anderson','wes anderson','sofia coppola','greta gerwig','jordan peele']);

function cleanName(s='') {
  return s.replace(/^(?:where can i (?:find|watch)|show me|find me|find|show|list|give me)\s+(?:all\s+(?:of\s+)?)?/i,'')
    .replace(/^all\s+(?:of\s+)?/i,'')
    .replace(/\s+(?:movies|films)(?:\s+.*)?$/i,'')
    .trim().replace(/[?.!,]+$/,'');
}

export function detectPersonIntent(query='') {
  const raw = String(query).trim();
  const patterns = [
    { re:/\b(?:movies|films)\s+directed\s+by\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})/i, role:'director' },
    { re:/\b(?:all\s+(?:of\s+)?)?([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})\s+(?:movies|films)\b/i, role:null },
    { re:/\b(?:movies|films)\s+(?:with|starring|featuring)\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})/i, role:'cast' }
  ];
  for (const {re,role} of patterns) {
    const m = raw.match(re);
    if (!m?.[1]) continue;
    const name = cleanName(m[1]);
    if (name.split(/\s+/).length < 2 || name.length > 80) continue;
    const inferredRole = role || (DIRECTORS.has(name.toLowerCase()) ? 'director' : 'cast');
    return { kind:'person-filmography', personName:name, role:inferredRole, confidence:0.94 };
  }
  return null;
}

export function parseIntent(query='') {
  const raw = String(query).trim();
  const lower = raw.toLowerCase();
  const person = detectPersonIntent(raw);
  const provider = SERVICES.find(([alias]) => lower.includes(alias))?.[1] || null;
  const freeOnly = /\bfree\b|\bwithout paying\b|\bad[- ]supported\b/i.test(raw);
  const rentOnly = /\brent(?:al|ing)?\b/i.test(raw);
  const buyOnly = /\bbuy|purchase|own\b/i.test(raw);
  if (person) return { raw, ...person, titleQuery:null, provider, freeOnly, rentOnly, buyOnly };
  return { raw, kind:'catalog', personName:null, role:null, titleQuery:null, provider, freeOnly, rentOnly, buyOnly, confidence:0.7 };
}
