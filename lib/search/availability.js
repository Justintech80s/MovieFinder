const TYPE_MAP={free:'FREE',ads:'ADS',flatrate:'FLATRATE',subscription:'FLATRATE',rent:'RENT',buy:'BUY'};
const ALIASES={'amazon prime video':'Prime Video','amazon prime':'Prime Video','hbo max':'Max','max':'Max','apple tv plus':'Apple TV+','disney plus':'Disney+','paramount plus':'Paramount+'};
const norm=s=>String(s||'').toLowerCase().replace(/\+/g,' plus ').replace(/[^a-z0-9]+/g,' ').trim();
const priceLabel=(type,price,currency='USD')=>{
  if(['FREE','ADS'].includes(type)) return 'Free';
  if(price==null||!Number.isFinite(Number(price))) return null;
  if(currency==='USD') return `$${Number(price).toFixed(2)}`;
  return `${Number(price).toFixed(2)} ${currency}`;
};
export function normalizeProvider(name=''){const n=norm(name);return ALIASES[n]||String(name||'Unknown provider').trim();}
export function normalizeOffers(raw=[]){return (raw||[]).map(o=>{const type=TYPE_MAP[norm(o.type||o.monetizationType)]||(o.type||o.monetizationType||'UNKNOWN').toUpperCase();const price=o.price==null?null:Number(o.price);const currency=o.currency||'USD';return {provider:normalizeProvider(o.provider||o.package?.clearName||o.package?.shortName||o.package?.technicalName),type,price,currency,priceLabel:priceLabel(type,price,currency),quality:o.quality||o.presentationType||null,url:o.url||o.standardWebURL||o.webUrl||null};});}
export function filterOffers(offers,intent={}){return offers.filter(o=>(!intent.provider||norm(o.provider).includes(norm(intent.provider)))&&(!intent.freeOnly||['FREE','ADS'].includes(o.type))&&(!intent.rentOnly||o.type==='RENT')&&(!intent.buyOnly||o.type==='BUY'));}
