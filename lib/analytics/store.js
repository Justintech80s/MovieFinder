function makeHeaders(serviceKey, extra={}){
  return {
    apikey:serviceKey,
    authorization:`Bearer ${serviceKey}`,
    'content-type':'application/json',
    ...extra
  };
}

function chunk(values,size){
  const out=[];
  for(let i=0;i<values.length;i+=size) out.push(values.slice(i,i+size));
  return out;
}

export function createAnalyticsStore({fetchImpl=globalThis.fetch,env=process.env}={}){
  const base=String(env?.SUPABASE_URL||'').replace(/\/+$/,'');
  const serviceKey=String(env?.SUPABASE_SERVICE_ROLE_KEY||'');
  const enabled=Boolean(base&&serviceKey&&fetchImpl);

  async function request(path,{method='GET',body,headers={}}={}){
    if(!enabled) return null;
    const response=await fetchImpl(`${base}${path}`,{
      method,
      headers:makeHeaders(serviceKey,headers),
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    if(!response.ok) throw new Error(`analytics store ${response.status}`);
    if(response.status===204) return null;
    return response.json();
  }

  return {
    enabled,

    async insertEvent(event){
      if(!enabled) return false;
      await request('/rest/v1/analytics_events',{
        method:'POST',
        headers:{Prefer:'return=minimal'},
        body:event
      });
      return true;
    },

    async listEvents({start,end}){
      if(!enabled) return [];
      const rows=[];
      const pageSize=1000;
      for(let offset=0;;offset+=pageSize){
        const params=new URLSearchParams({
          select:'*',
          occurred_at:`gte.${new Date(start).toISOString()}`
        });
        params.append('occurred_at',`lt.${new Date(end).toISOString()}`);
        params.set('order','occurred_at.asc');
        const page=await request(`/rest/v1/analytics_events?${params.toString()}`,{
          headers:{Range:`${offset}-${offset+pageSize-1}`}
        })||[];
        rows.push(...page);
        if(page.length<pageSize) break;
      }
      return rows;
    },

    async listPriorVisitorKeys(visitorKeys,before){
      if(!enabled||!visitorKeys?.length) return new Set();
      const found=new Set();
      for(const group of chunk([...new Set(visitorKeys)],100)){
        const params=new URLSearchParams({
          select:'visitor_key',
          visitor_key:`in.(${group.join(',')})`,
          occurred_at:`lt.${new Date(before).toISOString()}`
        });
        const rows=await request(`/rest/v1/analytics_events?${params.toString()}`)||[];
        for(const row of rows) if(row?.visitor_key) found.add(row.visitor_key);
      }
      return found;
    },

    async getReportRun(weekStart){
      if(!enabled) return null;
      const params=new URLSearchParams({select:'*',week_start:`eq.${weekStart}`,limit:'1'});
      const rows=await request(`/rest/v1/analytics_report_runs?${params.toString()}`)||[];
      return rows[0]||null;
    },

    async setReportRun(run){
      if(!enabled) return false;
      await request('/rest/v1/analytics_report_runs',{
        method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
        body:run
      });
      return true;
    },

    async deleteEventsBefore(cutoff){
      if(!enabled) return false;
      const params=new URLSearchParams({occurred_at:`lt.${new Date(cutoff).toISOString()}`});
      await request(`/rest/v1/analytics_events?${params.toString()}`,{
        method:'DELETE',
        headers:{Prefer:'return=minimal'}
      });
      return true;
    }
  };
}
