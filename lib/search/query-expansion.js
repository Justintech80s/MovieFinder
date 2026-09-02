const SYNONYMS=Object.freeze({
 'sci fi':['science fiction'],
 'science fiction':['sci fi'],
 gangster:['crime'],
 scary:['horror'],
 frightening:['horror'],
 terrifying:['horror'],
 romcom:['romantic comedy'],
 'rom com':['romantic comedy'],
 suspense:['thriller'],
 animated:['animation']
});

export function normalizeSearchText(value=''){
 return String(value).normalize('NFKD').replace(/[’']/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}

const unique=values=>[...new Set(values.filter(Boolean))];

export function expandSearchQuery(query=''){
 const original=String(query);
 const normalized=normalizeSearchText(original);
 const tokens=normalized?normalized.split(' '):[];
 const variants=[];
 for(const [term,expansions] of Object.entries(SYNONYMS)){
  const termTokens=term.split(' ');
  const phraseMatch=normalized.includes(term);
  const tokenMatch=termTokens.length===1&&tokens.includes(term);
  if(phraseMatch||tokenMatch) variants.push(...expansions);
 }
 const expandedTokens=unique([...tokens,...variants.flatMap(v=>normalizeSearchText(v).split(' '))]);
 return {original,normalized,tokens,expandedTokens,variants:unique(variants)};
}
