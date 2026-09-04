const SERVICES = [
  ['netflix','Netflix'],['hulu','Hulu'],['max','Max'],['hbo max','Max'],['prime video','Prime Video'],['amazon prime','Prime Video'],['disney+','Disney+'],['disney plus','Disney+'],['apple tv+','Apple TV+'],['paramount+','Paramount+'],['peacock','Peacock'],['tubi','Tubi'],['pluto tv','Pluto TV'],['criterion channel','Criterion Channel'],['mubi','MUBI'],['fubotv','fuboTV']
];

const GENRES = [
  {name:'horror', re:/\b(horror|scary|frightening|terrifying)\b/i},
  {name:'comedy', re:/\b(comedy|funny|hilarious)\b/i},
  {name:'action', re:/\baction\b/i},
  {name:'thriller', re:/\b(thriller|suspense)\b/i},
  {name:'drama', re:/\bdrama\b/i},
  {name:'romance', re:/\b(romance|romantic)\b/i},
  {name:'sci-fi', re:/\b(sci[- ]?fi|science fiction)\b/i},
  {name:'fantasy', re:/\bfantasy\b/i},
  {name:'documentary', re:/\b(documentary|docu)\b/i},
  {name:'animation', re:/\b(animation|animated)\b/i},
  {name:'crime', re:/\b(crime|gangster)\b/i},
  {name:'mystery', re:/\bmystery\b/i},
  {name:'war', re:/\bwar\b/i},
  {name:'western', re:/\bwestern\b/i},
  {name:'family', re:/\bfamily\b/i}
];

function cleanName(s='') {
  return s.replace(/^(?:where can i (?:find|watch)|show me|find me|find|show|list|give me)\s+(?:all\s+(?:of\s+)?)?/i,'')
    .replace(/^all\s+(?:of\s+)?/i,'')
    .replace(/\s+(?:movies|films)(?:\s+.*)?$/i,'')
    .replace(/\s+filmography$/i,'')
    .trim().replace(/[?.!,]+$/,'');
}

function validPersonName(name='') {
  const words = name.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 5 && name.length <= 80;
}

function similarityTitle(query='') {
  const match = String(query).match(/\b(?:movies?|films?)\s+like\s+(.+?)(?=\s+(?:with|that|which|on|streaming|available|from|about)\b|[?.!,]|$)/i);
  const title = String(match?.[1] || '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g,'').slice(0,160);
  return title || null;
}

export function detectPersonIntent(query='') {
  const raw = String(query).trim();
  const patterns = [
    { re:/\b(?:movies|films)\s+directed\s+by\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})/i, role:'director' },
    { re:/\b(?:movies|films)\s+produced\s+by\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})/i, role:'producer' },
    { re:/\b(?:movies|films)\s+(?:written|screenplay)\s+by\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})/i, role:'writer' },
    { re:/\b(?:movies|films)\s+(?:with|starring|featuring)\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})/i, role:'cast' },
    { re:/\ball\s+credits\s+for\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})/i, role:'all' },
    { re:/\b([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})\s+filmography\b/i, role:'all' },
    { re:/\b(?:all\s+(?:of\s+)?)?([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){1,4})\s+(?:movies|films)\b/i, role:'all' }
  ];
  for (const {re,role} of patterns) {
    const m = raw.match(re);
    if (!m?.[1]) continue;
    const name = cleanName(m[1]);
    if (!validPersonName(name)) continue;
    return { kind:'person-filmography', personName:name, role, confidence:0.94 };
  }
  return null;
}

export function parseIntent(query='') {
  const raw = String(query).trim();
  const lower = raw.toLowerCase();
  const person = detectPersonIntent(raw);
  const genreWords = [...new Set(GENRES.filter(g => g.re.test(raw)).map(g => g.name))];
  const rtMatch = raw.match(/(?:rotten\s+tomatoes|\brt\b)(?:\s+(?:score|rating))?(?:\s+of|\s*[:>=]+)?\s*(\d{1,3})(?:\s*%|\s*percent)?/i);
  const rtMin = rtMatch ? Math.min(100, Number(rtMatch[1])) : null;
  const decadeMatch = raw.match(/\b((?:19|20)\d)0s\b/i);
  const yearMatch = raw.match(/\b((?:19|20)\d{2})\b/);
  const seasonMatch = raw.match(/\bseason\s+(\d{1,2})\b/i);
  const requestedSeason = seasonMatch ? Number(seasonMatch[1]) : null;
  const mediaType = requestedSeason!=null || /\b(?:tv\s+show|tv\s+series|television\s+series|series)\b/i.test(raw)
    ? 'SHOW'
    : /\b(?:movie|movies|film|films)\b/i.test(raw) ? 'MOVIE' : null;
  const yearMin = decadeMatch ? Number(`${decadeMatch[1]}0`) : (yearMatch ? Number(yearMatch[1]) : null);
  const yearMax = decadeMatch ? yearMin + 9 : yearMin;
  const provider = SERVICES.find(([alias]) => lower.includes(alias))?.[1] || null;
  const freeOnly = /\bfree\b|\bwithout paying\b|\bad[- ]supported\b/i.test(raw);
  const rentOnly = /\brent(?:al|ing)?\b/i.test(raw);
  const buyOnly = /\bbuy\b|\bpurchase\b|\bown\b/i.test(raw);
  const availabilityIntent = Boolean(provider || freeOnly || rentOnly || buyOnly || /\bstream(?:ing)?\b|\bto stream\b|\bavailable(?:\s+now|\s+on|\s+to watch)?\b|\bwhere can i watch\b/i.test(raw));
  const filmographyView = availabilityIntent ? 'available' : 'complete';
  const relatedTitle = similarityTitle(raw);
  if (person) return { raw, ...person, titleQuery:null, similarityTitle:null, provider, freeOnly, rentOnly, buyOnly, filmographyView, genreWords, rtMin, yearMin, yearMax, mediaType, requestedSeason };
  return { raw, kind:'catalog', personName:null, role:null, titleQuery:null, similarityTitle:relatedTitle, provider, freeOnly, rentOnly, buyOnly, filmographyView:null, genreWords, rtMin, yearMin, yearMax, mediaType, requestedSeason, confidence:0.7 };
}
