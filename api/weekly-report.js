import { createAnalyticsStore } from '../lib/analytics/store.js';
import { getWeeklyWindows, aggregateWeeklyReport, buildObservations } from '../lib/analytics/report.js';
import { renderWeeklyEmail, sendWeeklyEmail } from '../lib/analytics/email.js';

const REPORT_TIME_ZONE='America/New_York';
const RAW_RETENTION_MS=90*24*60*60*1000;

function localScheduleParts(date,timeZone=REPORT_TIME_ZONE){
  const formatter=new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{
    timeZone,weekday:'short',hour:'2-digit',hourCycle:'h23'
  });
  const parts=Object.fromEntries(formatter.formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return {weekday:parts.weekday,hour:Number(parts.hour)};
}

function cleanError(error){
  return String(error?.message||error||'weekly report failed').replace(/\s+/g,' ').trim().slice(0,240);
}

export function createWeeklyReportHandler({
  store=createAnalyticsStore(),
  sendEmail=sendWeeklyEmail,
  now=()=>new Date(),
  env=process.env,
  logger=console
}={}){
  return async function handler(req,res){
    if(!env?.CRON_SECRET||req?.headers?.authorization!==`Bearer ${env.CRON_SECRET}`){
      return res.status(401).json({success:false});
    }

    const runNow=now();
    const local=localScheduleParts(runNow);
    if(local.weekday!=='Mon'||![8,9].includes(local.hour)){
      return res.status(200).json({success:true,skipped:'outside_local_window'});
    }
    if(store?.enabled===false){
      return res.status(503).json({success:false,error:'Analytics store is not configured'});
    }

    const windows=getWeeklyWindows(runNow,REPORT_TIME_ZONE);
    const weekStart=windows.current.startKey;
    const weekEnd=windows.current.endKey;
    let currentEvents=[];

    try{
      const existing=await store.getReportRun(weekStart);
      if(existing?.status==='sent'){
        return res.status(200).json({success:true,skipped:'already_sent',week_start:weekStart});
      }

      await store.setReportRun({
        week_start:weekStart,
        week_end:weekEnd,
        generated_at:runNow.toISOString(),
        sent_at:null,
        status:'processing',
        event_count:0,
        last_error:null
      });

      [currentEvents]=await Promise.all([
        store.listEvents({start:windows.current.start,end:windows.current.end})
      ]);
      const comparisonEvents=await store.listEvents({start:windows.comparison.start,end:windows.comparison.end});
      const visitorKeys=[...new Set(currentEvents.map(event=>event?.visitor_key).filter(Boolean))];
      const priorVisitorKeys=await store.listPriorVisitorKeys(visitorKeys,windows.current.start);
      const summary=aggregateWeeklyReport({currentEvents,comparisonEvents,priorVisitorKeys,window:windows.current});
      summary.observations=buildObservations(summary);
      const message=renderWeeklyEmail(summary);

      await sendEmail({message,env});

      await store.setReportRun({
        week_start:weekStart,
        week_end:weekEnd,
        generated_at:runNow.toISOString(),
        sent_at:now().toISOString(),
        status:'sent',
        event_count:currentEvents.length,
        last_error:null
      });

      try{
        await store.deleteEventsBefore(new Date(runNow.getTime()-RAW_RETENTION_MS));
      }catch(error){
        logger?.warn?.('MovieFinder analytics cleanup failed',cleanError(error));
      }

      return res.status(200).json({success:true,week_start:weekStart,week_end:weekEnd,event_count:currentEvents.length});
    }catch(error){
      const lastError=cleanError(error);
      try{
        await store.setReportRun({
          week_start:weekStart,
          week_end:weekEnd,
          generated_at:runNow.toISOString(),
          sent_at:null,
          status:'failed',
          event_count:currentEvents.length,
          last_error:lastError
        });
      }catch(storeError){
        logger?.warn?.('MovieFinder analytics report status write failed',cleanError(storeError));
      }
      logger?.warn?.('MovieFinder weekly analytics report failed',lastError);
      return res.status(500).json({success:false,error:'Weekly analytics report failed'});
    }
  };
}

export default createWeeklyReportHandler();
