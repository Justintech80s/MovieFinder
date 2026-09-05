import { createCatalogEmbeddingMaintainer } from '../lib/ingestion/catalog-embedding-maintainer.js';
import { applyApiSecurityHeaders } from '../lib/security/api-security.js';

function boundedBatchSize(value){
  return Math.min(64,Math.max(1,Math.trunc(Number(value)||32)));
}

export function createEmbeddingRefreshHandler({
  env=process.env,
  maintainer=createCatalogEmbeddingMaintainer({env}),
  logger=console
}={}){
  return async function handler(req,res){
    applyApiSecurityHeaders(res);
    if(String(req?.method||'GET').toUpperCase()!=='GET'){
      res.setHeader?.('Allow','GET');
      return res.status(405).json({success:false,code:'METHOD_NOT_ALLOWED'});
    }
    if(!env?.CRON_SECRET||req?.headers?.authorization!==`Bearer ${env.CRON_SECRET}`){
      return res.status(401).json({success:false});
    }
    if(!maintainer?.run){
      return res.status(503).json({success:false,code:'EMBEDDING_MAINTAINER_NOT_CONFIGURED'});
    }

    const batchSize=boundedBatchSize(env.EMBEDDING_REFRESH_BATCH_SIZE);
    const results=[];
    let partialFailures=0;
    for(const mediaType of ['movies','shows']){
      try{
        results.push(await maintainer.run({mediaType,batchSize}));
      }catch{
        partialFailures+=1;
        logger?.warn?.(`MovieFinder embedding refresh failed for ${mediaType}`);
        results.push({processed:0,updated:0,failed:1,mediaType});
      }
    }
    const updated=results.reduce((sum,item)=>sum+(Number(item.updated)||0),0);
    const failed=results.reduce((sum,item)=>sum+(Number(item.failed)||0),0);
    return res.status(partialFailures?207:200).json({
      success:partialFailures===0,
      updated,
      failed,
      results
    });
  };
}

export default createEmbeddingRefreshHandler();
