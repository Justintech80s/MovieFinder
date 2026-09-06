function availabilityRequested(intent={}){
  return Boolean(
    intent.provider || intent.freeOnly || intent.rentOnly || intent.buyOnly ||
    intent.maxPrice!=null || intent.availabilityRequired || intent.streamingOnly ||
    intent.filmographyView==='available'
  );
}

function resultSignal(result={}){
  const values=[result.retrievalScore,result.matchScore,result.confidence,result.dataConfidence]
    .map(Number)
    .filter(Number.isFinite);
  return values.length?Math.max(...values):0;
}

function hasLiveAvailability(result={}){
  return Array.isArray(result.offers) && result.offers.length>0;
}

function sourceCount(result={}){
  return Array.isArray(result.retrievalSources)?new Set(result.retrievalSources.filter(Boolean)).size:0;
}

export function assessSearchQuality({parsedIntent={},results=[]}={}){
  const list=Array.isArray(results)?results.filter(Boolean):[];
  const reasons=[];
  if(!list.length) reasons.push('no verified results');

  const signals=list.map(resultSignal);
  const bestSignal=signals.length?Math.max(...signals):0;
  const multiSource=list.some(result=>sourceCount(result)>=2);
  const needsAvailability=availabilityRequested(parsedIntent);
  const liveCount=list.filter(hasLiveAvailability).length;

  if(list.length && bestSignal<0.35 && !multiSource) reasons.push('low retrieval confidence');
  if(needsAvailability && liveCount===0) reasons.push('availability evidence missing');

  let score=0;
  if(list.length) score+=0.25;
  score+=Math.min(0.5,bestSignal*0.5);
  if(multiSource) score+=0.12;
  if(needsAvailability) score+=liveCount?0.13:0;
  else if(list.some(hasLiveAvailability)) score+=0.05;

  return {
    retry:reasons.length>0,
    score:+Math.min(1,score).toFixed(4),
    reasons,
    resultCount:list.length,
    bestSignal:+bestSignal.toFixed(4),
    liveAvailabilityCount:liveCount
  };
}

export function chooseVerifiedResponse(firstResponse={},retryResponse={}, {parsedIntent={}}={}){
  const firstQuality=assessSearchQuality({parsedIntent,results:firstResponse?.results});
  const retryQuality=assessSearchQuality({parsedIntent,results:retryResponse?.results});
  const useRetry=retryQuality.score>firstQuality.score;
  const chosen=useRetry?retryResponse:firstResponse;

  return {
    ...chosen,
    verificationRetry:{
      attempted:true,
      used:useRetry,
      firstMode:firstResponse?.reasoningMode||null,
      retryMode:retryResponse?.reasoningMode||null,
      firstQuality,
      retryQuality
    }
  };
}
