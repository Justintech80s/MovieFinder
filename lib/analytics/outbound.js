import { createHmac, timingSafeEqual } from 'node:crypto';

function sign(body,secret){
  return createHmac('sha256',secret).update(body).digest('base64url');
}

function approvedPayload(payload,exp){
  return {
    destination:String(payload?.destination||''),
    movieId:payload?.movieId==null?null:String(payload.movieId).slice(0,160),
    movieTitle:payload?.movieTitle==null?null:String(payload.movieTitle).slice(0,240),
    movieYear:Number.isInteger(Number(payload?.movieYear))?Number(payload.movieYear):null,
    provider:payload?.provider==null?null:String(payload.provider).slice(0,160),
    monetizationType:payload?.monetizationType==null?null:String(payload.monetizationType).slice(0,40),
    price:payload?.price==null||!Number.isFinite(Number(payload.price))?null:Number(payload.price),
    exp
  };
}

export function createOutboundToken(payload,secret,{nowMs=Date.now(),ttlMs=10*60*1000}={}){
  if(!secret) throw new Error('outbound secret is required');
  const body=Buffer.from(JSON.stringify(approvedPayload(payload,nowMs+ttlMs))).toString('base64url');
  return `${body}.${sign(body,secret)}`;
}

export function verifyOutboundToken(token,secret,{nowMs=Date.now()}={}){
  if(!secret) throw new Error('outbound secret is required');
  const parts=String(token||'').split('.');
  if(parts.length!==2||!parts[0]||!parts[1]) throw new Error('invalid outbound token');
  const [body,provided]=parts;
  const expected=sign(body,secret);
  const a=Buffer.from(provided);
  const b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b)) throw new Error('invalid outbound token signature');

  let payload;
  try{
    payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  }catch{
    throw new Error('invalid outbound token payload');
  }
  if(!Number.isFinite(payload?.exp)||nowMs>payload.exp) throw new Error('expired outbound token');
  let destination;
  try{
    destination=new URL(payload.destination);
  }catch{
    throw new Error('invalid outbound destination');
  }
  if(!['http:','https:'].includes(destination.protocol)) throw new Error('invalid outbound destination protocol');
  return {...payload,destination:destination.toString()};
}

function trackedOffer(movie,offer,secret,options){
  if(!offer?.url) return offer;
  const token=createOutboundToken({
    destination:offer.url,
    movieId:movie?.id,
    movieTitle:movie?.title,
    movieYear:movie?.year,
    provider:offer.provider,
    monetizationType:offer.type,
    price:offer.price
  },secret,options);
  return {...offer,url:`/api/out?token=${encodeURIComponent(token)}`};
}

export function trackMovieOfferUrls(movie,secret,options={}){
  if(!movie||!secret) return movie;
  const offers=(movie.offers||[]).map(offer=>trackedOffer(movie,offer,secret,options));
  const best=movie.best?trackedOffer(movie,movie.best,secret,options):movie.best;
  return {...movie,offers,best};
}
