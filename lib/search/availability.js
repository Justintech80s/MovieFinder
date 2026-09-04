const TYPE_MAP={free:'FREE',ads:'ADS',flatrate:'FLATRATE',subscription:'FLATRATE',rent:'RENT',buy:'BUY'};
const ALIASES={'amazon prime video':'Prime Video','amazon prime':'Prime Video','hbo max':'Max','max':'Max','apple tv plus':'Apple TV+','disney plus':'Disney+','paramount plus':'Paramount+'};
const TIMELINE_STATUSES=new Set(['NOW','UPCOMING','ANNOUNCED','UNKNOWN']);
const norm=s=>String(s||'').toLowerCase().replace(/\+/g,' plus ').replace(/[^a-z0-9]+/g,' ').trim();
const normalizeType=value=>TYPE_MAP[norm(value)]||(value||'UNKNOWN').toUpperCase();
const priceLabel=(type,price,currency='USD')=>{
  if(['FREE','ADS'].includes(type)) return 'Free';
  if(price==null||!Number.isFinite(Number(price))) return null;
  if(currency==='USD') return `$${Number(price).toFixed(2)}`;
  return `${Number(price).toFixed(2)} ${currency}`;
};
const providerLogo=o=>{
  const raw=o?.providerLogo||o?.logo||o?.package?.icon||o?.package?.logo||o?.package?.image||null;
  if(!raw) return null;
  const value=String(raw).replace('{profile}','s100');
  if(/^https:\/\//i.test(value)) return value;
  if(value.startsWith('/')) return `https://images.justwatch.com${value}`;
  return null;
};
const safeUrl=value=>{
  if(!value) return null;
  try{
    const url=new URL(String(value));
    return ['http:','https:'].includes(url.protocol)?url.toString():null;
  }catch{return null;}
};
const qualityRank={SD:0,HD:1,'4K':2,UHD:2,BLURAY:3};

export function normalizeProvider(name=''){
  const n=norm(name);
  return ALIASES[n]||String(name||'Unknown provider').trim();
}

export function toTimelineEntry(offer={}, options={}){
  const checkedAt=options.checkedAt||offer.sourceCheckedAt||new Date().toISOString();
  const current=options.current!==false;
  const availableFrom=offer.availableFrom||options.availableFrom||null;
  const availableUntil=offer.availableUntil||options.availableUntil||null;
  let status=TIMELINE_STATUSES.has(options.status)?options.status:null;
  if(!status){
    if(current) status='NOW';
    else if(availableFrom){
      const from=Date.parse(availableFrom);
      const checked=Date.parse(checkedAt);
      status=Number.isFinite(from)&&Number.isFinite(checked)&&from>checked?'UPCOMING':'UNKNOWN';
    } else if(options.announced===true) status='ANNOUNCED';
    else status='UNKNOWN';
  }
  const type=normalizeType(offer.type||offer.monetizationType);
  const rawPrice=offer.price??offer.retailPriceValue??null;
  const price=rawPrice==null||!Number.isFinite(Number(rawPrice))?null:Number(rawPrice);
  const currency=offer.currency||'USD';
  return {
    provider:normalizeProvider(offer.provider||offer.package?.clearName||offer.package?.shortName||offer.package?.technicalName),
    region:options.region||offer.region||'US',
    accessType:type,
    status,
    availableFrom,
    availableUntil,
    price,
    currency,
    source:options.source||offer.source||(current?'current U.S. availability feed':'announced availability source'),
    sourceCheckedAt:checkedAt,
    confidence:Number.isFinite(Number(options.confidence))?Number(options.confidence):(status==='NOW'?0.95:status==='UPCOMING'||status==='ANNOUNCED'?0.85:0.4)
  };
}

export function normalizeOffers(raw=[], options={}){
  return (raw||[]).map(o=>{
    const type=normalizeType(o.type||o.monetizationType);
    const rawPrice=o.price??o.retailPriceValue??null;
    const price=rawPrice==null||!Number.isFinite(Number(rawPrice))?null:Number(rawPrice);
    const currency=o.currency||'USD';
    const offer={
      provider:normalizeProvider(o.provider||o.package?.clearName||o.package?.shortName||o.package?.technicalName),
      providerLogo:providerLogo(o),
      type,
      price,
      currency,
      priceLabel:priceLabel(type,price,currency),
      quality:o.quality||o.presentationType||null,
      url:safeUrl(o.url||o.standardWebURL||o.webUrl||null)
    };
    return {...offer,timeline:toTimelineEntry(offer,{checkedAt:options.checkedAt,current:true,source:options.source,region:options.region})};
  });
}

export function filterOffers(offers,intent={}){
  return (offers||[]).filter(o=>(!intent.provider||norm(o.provider).includes(norm(intent.provider)))&&(!intent.freeOnly||['FREE','ADS'].includes(o.type))&&(!intent.rentOnly||o.type==='RENT')&&(!intent.buyOnly||o.type==='BUY'));
}


export function dedupeOffers(offers=[]){
  const groups=new Map();
  for(const offer of offers||[]){
    const key=`${norm(offer.provider)}|${normalizeType(offer.type)}`;
    const quality=String(offer.quality||'').toUpperCase();
    const existing=groups.get(key);
    if(!existing){
      groups.set(key,{...offer,qualities:quality?[quality]:[]});
      continue;
    }
    if(quality&&!existing.qualities.includes(quality)) existing.qualities.push(quality);
    const existingPrice=Number.isFinite(Number(existing.price))?Number(existing.price):null;
    const candidatePrice=Number.isFinite(Number(offer.price))?Number(offer.price):null;
    if(candidatePrice!==null&&(existingPrice===null||candidatePrice<existingPrice)){
      const qualities=existing.qualities;
      groups.set(key,{...offer,qualities});
    }else if(!existing.providerLogo&&offer.providerLogo){
      existing.providerLogo=offer.providerLogo;
    }
  }
  return [...groups.values()].map(offer=>({
    ...offer,
    qualities:[...offer.qualities].sort((a,b)=>(qualityRank[a]??9)-(qualityRank[b]??9))
  }));
}
